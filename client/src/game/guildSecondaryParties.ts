import { getPartySizeLimit } from "./leveling";
import { isGuildTavernServiceAvailable } from "./guildTavern";
import { getInnRoomCapacity, INN_ROOM_BASE_CAPACITY } from "./innRoomUpgrades";
import {
  getGuildSecondaryPartyCount,
  getGuildSecondaryPartyMemberSlotCount,
} from "./guildRecruitUpgrades";
import { pruneMissingEntityRuntimeState } from "./mapRuntimeCleanup";
import { isPositionAvailable } from "./movementPlanning";
import {
  getActiveCompanions,
  getPartyLeader,
  getRestingCompanions,
  recordHighestCharacterLevelEver,
} from "./partySystem";
import type { GameState } from "./state";
import type {
  Companion,
  GuildRosterSlotRef,
  GuildSecondaryPartiesState,
  GuildSecondaryParty,
  Position,
} from "./types";

export const GUILD_INN_COMPANION_CAPACITY = INN_ROOM_BASE_CAPACITY;
export const GUILD_SECONDARY_PARTY_ID = "secondary-party-1";
export const GUILD_SECONDARY_PARTY_SLOT_COUNT = 1;
export const GUILD_SECONDARY_PARTY_IDS = [
  "secondary-party-1",
  "secondary-party-2",
  "secondary-party-3",
];

const ROSTER_REJOIN_OFFSETS: Position[] = [
  { x: 2.5, y: 0 },
  { x: -2.5, y: 0 },
  { x: 0, y: 2.5 },
  { x: 0, y: -2.5 },
  { x: 2, y: 2 },
  { x: -2, y: 2 },
  { x: 2, y: -2 },
  { x: -2, y: -2 },
  { x: 3.25, y: 0 },
  { x: -3.25, y: 0 },
  { x: 0, y: 3.25 },
  { x: 0, y: -3.25 },
];

export type GuildRosterMoveFailureReason =
  | "unknown_companion"
  | "invalid_target"
  | "locked_main_party_slot"
  | "main_party_requires_companion"
  | "party_assigned";

export type GuildRosterMoveResult =
  | {
      ok: true;
      state: GameState;
      movedCompanionId: string;
    }
  | {
      ok: false;
      state: GameState;
      reason: GuildRosterMoveFailureReason;
    };

type RosterLocation =
  | {
      area: "main_party";
      slotIndex: number;
    }
  | {
      area: "inn_reserve";
      slotIndex: number;
    }
  | {
      area: "secondary_party";
      partyId: string;
      slotIndex: number;
    };

export function createInitialGuildSecondaryPartiesState(): GuildSecondaryPartiesState {
  return {
    parties: GUILD_SECONDARY_PARTY_IDS.map((partyId, index) => ({
      id: partyId,
      displayName: getFieldTeamDisplayName(index),
      companionIds: Array.from(
        { length: GUILD_SECONDARY_PARTY_SLOT_COUNT },
        () => null,
      ),
      assignment: null,
    })),
  };
}

export function getGuildSecondaryPartiesState(
  state: GameState,
): GuildSecondaryPartiesState {
  return sanitizeGuildSecondaryPartiesState(
    state.guildSecondaryParties,
    state.restingCompanionsById,
    state,
  );
}

