import { estimateAfkCombatForParty } from "./afkCombatEstimate";
import { createDebugMap } from "./debugMap";
import {
  getGuildSecondaryPartyAssignmentDurationMs,
  getGuildSecondaryPartyCount,
  getGuildSecondaryPartyDropEfficiency,
  getGuildSecondaryPartyExperienceEfficiency,
} from "./guildRecruitUpgrades";
import { recordEnemyDefeatsForGuildNoticeBoard } from "./guildNoticeBoard";
import { getGuildSecondaryPartiesState } from "./guildSecondaryParties";
import { addItemToInventoryState } from "./inventory";
import { getItemDefinitionForResourceType } from "./items";
import { grantCharacterXpToCompanion } from "./leveling";
import { recordHighestCharacterLevelEver } from "./partySystem";
import type { GameState } from "./state";
import type {
  Companion,
  DebugMapId,
  GuildSecondaryParty,
  GuildSecondaryPartyAssignmentLoot,
  GuildSecondaryPartyAssignmentResult,
  GuildSecondaryPartyAssignmentState,
  InventorySlot,
  ItemId,
} from "./types";
import {
  getAssignmentDestination,
  getAssignmentDestinations,
  type AssignmentDestination,
} from "./worldDiscovery";

export const GUILD_SECONDARY_PARTY_ASSIGNMENT_VARIANCE = 0.15;
export const MIN_GUILD_SECONDARY_PARTY_ASSIGNMENT_REDEEM_MS = 60_000;

export type GuildSecondaryPartyAssignmentFailureReason =
  | "unknown_party"
  | "locked_party"
  | "empty_party"
  | "already_assigned"
  | "unknown_destination"
  | "unvisited_destination"
  | "inventory_full"
  | "estimate_unavailable";

export type GuildSecondaryPartyAssignmentResultType =
  | {
      ok: true;
      state: GameState;
      partyId: string;
      settledSummary: GuildSecondaryPartyRedeemSummary | null;
    }
  | {
      ok: false;
      state: GameState;
      partyId: string;
      reason: GuildSecondaryPartyAssignmentFailureReason;
      settledSummary: GuildSecondaryPartyRedeemSummary | null;
    };

export type GuildSecondaryPartyRedeemFailureReason =
  | "unknown_party"
  | "not_assigned"
  | "not_ready"
  | "inventory_full"
  | "estimate_unavailable";

export type GuildSecondaryPartyRedeemSummary = {
  partyId: string;
  partyName: string;
  mapName: string;
  subzoneName: string;
  elapsedMs: number;
  experienceEfficiency: number;
  dropEfficiency: number;
  result: GuildSecondaryPartyAssignmentResult;
};

export type GuildSecondaryPartyRedeemResult =
  | {
      ok: true;
      state: GameState;
      partyId: string;
      summary: GuildSecondaryPartyRedeemSummary | null;
    }
  | {
      ok: false;
      state: GameState;
      partyId: string;
      reason: GuildSecondaryPartyRedeemFailureReason;
      summary: GuildSecondaryPartyRedeemSummary | null;
    };

export type GuildSecondaryPartyAssignmentPreviewResult =
  | {
      ok: true;
      destination: AssignmentDestination;
      estimate: Extract<ReturnType<typeof estimateAfkCombatForParty>, { available: true }>;
      experienceEfficiency: number;
      dropEfficiency: number;
      maxDurationMs: number;
    }
  | {
      ok: false;
      reason:
        | "unknown_party"
        | "locked_party"
        | "empty_party"
        | "unknown_destination"
        | "unvisited_destination"
        | "estimate_unavailable";
      message: string;
    };

type SettlementMode = "redeem" | "reassign" | "return";

export function getGuildSecondaryPartyAssignmentDestinations(
  state: GameState,
): AssignmentDestination[] {
  return getAssignmentDestinations(state);
}

