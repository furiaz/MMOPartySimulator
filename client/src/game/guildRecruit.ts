import { createCompanion } from "./entities";
import { isClassAllowedForEquipment } from "./equipmentRules";
import {
  GUILD_INN_COMPANION_CAPACITY,
  getGuildCompanionCapacity,
  getTotalRosterCompanionCount,
} from "./guildSecondaryParties";
import {
  getGuildRecruitEquipmentChancePercent,
  getGuildRecruitLevelRange,
  getGuildRecruitRefreshIntervalMs,
  getGuildRecruitSkillChancePercent,
  getGuildRecruitSlotCount,
} from "./guildRecruitUpgrades";
import { ITEM_DEFINITIONS, getItemDefinition } from "./items";
import { getPartySizeLimit } from "./leveling";
import {
  getActiveCompanions,
  getPartyLeader,
  getRestingCompanions,
  recordHighestCharacterLevelEver,
} from "./partySystem";
import { SKILL_DEFINITIONS } from "./skills";
import { addEntity, type GameState } from "./state";
import {
  applyCompanionLevelUpStatGrowth,
  syncCompanionDerivedMaxHealth,
} from "./stats";
import {
  BEGINNER_SKILL_MAX_RANK,
  getCompanionSkillMaxRank,
  sanitizeProgressionForCompanion,
} from "./skillProgression";
import type {
  ClassId,
  Companion,
  EquipmentItemId,
  EquipmentSlot,
  GuildRecruitCandidate,
  GuildRecruitState,
  ItemDefinition,
  PartyMemberRole,
  Position,
  SkillId,
} from "./types";

export const GUILD_RECRUIT_REFRESH_INTERVAL_MS = 3 * 60 * 60 * 1000;
export const GUILD_RECRUIT_RESERVE_CAPACITY = GUILD_INN_COMPANION_CAPACITY;

export type GuildRecruitDestination =
  | "active_party"
  | "tavern_reserve"
  | "blocked_full";

export type GuildRecruitResult =
  | {
      ok: true;
      destination: Exclude<GuildRecruitDestination, "blocked_full">;
      companion: Companion;
      state: GameState;
    }
  | {
      ok: false;
      reason: "no_candidate" | "roster_full";
      state: GameState;
    };

export function createInitialGuildRecruitState(
  nowMs = Date.now(),
  state?: GameState,
): GuildRecruitState {
  return createGuildRecruitStateWithCandidates(state, 1, nowMs);
}

export function getGuildRecruitState(
  state: GameState,
  nowMs = Date.now(),
): GuildRecruitState {
  return refreshGuildRecruitState(state, nowMs).guildRecruit ??
    createInitialGuildRecruitState(nowMs, state);
}

export function refreshGuildRecruitState(
  state: GameState,
  nowMs = Date.now(),
): GameState {
  const hadGuildRecruit = Boolean(state.guildRecruit);
  const guildRecruit = sanitizeGuildRecruitState(
    state.guildRecruit,
    nowMs,
    state,
  );

  if (guildRecruit.nextRefreshAtMs > nowMs) {
    return hadGuildRecruit
      ? {
          ...state,
          guildRecruit,
        }
      : {
          ...state,
          guildRecruit,
        };
  }

  return {
    ...state,
    guildRecruit: createGuildRecruitStateWithCandidates(
      state,
      Math.max(1, guildRecruit.recruitSequence + 1),
      nowMs,
    ),
  };
}