export function sanitizeGuildSecondaryPartiesState(
  guildSecondaryParties: GuildSecondaryPartiesState | undefined,
  restingCompanionsById: GameState["restingCompanionsById"] = {},
  state?: GameState,
): GuildSecondaryPartiesState {
  const restingIds = new Set(Object.keys(restingCompanionsById ?? {}));
  const assignedIds = new Set<string>();
  const unlockedPartyCount = state ? getGuildSecondaryPartyCount(state) : 0;

  return {
    parties: createInitialGuildSecondaryPartiesState().parties.map(
      (defaultParty, index) => {
        const incomingParty = guildSecondaryParties?.parties?.[index];
        const incomingIds = Array.isArray(incomingParty?.companionIds)
          ? incomingParty.companionIds
          : [];
        const isUnlocked = index < unlockedPartyCount;
        const slotCount = isUnlocked && state
          ? getGuildSecondaryPartyMemberSlotCount(state, defaultParty.id)
          : defaultParty.companionIds.length;

        return {
          id:
            typeof incomingParty?.id === "string" && incomingParty.id
              ? incomingParty.id
              : defaultParty.id,
          displayName: defaultParty.displayName,
          companionIds: Array.from({ length: slotCount }, (_, slotIndex) => {
            const companionId = incomingIds[slotIndex];

            if (
              !isUnlocked ||
              typeof companionId !== "string" ||
              !restingIds.has(companionId) ||
              assignedIds.has(companionId)
            ) {
              return null;
            }

            assignedIds.add(companionId);
            return companionId;
          }),
          assignment: isUnlocked
            ? sanitizeAssignmentState(
                incomingParty?.assignment ??
                  (incomingParty as Partial<{ dispatch: GuildSecondaryParty["assignment"] }> | undefined)
                    ?.dispatch,
              )
            : null,
        };
      },
    ),
  };
}

function getFieldTeamDisplayName(index: number): string {
  return `Field Team ${index + 1}`;
}

export function getSecondaryPartyAssignedCompanionIds(
  state: GameState,
): Set<string> {
  const secondaryParties = getGuildSecondaryPartiesState(state);

  return new Set(
    secondaryParties.parties.flatMap((party) =>
      party.companionIds.filter((companionId): companionId is string =>
        typeof companionId === "string",
      ),
    ),
  );
}

export function getInnReserveCompanions(state: GameState): Companion[] {
  const assignedIds = getSecondaryPartyAssignedCompanionIds(state);

  return getRestingCompanions(state)
    .filter((companion) => !assignedIds.has(companion.id))
    .sort(compareRosterCompanions);
}

export function getTotalRosterCompanionCount(state: GameState): number {
  return getActiveCompanions(state).length + getRestingCompanions(state).length;
}

export function getTotalRosterCompanionLevel(state: GameState): number {
  return [...getActiveCompanions(state), ...getRestingCompanions(state)].reduce(
    (totalLevel, companion) => totalLevel + sanitizeCharacterLevel(companion),
    0,
  );
}

export function getGuildCompanionCapacity(state?: GameState): number {
  return getInnRoomCapacity(state);
}