export function getGuildSecondaryPartyAssignmentPreview(
  state: GameState,
  partyId: string,
  mapId: DebugMapId,
  subzoneId: string,
): GuildSecondaryPartyAssignmentPreviewResult {
  const party = getGuildSecondaryPartiesState(state).parties.find(
    (candidate) => candidate.id === partyId,
  );

  if (!party) {
    return { ok: false, reason: "unknown_party", message: "Unknown Field Team." };
  }

  if (!isPartyUnlocked(state, partyId)) {
    return { ok: false, reason: "locked_party", message: "Unlock this Field Team first." };
  }

  const companions = getSecondaryPartyCompanions(state, party);

  if (companions.length === 0) {
    return { ok: false, reason: "empty_party", message: "Assign at least one companion." };
  }

  const destination = getAssignmentDestination(mapId, subzoneId);

  if (!destination) {
    return { ok: false, reason: "unknown_destination", message: "Unknown destination." };
  }

  if (!isDestinationVisited(state, mapId, subzoneId)) {
    return { ok: false, reason: "unvisited_destination", message: "Visit this subzone first." };
  }

  const estimate = getAssignmentEstimate(state, destination, companions);

  if (!estimate.available) {
    return { ok: false, reason: "estimate_unavailable", message: estimate.message };
  }

  return {
    ok: true,
    destination,
    estimate,
    experienceEfficiency: getGuildSecondaryPartyExperienceEfficiency(state, partyId),
    dropEfficiency: getGuildSecondaryPartyDropEfficiency(state, partyId),
    maxDurationMs: getGuildSecondaryPartyAssignmentDurationMs(state, partyId),
  };
}

export function refreshGuildSecondaryPartyAssignments(
  state: GameState,
  nowMs = Date.now(),
): GameState {
  const secondaryParties = getGuildSecondaryPartiesState(state);
  const parties = secondaryParties.parties.map((party) => {
    const assignment = party.assignment;

    if (
      assignment &&
      assignment.status === "assigned" &&
      nowMs >= assignment.capsAtMs
    ) {
      return {
        ...party,
        assignment: {
          ...assignment,
          status: "capped" as const,
        },
      };
    }

    return party;
  });

  return {
    ...state,
    guildSecondaryParties: {
      parties,
    },
  };
}

export function assignGuildSecondaryParty(
  state: GameState,
  partyId: string,
  mapId: DebugMapId,
  subzoneId: string,
  nowMs = Date.now(),
): GuildSecondaryPartyAssignmentResultType {
  const refreshedState = refreshGuildSecondaryPartyAssignments(state, nowMs);
  const secondaryParties = getGuildSecondaryPartiesState(refreshedState);
  const party = secondaryParties.parties.find((candidate) => candidate.id === partyId);

  if (!party) {
    return failure(refreshedState, partyId, "unknown_party", null);
  }

  if (!isPartyUnlocked(refreshedState, partyId)) {
    return failure(refreshedState, partyId, "locked_party", null);
  }

  const companions = getSecondaryPartyCompanions(refreshedState, party);

  if (companions.length === 0) {
    return failure(refreshedState, partyId, "empty_party", null);
  }

  const destination = getAssignmentDestination(mapId, subzoneId);

  if (!destination) {
    return failure(refreshedState, partyId, "unknown_destination", null);
  }

  if (!isDestinationVisited(refreshedState, mapId, subzoneId)) {
    return failure(refreshedState, partyId, "unvisited_destination", null);
  }

  let nextState = refreshedState;
  let settledSummary: GuildSecondaryPartyRedeemSummary | null = null;

  if (party.assignment) {
    const settled = settleGuildSecondaryPartyAssignment(
      nextState,
      partyId,
      nowMs,
      "reassign",
    );

    if (!settled.ok) {
      return failure(
        settled.state,
        partyId,
        settled.reason === "inventory_full" ? "inventory_full" : "already_assigned",
        settled.summary,
      );
    }

    nextState = settled.state;
    settledSummary = settled.summary;
  }

  const latestParty = getGuildSecondaryPartiesState(nextState).parties.find(
    (candidate) => candidate.id === partyId,
  );
  const latestCompanions = latestParty
    ? getSecondaryPartyCompanions(nextState, latestParty)
    : companions;
  const estimate = getAssignmentEstimate(nextState, destination, latestCompanions);

  if (!estimate.available) {
    return failure(nextState, partyId, "estimate_unavailable", settledSummary);
  }

  const maxDurationMs = getGuildSecondaryPartyAssignmentDurationMs(nextState, partyId);
  const rewardSeed = createAssignmentSeed(partyId, mapId, subzoneId, nowMs);
  const assignment: GuildSecondaryPartyAssignmentState = {
    status: "assigned",
    mapId,
    mapName: destination.mapName,
    subzoneId,
    subzoneName: destination.subzoneName,
    assignedAtMs: nowMs,
    lastSettledAtMs: nowMs,
    capsAtMs: nowMs + maxDurationMs,
    maxDurationMs,
    rewardSeed,
    experienceEfficiency: getGuildSecondaryPartyExperienceEfficiency(nextState, partyId),
    dropEfficiency: getGuildSecondaryPartyDropEfficiency(nextState, partyId),
    preview: {
      rating: estimate.rating,
      killsPerHour: estimate.killsPerHour,
      experiencePerMinute: estimate.experiencePerMinute,
      survivabilityPercent: estimate.survivabilityPercent,
      expectedDropItemIds: estimate.estimatedDropsPerHour.map((drop) => drop.itemId),
      expectedResourceItemIds: getDestinationResourceItemIds(destination),
      warnings: estimate.warnings,
    },
    pendingResult: null,
    pendingElapsedMs: 0,
  };

  return {
    ok: true,
    state: replaceSecondaryParty(nextState, {
      ...(latestParty ?? party),
      assignment,
    }),
    partyId,
    settledSummary,
  };
}