export function recruitGuildCandidate(
  state: GameState,
  nowMs = Date.now(),
  candidateId?: string,
): GuildRecruitResult {
  const refreshedState = refreshGuildRecruitState(state, nowMs);
  const guildRecruit = getGuildRecruitState(refreshedState, nowMs);
  const candidateIndex = findRecruitCandidateIndex(guildRecruit, candidateId);
  const candidate =
    candidateIndex >= 0 ? guildRecruit.candidates[candidateIndex] : null;

  if (!candidate) {
    return {
      ok: false,
      reason: "no_candidate",
      state: refreshedState,
    };
  }

  const destination = getGuildRecruitDestination(refreshedState);

  if (destination === "blocked_full") {
    return {
      ok: false,
      reason: "roster_full",
      state: refreshedState,
    };
  }

  const recruitSequence = getAvailableRecruitSequence(
    refreshedState,
    candidate.sequence,
  );
  const companion = createCompanionFromRecruitCandidate(
    refreshedState,
    {
      ...candidate,
      sequence: recruitSequence,
    },
  );
  const restingCompanion: Companion = {
    ...companion,
    state: "idle",
    currentTargetId: null,
  };
  const nextCandidates = [...guildRecruit.candidates];
  nextCandidates[candidateIndex] = null;
  const nextGuildRecruit: GuildRecruitState = {
    ...guildRecruit,
    recruitSequence: Math.max(guildRecruit.recruitSequence, recruitSequence),
    candidates: nextCandidates,
  };
  const routedState =
    destination === "active_party"
      ? addEntity(refreshedState, companion)
      : {
          ...refreshedState,
          restingCompanionsById: {
            ...(refreshedState.restingCompanionsById ?? {}),
            [companion.id]: restingCompanion,
          },
        };

  return {
    ok: true,
    destination,
    companion,
    state: recordHighestCharacterLevelEver(
      {
        ...routedState,
        guildRecruit: nextGuildRecruit,
      },
      companion.characterLevel,
    ),
  };
}

export function getGuildRecruitDestination(
  state: GameState,
): GuildRecruitDestination {
  if (getTotalRosterCompanionCount(state) >= getGuildCompanionCapacity(state)) {
    return "blocked_full";
  }

  if (getActiveCompanions(state).length < getPartySizeLimit(state)) {
    return "active_party";
  }

  return "tavern_reserve";
}

export function getGuildRecruitReserveCapacity(state?: GameState): number {
  return getGuildCompanionCapacity(state);
}

export function sanitizeGuildRecruitState(
  guildRecruit: (GuildRecruitState & { candidate?: GuildRecruitCandidate | null }) | undefined,
  nowMs = Date.now(),
  state?: GameState,
): GuildRecruitState {
  if (!guildRecruit) {
    return createInitialGuildRecruitState(nowMs, state);
  }

  const recruitSequence = sanitizeSequence(guildRecruit.recruitSequence);
  const incomingCandidates = Array.isArray(guildRecruit.candidates)
    ? guildRecruit.candidates
    : [guildRecruit.candidate ?? null];
  const candidates = incomingCandidates.map((candidate, index) =>
    sanitizeGuildRecruitCandidate(
      candidate,
      recruitSequence + index,
      nowMs,
    ),
  );
  const nextRefreshAtMs = sanitizeTimestamp(
    guildRecruit.nextRefreshAtMs,
    nowMs + getRecruitRefreshIntervalMs(state),
  );

  return {
    candidates: candidates.length > 0 ? candidates : [null],
    nextRefreshAtMs,
    recruitSequence,
  };
}

function createGuildRecruitStateWithCandidates(
  state: GameState | undefined,
  startingSequence: number,
  nowMs: number,
): GuildRecruitState {
  const slotCount = state ? getGuildRecruitSlotCount(state) : 1;
  const candidates: Array<GuildRecruitCandidate | null> = [];
  let nextSequence = sanitizeSequence(startingSequence);

  for (let slotIndex = 0; slotIndex < slotCount; slotIndex += 1) {
    const sequence = state
      ? getAvailableRecruitSequence(state, nextSequence)
      : nextSequence;
    candidates.push(createGuildRecruitCandidate(state, sequence, slotIndex, nowMs));
    nextSequence = sequence + 1;
  }

  return {
    candidates,
    nextRefreshAtMs: nowMs + getRecruitRefreshIntervalMs(state),
    recruitSequence: Math.max(1, nextSequence - 1),
  };
}