export function moveGuildRosterCompanion(
  state: GameState,
  companionId: string,
  target: GuildRosterSlotRef,
): GuildRosterMoveResult {
  const normalizedState: GameState = {
    ...state,
    guildSecondaryParties: getGuildSecondaryPartiesState(state),
  };
  const allCompanionsById = getAllRosterCompanionsById(normalizedState);
  const movingCompanion = allCompanionsById[companionId];

  if (!movingCompanion) {
    return {
      ok: false,
      state: normalizedState,
      reason: "unknown_companion",
    };
  }

  const source = findCompanionLocation(normalizedState, companionId);

  if (!source || !isValidRosterTarget(normalizedState, target)) {
    return {
      ok: false,
      state: normalizedState,
      reason:
        target.area === "main_party" &&
        target.slotIndex >= getPartySizeLimit(normalizedState)
          ? "locked_main_party_slot"
          : "invalid_target",
    };
  }

  if (isRosterLocationAssigned(normalizedState, source) || isRosterLocationAssigned(normalizedState, target)) {
    return {
      ok: false,
      state: normalizedState,
      reason: "party_assigned",
    };
  }

  const activeIds = getActiveCompanions(normalizedState)
    .sort(compareRosterCompanions)
    .map((companion) => companion.id);
  const reserveIds = getInnReserveCompanions(normalizedState).map(
    (companion) => companion.id,
  );
  const secondaryParties = cloneSecondaryParties(
    normalizedState.guildSecondaryParties,
  );
  const targetOccupantId = getOccupantId(
    activeIds,
    reserveIds,
    secondaryParties,
    target,
  );

  if (
    source.area === target.area &&
    source.slotIndex === target.slotIndex &&
    (source.area !== "secondary_party" ||
      (target.area === "secondary_party" && source.partyId === target.partyId))
  ) {
    return {
      ok: true,
      state: normalizedState,
      movedCompanionId: companionId,
    };
  }

  if (
    source.area === "main_party" &&
    target.area !== "main_party" &&
    activeIds.length <= 1 &&
    !targetOccupantId
  ) {
    return {
      ok: false,
      state: normalizedState,
      reason: "main_party_requires_companion",
    };
  }

  if (isSameRosterContainer(source, target)) {
    moveWithinLocation(activeIds, reserveIds, secondaryParties, source, target);
  } else {
    removeFromLocation(activeIds, reserveIds, secondaryParties, source);

    if (targetOccupantId) {
      removeFromLocation(activeIds, reserveIds, secondaryParties, target);
    }

    placeAtLocation(activeIds, reserveIds, secondaryParties, target, companionId);

    if (targetOccupantId) {
      placeAtLocation(
        activeIds,
        reserveIds,
        secondaryParties,
        source,
        targetOccupantId,
      );
    }
  }

  const nextActiveIds = activeIds.filter((id): id is string => Boolean(id));

  if (nextActiveIds.length <= 0) {
    return {
      ok: false,
      state: normalizedState,
      reason: "main_party_requires_companion",
    };
  }

  const leader = getPartyLeader(normalizedState);
  const nextLeaderId = getNextLeaderId(
    normalizedState.partyLeaderId,
    source,
    targetOccupantId,
    nextActiveIds,
  );
  const spawnOrigin = leader?.position ?? getFirstCompanionPosition(normalizedState);
  const nextEntities = createEntitiesForActiveRoster(
    normalizedState,
    allCompanionsById,
    nextActiveIds,
    nextLeaderId,
    normalizedState.partyLeaderId,
    spawnOrigin,
  );
  const nextRestingCompanionsById = createRestingCompanionsForRoster(
    allCompanionsById,
    nextActiveIds,
    reserveIds,
    secondaryParties,
  );
  const nextState = preserveGuildTavernInteractionRange(
    normalizedState,
    pruneMissingEntityRuntimeState(
      recordHighestCharacterLevelEver(
        {
          ...normalizedState,
          entities: nextEntities,
          restingCompanionsById: nextRestingCompanionsById,
          guildSecondaryParties: {
            parties: secondaryParties,
          },
          partyLeaderId: nextLeaderId,
          autoModeEnabled: false,
          autoRoute: undefined,
          worldTravelTargetMapId: null,
          partyIntent: null,
          leaderIntent: null,
          directCompanionCommandsById: {},
          directCommandGraceUntilByCompanionId: {},
          globalPoiIntent: null,
          localPoiTarget: null,
          lastPoiDecision: undefined,
          interruptedPoiTarget: null,
          partyFormation: undefined,
          moveIntentsByEntityId: {},
          reservedPositionsByEntityId: {},
          movementPathsByEntityId: {},
        },
        movingCompanion.characterLevel,
      ),
    ),
    spawnOrigin,
  );

  return {
    ok: true,
    state: nextState,
    movedCompanionId: companionId,
  };
}

function preserveGuildTavernInteractionRange(
  previousState: GameState,
  nextState: GameState,
  interactionPosition: Position,
): GameState {
  if (
    !isGuildTavernServiceAvailable(previousState) ||
    isGuildTavernServiceAvailable(nextState)
  ) {
    return nextState;
  }

  const leader = nextState.entities[nextState.partyLeaderId];

  if (leader?.kind !== "companion") {
    return nextState;
  }

  return {
    ...nextState,
    entities: {
      ...nextState.entities,
      [leader.id]: {
        ...leader,
        position: interactionPosition,
        state: "idle",
        currentTargetId: null,
        followTargetId: leader.id,
      },
    },
    followTrailsByEntityId: {
      ...nextState.followTrailsByEntityId,
      [leader.id]: [],
    },
  };
}