export function redeemGuildSecondaryPartyAssignment(
  state: GameState,
  partyId: string,
  nowMs = Date.now(),
): GuildSecondaryPartyRedeemResult {
  return settleGuildSecondaryPartyAssignment(state, partyId, nowMs, "redeem");
}

export function returnGuildSecondaryPartyAssignment(
  state: GameState,
  partyId: string,
  nowMs = Date.now(),
): GuildSecondaryPartyRedeemResult {
  return settleGuildSecondaryPartyAssignment(state, partyId, nowMs, "return");
}

function settleGuildSecondaryPartyAssignment(
  state: GameState,
  partyId: string,
  nowMs: number,
  mode: SettlementMode,
): GuildSecondaryPartyRedeemResult {
  const refreshedState = refreshGuildSecondaryPartyAssignments(state, nowMs);
  const party = getGuildSecondaryPartiesState(refreshedState).parties.find(
    (candidate) => candidate.id === partyId,
  );

  if (!party) {
    return { ok: false, state: refreshedState, partyId, reason: "unknown_party", summary: null };
  }

  const assignment = party.assignment;

  if (!assignment) {
    return { ok: false, state: refreshedState, partyId, reason: "not_assigned", summary: null };
  }

  if (assignment.pendingResult) {
    const summary = createRedeemSummary(
      party,
      assignment,
      assignment.pendingResult,
      assignment.pendingElapsedMs,
    );

    if (!canCollectAssignmentLoot(refreshedState, getAllAssignmentLoot(assignment.pendingResult))) {
      return {
        ok: false,
        state: refreshedState,
        partyId,
        reason: "inventory_full",
        summary,
      };
    }

    const nextState = applyAssignmentResult(
      refreshedState,
      party,
      assignment,
      assignment.pendingResult,
    );
    const resetAssignment = createResetAssignment(assignment, partyId, nowMs);

    return {
      ok: true,
      state: replaceSecondaryParty(nextState, {
        ...party,
        assignment: shouldClearAssignmentAfterSettlement(mode) ? null : resetAssignment,
      }),
      partyId,
      summary,
    };
  }

  const elapsedMs = getClaimableAssignmentElapsedMs(assignment, nowMs);

  if (elapsedMs < MIN_GUILD_SECONDARY_PARTY_ASSIGNMENT_REDEEM_MS) {
    if (shouldClearAssignmentAfterSettlement(mode)) {
      return {
        ok: true,
        state: replaceSecondaryParty(refreshedState, {
          ...party,
          assignment: null,
        }),
        partyId,
        summary: null,
      };
    }

    return {
      ok: false,
      state: refreshedState,
      partyId,
      reason: "not_ready",
      summary: null,
    };
  }

  const destination = getAssignmentDestination(assignment.mapId, assignment.subzoneId);
  const companions = getSecondaryPartyCompanions(refreshedState, party);

  if (!destination || companions.length === 0) {
    return {
      ok: false,
      state: refreshedState,
      partyId,
      reason: "estimate_unavailable",
      summary: null,
    };
  }

  const estimate = getAssignmentEstimate(refreshedState, destination, companions);

  if (!estimate.available) {
    return {
      ok: false,
      state: refreshedState,
      partyId,
      reason: "estimate_unavailable",
      summary: null,
    };
  }

  const result = rollAssignmentResult({
    destination,
    durationMs: elapsedMs,
    dropEfficiency: assignment.dropEfficiency,
    experienceEfficiency: assignment.experienceEfficiency,
    rewardSeed: assignment.rewardSeed,
    estimate,
  });
  const summary = createRedeemSummary(party, assignment, result, elapsedMs);

  if (!canCollectAssignmentLoot(refreshedState, getAllAssignmentLoot(result))) {
    return {
      ok: false,
      state: replaceSecondaryParty(refreshedState, {
        ...party,
        assignment: {
          ...assignment,
          status: "pending_loot",
          pendingResult: result,
          pendingElapsedMs: elapsedMs,
        },
      }),
      partyId,
      reason: "inventory_full",
      summary,
    };
  }

  const nextState = applyAssignmentResult(refreshedState, party, assignment, result);
  const resetAssignment = createResetAssignment(assignment, partyId, nowMs);

  return {
    ok: true,
    state: replaceSecondaryParty(nextState, {
      ...party,
      assignment: shouldClearAssignmentAfterSettlement(mode) ? null : resetAssignment,
    }),
    partyId,
    summary,
  };
}