function createCompanionFromRecruitCandidate(
  state: GameState,
  candidate: GuildRecruitCandidate,
): Companion {
  const leader = getPartyLeader(state);
  const activeCompanions = getActiveCompanions(state);
  const position = getRecruitSpawnPosition(leader?.position);
  const followTargetId = leader?.id ?? state.partyLeaderId ?? candidate.id;
  const partyOrder = activeCompanions.length;
  const level = sanitizeCharacterLevel(candidate.characterLevel);
  const baseCompanion = createCompanion(
    `guild-recruit-${candidate.sequence}`,
    position,
    followTargetId,
    candidate.role,
    partyOrder,
    candidate.classId,
  );
  const leveledCompanion = applyCompanionLevelUpStatGrowth(
    {
      ...baseCompanion,
      characterLevel: level,
      characterXp: 0,
      lastCharacterXpGained: 0,
    },
    level - baseCompanion.characterLevel,
  );
  const equippedCompanion = applyRecruitStartingEquipment(
    leveledCompanion,
    candidate.equipmentItemIds ?? [],
  );

  return applyRecruitStartingSkills(
    equippedCompanion,
    candidate.startingSkillRanksBySkillId ?? {},
  );
}

function createGuildRecruitCandidate(
  state: GameState | undefined,
  sequence: number,
  slotIndex: number,
  nowMs: number,
): GuildRecruitCandidate {
  const level = getCandidateLevel(state, sequence, slotIndex);

  return {
    id: `guild-recruit-candidate-${sequence}`,
    classId: "beginner",
    characterLevel: level,
    role: "none",
    generatedAtMs: nowMs,
    sequence,
    equipmentItemIds: rollRecruitStartingEquipment(state, level, sequence, slotIndex),
    startingSkillRanksBySkillId: rollRecruitStartingSkills(
      state,
      sequence,
      slotIndex,
    ),
  };
}

function sanitizeGuildRecruitCandidate(
  candidate: GuildRecruitCandidate | null | undefined,
  fallbackSequence: number,
  nowMs: number,
): GuildRecruitCandidate | null {
  if (!candidate) {
    return null;
  }

  const sequence = sanitizeSequence(candidate.sequence, fallbackSequence);
  const classId = sanitizeRecruitClassId(candidate.classId);
  const characterLevel = sanitizeCharacterLevel(candidate.characterLevel);

  return {
    id:
      typeof candidate.id === "string" && candidate.id
        ? candidate.id
        : `guild-recruit-candidate-${sequence}`,
    classId,
    characterLevel,
    role: sanitizeRecruitRole(candidate.role),
    generatedAtMs: sanitizeTimestamp(candidate.generatedAtMs, nowMs),
    sequence,
    equipmentItemIds: sanitizeRecruitEquipment(candidate.equipmentItemIds, characterLevel),
    startingSkillRanksBySkillId: sanitizeRecruitStartingSkillRanks(
      candidate.startingSkillRanksBySkillId,
    ),
  };
}

function getCandidateLevel(
  state: GameState | undefined,
  sequence: number,
  slotIndex: number,
): number {
  if (!state) {
    return 1;
  }

  const range = getGuildRecruitLevelRange(state);
  const spread = Math.max(1, range.max - range.min + 1);

  return range.min + ((sequence + slotIndex) % spread);
}

function rollRecruitStartingEquipment(
  state: GameState | undefined,
  level: number,
  sequence: number,
  slotIndex: number,
): EquipmentItemId[] {
  const chancePercent = state ? getGuildRecruitEquipmentChancePercent(state) : 50;
  const successCount = getChanceSuccessCount(
    chancePercent,
    sequence,
    slotIndex,
    17,
  );
  const pool = getRecruitEquipmentPool(level);
  const selectedSlots = new Set<EquipmentSlot>();
  const selectedItemIds: EquipmentItemId[] = [];

  for (let index = 0; index < pool.length && selectedItemIds.length < successCount; index += 1) {
    const itemDefinition = pool[
      getDeterministicIndex(pool.length, sequence, slotIndex, 29 + index)
    ];

    if (
      itemDefinition.equipmentSlot &&
      !selectedSlots.has(itemDefinition.equipmentSlot)
    ) {
      selectedSlots.add(itemDefinition.equipmentSlot);
      selectedItemIds.push(itemDefinition.id as EquipmentItemId);
    }
  }

  return selectedItemIds;
}