function findCompanionLocation(
  state: GameState,
  companionId: string,
): RosterLocation | null {
  const activeIndex = getActiveCompanions(state)
    .sort(compareRosterCompanions)
    .findIndex((companion) => companion.id === companionId);

  if (activeIndex >= 0) {
    return {
      area: "main_party",
      slotIndex: activeIndex,
    };
  }

  const secondaryParties = getGuildSecondaryPartiesState(state);

  for (const party of secondaryParties.parties) {
    const slotIndex = party.companionIds.indexOf(companionId);

    if (slotIndex >= 0) {
      return {
        area: "secondary_party",
        partyId: party.id,
        slotIndex,
      };
    }
  }

  const reserveIndex = getInnReserveCompanions(state).findIndex(
    (companion) => companion.id === companionId,
  );

  if (reserveIndex >= 0) {
    return {
      area: "inn_reserve",
      slotIndex: reserveIndex,
    };
  }

  return null;
}

function isValidRosterTarget(
  state: GameState,
  target: GuildRosterSlotRef,
): boolean {
  if (target.slotIndex < 0 || !Number.isInteger(target.slotIndex)) {
    return false;
  }

  if (target.area === "main_party") {
    return target.slotIndex < getPartySizeLimit(state);
  }

  if (target.area === "inn_reserve") {
    return true;
  }

  const secondaryParty = getGuildSecondaryPartiesState(state).parties.find(
    (party) => party.id === target.partyId,
  );
  const partyNumber = GUILD_SECONDARY_PARTY_IDS.indexOf(target.partyId) + 1;

  return Boolean(
    secondaryParty &&
      partyNumber > 0 &&
      partyNumber <= getGuildSecondaryPartyCount(state) &&
      target.slotIndex < secondaryParty.companionIds.length,
  );
}

function isRosterLocationAssigned(
  state: GameState,
  location: RosterLocation | GuildRosterSlotRef,
): boolean {
  if (location.area !== "secondary_party") {
    return false;
  }

  return Boolean(
    getGuildSecondaryPartiesState(state).parties.find(
      (party) => party.id === location.partyId,
    )?.assignment,
  );
}

function getOccupantId(
  activeIds: string[],
  reserveIds: string[],
  secondaryParties: GuildSecondaryParty[],
  location: GuildRosterSlotRef,
): string | null {
  if (location.area === "main_party") {
    return activeIds[location.slotIndex] ?? null;
  }

  if (location.area === "inn_reserve") {
    return reserveIds[location.slotIndex] ?? null;
  }

  return (
    secondaryParties
      .find((party) => party.id === location.partyId)
      ?.companionIds[location.slotIndex] ?? null
  );
}

function removeFromLocation(
  activeIds: string[],
  reserveIds: string[],
  secondaryParties: GuildSecondaryParty[],
  location: RosterLocation | GuildRosterSlotRef,
): void {
  if (location.area === "main_party") {
    activeIds.splice(location.slotIndex, 1);
    return;
  }

  if (location.area === "inn_reserve") {
    reserveIds.splice(location.slotIndex, 1);
    return;
  }

  const party = secondaryParties.find((item) => item.id === location.partyId);

  if (party) {
    party.companionIds[location.slotIndex] = null;
  }
}

function placeAtLocation(
  activeIds: string[],
  reserveIds: string[],
  secondaryParties: GuildSecondaryParty[],
  location: RosterLocation | GuildRosterSlotRef,
  companionId: string,
): void {
  if (location.area === "main_party") {
    activeIds.splice(
      Math.min(location.slotIndex, activeIds.length),
      0,
      companionId,
    );
    return;
  }

  if (location.area === "inn_reserve") {
    reserveIds.splice(
      Math.min(location.slotIndex, reserveIds.length),
      0,
      companionId,
    );
    return;
  }

  const party = secondaryParties.find((item) => item.id === location.partyId);

  if (party) {
    party.companionIds[location.slotIndex] = companionId;
  }
}