function shouldClearAssignmentAfterSettlement(mode: SettlementMode): boolean {
  return mode === "reassign" || mode === "return";
}

function failure(
  state: GameState,
  partyId: string,
  reason: GuildSecondaryPartyAssignmentFailureReason,
  settledSummary: GuildSecondaryPartyRedeemSummary | null,
): GuildSecondaryPartyAssignmentResultType {
  return {
    ok: false,
    state,
    partyId,
    reason,
    settledSummary,
  };
}

function rollAssignmentResult({
  destination,
  durationMs,
  dropEfficiency,
  experienceEfficiency,
  rewardSeed,
  estimate,
}: {
  destination: AssignmentDestination;
  durationMs: number;
  dropEfficiency: number;
  experienceEfficiency: number;
  rewardSeed: number;
  estimate: Extract<ReturnType<typeof estimateAfkCombatForParty>, { available: true }>;
}): GuildSecondaryPartyAssignmentResult {
  const variance = getAssignmentVarianceMultiplier(rewardSeed);
  const durationHours = durationMs / (60 * 60 * 1000);
  const durationMinutes = durationMs / (60 * 1000);
  const enemyKillsByType = estimate.enemyKillShares
    .map((share) => ({
      enemyTypeId: share.enemyTypeId,
      enemyLevel: share.level,
      quantity: Math.floor(share.killsPerHour * durationHours * variance),
    }))
    .filter((kill) => kill.quantity > 0);
  const enemyKills = enemyKillsByType.reduce(
    (total, kill) => total + kill.quantity,
    0,
  );
  const xpGranted = Math.floor(
    estimate.experiencePerMinute *
      durationMinutes *
      experienceEfficiency *
      variance,
  );
  const loot = mergeAssignmentLoot(
    estimate.estimatedDropsPerHour.map((drop) => ({
      itemId: drop.itemId,
      quantity: Math.floor(drop.quantityPerHour * durationHours * dropEfficiency * variance),
    })),
  );
  const resourceCount = Math.floor(
    estimate.resourceEstimatePerMinute *
      durationMinutes *
      dropEfficiency *
      variance,
  );
  const resources = getAssignmentResourceLoot(destination, resourceCount);

  return {
    enemyKills,
    enemyKillsByType,
    xpGranted,
    loot,
    resources,
  };
}