function rollRecruitStartingSkills(
  state: GameState | undefined,
  sequence: number,
  slotIndex: number,
): Partial<Record<SkillId, number>> {
  const chancePercent = state ? getGuildRecruitSkillChancePercent(state) : 50;
  const successCount = getChanceSuccessCount(
    chancePercent,
    sequence,
    slotIndex,
    41,
  );
  const beginnerSkills = Object.values(SKILL_DEFINITIONS).filter(
    (skill) => skill.classId === "beginner",
  );
  const selectedSkillIds = new Set<SkillId>();
  const ranksBySkillId: Partial<Record<SkillId, number>> = {};

  for (
    let index = 0;
    index < beginnerSkills.length && selectedSkillIds.size < successCount;
    index += 1
  ) {
    const skill = beginnerSkills[
      getDeterministicIndex(
        beginnerSkills.length,
        sequence,
        slotIndex,
        53 + index,
      )
    ];

    if (!selectedSkillIds.has(skill.id)) {
      selectedSkillIds.add(skill.id);
      ranksBySkillId[skill.id] = Math.min(2, BEGINNER_SKILL_MAX_RANK);
    }
  }

  return ranksBySkillId;
}

function applyRecruitStartingEquipment(
  companion: Companion,
  equipmentItemIds: EquipmentItemId[],
): Companion {
  const equipment = { ...companion.equipment };

  for (const itemId of equipmentItemIds) {
    const itemDefinition = getItemDefinition(itemId);

    if (
      itemDefinition.category === "equipment" &&
      itemDefinition.equipmentSlot &&
      itemDefinition.levelRequirement &&
      itemDefinition.levelRequirement > companion.characterLevel
    ) {
      continue;
    }

    if (
      itemDefinition.category === "equipment" &&
      itemDefinition.equipmentSlot &&
      isClassAllowedForEquipment(companion.classId, itemDefinition)
    ) {
      equipment[itemDefinition.equipmentSlot] = itemId;
    }
  }

  return syncCompanionDerivedMaxHealth({
    ...companion,
    equipment,
  });
}

function applyRecruitStartingSkills(
  companion: Companion,
  startingSkillRanksBySkillId: Partial<Record<SkillId, number>>,
): Companion {
  const ranksBySkillId = {
    ...(companion.skillProgression?.ranksBySkillId ?? {}),
  };

  for (const [skillId, rank] of Object.entries(startingSkillRanksBySkillId)) {
    const skill = SKILL_DEFINITIONS[skillId as SkillId];

    if (skill?.classId === companion.classId) {
      ranksBySkillId[skill.id] = Math.min(
        getCompanionSkillMaxRank(companion, skill),
        Math.max(ranksBySkillId[skill.id] ?? 1, sanitizeSequence(rank, 1)),
      );
    }
  }

  return sanitizeProgressionForCompanion({
    ...companion,
    skillProgression: {
      ranksBySkillId,
      legacyEnabledSkillIds: companion.skillProgression?.legacyEnabledSkillIds ?? [],
    },
  });
}

function getRecruitEquipmentPool(level: number): ItemDefinition[] {
  return Object.values(ITEM_DEFINITIONS)
    .filter(
      (itemDefinition) =>
        itemDefinition.category === "equipment" &&
        Boolean(itemDefinition.equipmentSlot) &&
        (!itemDefinition.levelRequirement ||
          itemDefinition.levelRequirement <= level) &&
        isClassAllowedForEquipment("beginner", itemDefinition),
    )
    .sort((a, b) => a.id.localeCompare(b.id));
}

function sanitizeRecruitEquipment(
  itemIds: EquipmentItemId[] | undefined,
  level: number,
): EquipmentItemId[] {
  if (!Array.isArray(itemIds)) {
    return [];
  }

  const validItemIds = new Set(
    getRecruitEquipmentPool(level).map((itemDefinition) => itemDefinition.id),
  );

  return itemIds.filter((itemId): itemId is EquipmentItemId =>
    validItemIds.has(itemId),
  );
}