function isSameRosterContainer(
  source: RosterLocation,
  target: GuildRosterSlotRef,
): boolean {
  if (source.area !== target.area) {
    return false;
  }

  if (source.area !== "secondary_party") {
    return true;
  }

  return target.area === "secondary_party" && source.partyId === target.partyId;
}

function moveWithinLocation(
  activeIds: string[],
  reserveIds: string[],
  secondaryParties: GuildSecondaryParty[],
  source: RosterLocation,
  target: GuildRosterSlotRef,
): void {
  if (source.area === "main_party" && target.area === "main_party") {
    moveWithinArray(activeIds, source.slotIndex, target.slotIndex);
    return;
  }

  if (source.area === "inn_reserve" && target.area === "inn_reserve") {
    moveWithinArray(reserveIds, source.slotIndex, target.slotIndex);
    return;
  }

  if (source.area === "secondary_party" && target.area === "secondary_party") {
    const party = secondaryParties.find((item) => item.id === source.partyId);

    if (!party) {
      return;
    }

    const sourceCompanionId = party.companionIds[source.slotIndex] ?? null;
    party.companionIds[source.slotIndex] =
      party.companionIds[target.slotIndex] ?? null;
    party.companionIds[target.slotIndex] = sourceCompanionId;
  }
}

function moveWithinArray(
  companionIds: string[],
  sourceIndex: number,
  targetIndex: number,
): void {
  if (targetIndex < companionIds.length) {
    const sourceCompanionId = companionIds[sourceIndex];
    companionIds[sourceIndex] = companionIds[targetIndex];
    companionIds[targetIndex] = sourceCompanionId;
    return;
  }

  const [sourceCompanionId] = companionIds.splice(sourceIndex, 1);

  if (sourceCompanionId) {
    companionIds.splice(Math.min(targetIndex, companionIds.length), 0, sourceCompanionId);
  }
}

function cloneSecondaryParties(
  guildSecondaryParties: GuildSecondaryPartiesState | undefined,
): GuildSecondaryParty[] {
  return (
    guildSecondaryParties ?? createInitialGuildSecondaryPartiesState()
  ).parties.map((party) => ({
    ...party,
    companionIds: [...party.companionIds],
    assignment: party.assignment ? { ...party.assignment } : null,
  }));
}

function getAllRosterCompanionsById(
  state: GameState,
): Record<string, Companion> {
  return Object.fromEntries(
    [...getActiveCompanions(state), ...getRestingCompanions(state)].map(
      (companion) => [companion.id, companion],
    ),
  );
}

function createEntitiesForActiveRoster(
  state: GameState,
  allCompanionsById: Record<string, Companion>,
  activeIds: string[],
  leaderId: string,
  previousLeaderId: string,
  spawnOrigin: Position,
): GameState["entities"] {
  const activeIdSet = new Set(activeIds);
  const nextEntities = Object.fromEntries(
    Object.entries(state.entities).filter(
      ([, entity]) => entity.kind !== "companion" || activeIdSet.has(entity.id),
    ),
  );

  activeIds.forEach((companionId, index) => {
    const companion = allCompanionsById[companionId];

    if (!companion) {
      return;
    }

    const wasActive = state.entities[companion.id]?.kind === "companion";
    const isIncomingLeader = companion.id === leaderId && leaderId !== previousLeaderId;

    nextEntities[companion.id] = {
      ...companion,
      position: isIncomingLeader
        ? spawnOrigin
        : wasActive
        ? companion.position
        : getRosterSpawnPosition(
            state,
            nextEntities,
            companion.id,
            spawnOrigin,
            index,
          ),
      state: "idle",
      currentTargetId: null,
      commandPriority: "autonomous",
      defendPosition: null,
      followTargetId: companion.id === leaderId ? companion.id : leaderId,
      partyOrder: index,
      consumableBuffs: {
        flask: null,
      },
    };
  });

  return nextEntities;
}