function getSecondaryPartyCompanions(
  state: GameState,
  party: GuildSecondaryParty,
): Companion[] {
  return party.companionIds
    .map((companionId) =>
      companionId ? state.restingCompanionsById?.[companionId] : undefined,
    )
    .filter((companion): companion is Companion => Boolean(companion));
}

function isPartyUnlocked(state: GameState, partyId: string): boolean {
  const parties = getGuildSecondaryPartiesState(state).parties;
  const index = parties.findIndex((party) => party.id === partyId);

  return index >= 0 && index < getGuildSecondaryPartyCount(state);
}

function isDestinationVisited(
  state: GameState,
  mapId: DebugMapId,
  subzoneId: string,
): boolean {
  return getAssignmentDestinations(state).some(
    (candidate) =>
      candidate.mapId === mapId && candidate.subzoneId === subzoneId,
  );
}

function getAssignmentEstimate(
  state: GameState,
  destination: AssignmentDestination,
  companions: Companion[],
): ReturnType<typeof estimateAfkCombatForParty> {
  return estimateAfkCombatForParty({
    state,
    map: createDebugMap(destination.mapId),
    subzone: destination.subzone,
    companions,
  });
}

function replaceSecondaryParty(state: GameState, nextParty: GuildSecondaryParty): GameState {
  const secondaryParties = getGuildSecondaryPartiesState(state);

  return {
    ...state,
    guildSecondaryParties: {
      parties: secondaryParties.parties.map((party) =>
        party.id === nextParty.id ? nextParty : party,
      ),
    },
  };
}

function createRedeemSummary(
  party: GuildSecondaryParty,
  assignment: GuildSecondaryPartyAssignmentState,
  result: GuildSecondaryPartyAssignmentResult,
  elapsedMs: number,
): GuildSecondaryPartyRedeemSummary {
  return {
    partyId: party.id,
    partyName: party.displayName,
    mapName: assignment.mapName,
    subzoneName: assignment.subzoneName,
    elapsedMs,
    experienceEfficiency: assignment.experienceEfficiency,
    dropEfficiency: assignment.dropEfficiency,
    result,
  };
}

function createResetAssignment(
  assignment: GuildSecondaryPartyAssignmentState,
  partyId: string,
  nowMs: number,
): GuildSecondaryPartyAssignmentState {
  return {
    ...assignment,
    status: "assigned",
    assignedAtMs: nowMs,
    lastSettledAtMs: nowMs,
    capsAtMs: nowMs + assignment.maxDurationMs,
    rewardSeed: createAssignmentSeed(
      partyId,
      assignment.mapId,
      assignment.subzoneId,
      nowMs,
    ),
    pendingResult: null,
    pendingElapsedMs: 0,
  };
}

function getClaimableAssignmentElapsedMs(
  assignment: GuildSecondaryPartyAssignmentState,
  nowMs: number,
): number {
  return Math.max(
    0,
    Math.min(nowMs, assignment.capsAtMs) - assignment.lastSettledAtMs,
  );
}

function getAllAssignmentLoot(
  result: GuildSecondaryPartyAssignmentResult,
): GuildSecondaryPartyAssignmentLoot[] {
  return mergeAssignmentLoot([...result.resources, ...result.loot]);
}

function applyAssignmentResult(
  state: GameState,
  party: GuildSecondaryParty,
  assignment: GuildSecondaryPartyAssignmentState,
  result: GuildSecondaryPartyAssignmentResult,
): GameState {
  let nextState = state;

  for (const loot of getAllAssignmentLoot(result)) {
    nextState = addItemToInventoryState(
      nextState,
      loot.itemId,
      loot.quantity,
      "combat_loot",
    ).state;
  }

  nextState = grantAssignmentXp(
    nextState,
    getSecondaryPartyCompanions(nextState, party),
    result.xpGranted,
  );
  nextState = recordEnemyDefeatsForGuildNoticeBoard(
    nextState,
    result.enemyKillsByType.map((kill) => ({
      enemyTypeId: kill.enemyTypeId,
      quantity: kill.quantity,
    })),
    assignment.mapId,
  );

  return replaceSecondaryParty(nextState, {
    ...party,
    assignment,
  });
}