function sanitizeRecruitStartingSkillRanks(
  ranksBySkillId: Partial<Record<SkillId, number>> | undefined,
): Partial<Record<SkillId, number>> {
  if (!ranksBySkillId || typeof ranksBySkillId !== "object") {
    return {};
  }

  const sanitized: Partial<Record<SkillId, number>> = {};

  for (const [skillId, rank] of Object.entries(ranksBySkillId)) {
    const skill = SKILL_DEFINITIONS[skillId as SkillId];

    if (skill?.classId === "beginner") {
      sanitized[skill.id] = Math.min(
        BEGINNER_SKILL_MAX_RANK,
        Math.max(1, Math.floor(Number(rank) || 1)),
      );
    }
  }

  return sanitized;
}

function getChanceSuccessCount(
  chancePercent: number,
  sequence: number,
  slotIndex: number,
  salt: number,
): number {
  const guaranteedCount = Math.floor(Math.max(0, chancePercent) / 100);
  const remainder = Math.max(0, chancePercent) % 100;

  return guaranteedCount +
    (getDeterministicPercent(sequence, slotIndex, salt) < remainder ? 1 : 0);
}

function getDeterministicIndex(
  length: number,
  sequence: number,
  slotIndex: number,
  salt: number,
): number {
  return length <= 0
    ? 0
    : getDeterministicHash(sequence, slotIndex, salt) % length;
}

function getDeterministicPercent(
  sequence: number,
  slotIndex: number,
  salt: number,
): number {
  return getDeterministicHash(sequence, slotIndex, salt) % 100;
}

function getDeterministicHash(
  sequence: number,
  slotIndex: number,
  salt: number,
): number {
  let value = Math.imul(sequence + 31, 1103515245);
  value = Math.imul(value + slotIndex + 17, 12345);
  value = Math.imul(value + salt, 2654435761);

  return Math.abs(value >>> 0);
}

function findRecruitCandidateIndex(
  guildRecruit: GuildRecruitState,
  candidateId: string | undefined,
): number {
  if (candidateId) {
    return guildRecruit.candidates.findIndex(
      (candidate) => candidate?.id === candidateId,
    );
  }

  return guildRecruit.candidates.findIndex(Boolean);
}

function getRecruitSpawnPosition(position: Position | undefined): Position {
  if (!position) {
    return { x: 0, y: 0 };
  }

  return {
    x: position.x + 0.5,
    y: position.y + 0.5,
  };
}

function sanitizeRecruitClassId(classId: ClassId | undefined): ClassId {
  return classId === "beginner" ? classId : "beginner";
}

function sanitizeRecruitRole(
  role: PartyMemberRole | undefined,
): PartyMemberRole {
  return role === "none" ? role : "none";
}

function sanitizeCharacterLevel(level: number | undefined): number {
  return typeof level === "number" && Number.isFinite(level)
    ? Math.max(1, Math.floor(level))
    : 1;
}

function sanitizeSequence(sequence: number | undefined, fallback = 1): number {
  return typeof sequence === "number" && Number.isFinite(sequence)
    ? Math.max(1, Math.floor(sequence))
    : fallback;
}

function sanitizeTimestamp(timestamp: number | undefined, fallback: number): number {
  return typeof timestamp === "number" && Number.isFinite(timestamp)
    ? timestamp
    : fallback;
}

function getRecruitRefreshIntervalMs(state: GameState | undefined): number {
  return state
    ? getGuildRecruitRefreshIntervalMs(state)
    : GUILD_RECRUIT_REFRESH_INTERVAL_MS;
}

function getAvailableRecruitSequence(state: GameState, sequence: number): number {
  const activeCompanionIds = new Set(
    getActiveCompanions(state).map((companion) => companion.id),
  );
  const restingCompanionIds = new Set(
    getRestingCompanions(state).map((companion) => companion.id),
  );
  let nextSequence = sanitizeSequence(sequence);

  while (
    activeCompanionIds.has(`guild-recruit-${nextSequence}`) ||
    restingCompanionIds.has(`guild-recruit-${nextSequence}`)
  ) {
    nextSequence += 1;
  }

  return nextSequence;
}