function createRestingCompanionsForRoster(
  allCompanionsById: Record<string, Companion>,
  activeIds: string[],
  reserveIds: string[],
  secondaryParties: GuildSecondaryParty[],
): GameState["restingCompanionsById"] {
  const activeIdSet = new Set(activeIds);
  const restingIds = [
    ...reserveIds,
    ...secondaryParties.flatMap((party) =>
      party.companionIds.filter((companionId): companionId is string =>
        typeof companionId === "string",
      ),
    ),
  ];

  return Object.fromEntries(
    restingIds
      .filter((companionId) => !activeIdSet.has(companionId))
      .map((companionId, index) => [
        companionId,
        sanitizeRestingCompanion(allCompanionsById[companionId], index),
      ])
      .filter((entry): entry is [string, Companion] => Boolean(entry[1])),
  );
}

function sanitizeRestingCompanion(
  companion: Companion | undefined,
  partyOrder: number,
): Companion | undefined {
  if (!companion) {
    return undefined;
  }

  return {
    ...companion,
    state: "idle",
    currentTargetId: null,
    commandPriority: "autonomous",
    defendPosition: null,
    partyOrder,
    consumableBuffs: {
      flask: null,
    },
  };
}

function getNextLeaderId(
  previousLeaderId: string,
  source: RosterLocation,
  targetOccupantId: string | null,
  activeIds: string[],
): string {
  if (activeIds.includes(previousLeaderId)) {
    return previousLeaderId;
  }

  if (
    source.area === "main_party" &&
    targetOccupantId &&
    activeIds.includes(targetOccupantId)
  ) {
    return targetOccupantId;
  }

  return activeIds[0];
}

function getFirstCompanionPosition(state: GameState): Position {
  const companion = getActiveCompanions(state)[0] ?? getRestingCompanions(state)[0];

  return companion?.position ?? { x: 0, y: 0 };
}

function getRosterSpawnPosition(
  state: GameState,
  entities: GameState["entities"],
  companionId: string,
  origin: Position,
  partyOrder: number,
): Position {
  const temporaryState = {
    ...state,
    entities,
  };
  const rotatedOffsets = rotateRosterOffsets(partyOrder);
  const candidate = rotatedOffsets
    .map((offset) => ({
      x: origin.x + offset.x,
      y: origin.y + offset.y,
    }))
    .find((position) =>
      isPositionAvailable(temporaryState, position, {
        ignoredEntityId: companionId,
      }),
    );

  if (candidate) {
    return candidate;
  }

  return {
    x: origin.x + 0.5 + partyOrder * 0.35,
    y: origin.y + 0.5,
  };
}

function rotateRosterOffsets(partyOrder: number): Position[] {
  const offsetIndex = partyOrder % ROSTER_REJOIN_OFFSETS.length;

  return [
    ...ROSTER_REJOIN_OFFSETS.slice(offsetIndex),
    ...ROSTER_REJOIN_OFFSETS.slice(0, offsetIndex),
  ];
}

function compareRosterCompanions(a: Companion, b: Companion): number {
  return a.partyOrder - b.partyOrder || a.id.localeCompare(b.id);
}

function sanitizeCharacterLevel(companion: Companion): number {
  return Math.max(1, Math.floor(companion.characterLevel || 1));
}

function sanitizeAssignmentState(
  assignment: GuildSecondaryParty["assignment"],
): GuildSecondaryParty["assignment"] {
  if (
    !assignment ||
    (
      assignment.status !== "assigned" &&
      assignment.status !== "capped" &&
      assignment.status !== "pending_loot"
    )
  ) {
    return null;
  }

  return {
    ...assignment,
    status: assignment.status,
    pendingResult: assignment.pendingResult ?? null,
    pendingElapsedMs: Math.max(0, Math.floor(assignment.pendingElapsedMs ?? 0)),
  };
}