function getAssignmentResourceLoot(
  destination: AssignmentDestination,
  quantity: number,
): GuildSecondaryPartyAssignmentLoot[] {
  if (quantity <= 0 || destination.subzone.resourceLocations.length === 0) {
    return [];
  }

  const loot: GuildSecondaryPartyAssignmentLoot[] = [];

  for (let index = 0; index < quantity; index += 1) {
    const resourceLocation =
      destination.subzone.resourceLocations[
        index % destination.subzone.resourceLocations.length
      ];
    const itemDefinition = getItemDefinitionForResourceType(
      resourceLocation.resourceType,
      resourceLocation.tier ?? 1,
    );

    loot.push({ itemId: itemDefinition.id, quantity: 1 });
  }

  return mergeAssignmentLoot(loot);
}

function getDestinationResourceItemIds(destination: AssignmentDestination): ItemId[] {
  return [
    ...new Set(
      destination.subzone.resourceLocations.map(
        (resourceLocation) =>
          getItemDefinitionForResourceType(
            resourceLocation.resourceType,
            resourceLocation.tier ?? 1,
          ).id,
      ),
    ),
  ];
}

function canCollectAssignmentLoot(
  state: GameState,
  loot: GuildSecondaryPartyAssignmentLoot[],
): boolean {
  let nextState = state;

  for (const item of loot) {
    const result = addItemToInventoryState(
      nextState,
      item.itemId,
      item.quantity,
      "combat_loot",
    );

    if (result.result.overflowQuantity > 0) {
      return false;
    }

    nextState = result.state;
  }

  return true;
}

function grantAssignmentXp(
  state: GameState,
  companions: Companion[],
  xpAmount: number,
): GameState {
  if (xpAmount <= 0) {
    return state;
  }

  const livingCompanions = companions.filter(
    (companion) => companion.state !== "dead",
  );

  if (livingCompanions.length === 0) {
    return state;
  }

  const baseXpShare = Math.floor(xpAmount / livingCompanions.length);
  const remainderXp = xpAmount % livingCompanions.length;
  let nextState = state;

  for (const [index, companion] of livingCompanions.entries()) {
    const companionXpAmount = baseXpShare + (index < remainderXp ? 1 : 0);

    if (companionXpAmount <= 0) {
      continue;
    }

    const updatedCompanion = grantCharacterXpToCompanion(
      companion,
      companionXpAmount,
    );

    nextState = {
      ...nextState,
      restingCompanionsById: {
        ...nextState.restingCompanionsById,
        [companion.id]: updatedCompanion,
      },
    };
    nextState = recordHighestCharacterLevelEver(
      nextState,
      updatedCompanion.characterLevel,
    );
  }

  return nextState;
}

function mergeAssignmentLoot(
  loot: Array<GuildSecondaryPartyAssignmentLoot | InventorySlot>,
): GuildSecondaryPartyAssignmentLoot[] {
  const quantityByItemId = new Map<ItemId, number>();

  for (const item of loot) {
    if (item.quantity <= 0) {
      continue;
    }

    quantityByItemId.set(
      item.itemId,
      (quantityByItemId.get(item.itemId) ?? 0) + item.quantity,
    );
  }

  return [...quantityByItemId.entries()].map(([itemId, quantity]) => ({
    itemId,
    quantity,
  }));
}

function createAssignmentSeed(
  partyId: string,
  mapId: string,
  subzoneId: string,
  nowMs: number,
): number {
  const input = `${partyId}:${mapId}:${subzoneId}:${Math.floor(nowMs)}`;
  let hash = 2166136261;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function getAssignmentVarianceMultiplier(seed: number): number {
  const random = seededRandom(seed);

  return 1 - GUILD_SECONDARY_PARTY_ASSIGNMENT_VARIANCE +
    random * GUILD_SECONDARY_PARTY_ASSIGNMENT_VARIANCE * 2;
}

function seededRandom(seed: number): number {
  let value = seed || 1;

  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;

  return ((value >>> 0) % 100000) / 100000;
}
