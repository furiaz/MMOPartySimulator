import {
  createDebugMap,
  debugMapDefinitions,
  hubCompanionStartPositions,
  hubNpcStartData,
  HUB_MAP_ID,
} from "./debugMap";
import { createNpc, moveEntityTo } from "./entities";
import { recordMapReachedForQuests } from "./questSystem";
import { updateEntity, type GameState } from "./state";
import type {
  Companion,
  DebugMapId,
  GameEntity,
  Position,
  WorldWipeRecoveryChoice,
} from "./types";
import {
  getCurrencyBalance,
  markWalletVisible,
  removeCurrencyFromWalletState,
} from "./wallet";

export const WORLD_WIPE_RESCUE_OVERLAY_DURATION_MS = 2000;
const RESCUE_BASE_FEE = 5;
const RESCUE_FEE_PER_HOP = 10;

export type RescueHubDefinition = {
  id: string;
  mapId: DebugMapId;
  displayName: string;
  rescueActorId: string;
  rescueActorName: string;
  rescueLine: string;
  isUnlocked: boolean;
  arrivalPositions: Position[];
};

export type WorldWipeRecoveryOptions = {
  rescueHubs?: RescueHubDefinition[];
};

export const DEFAULT_RESCUE_HUBS: RescueHubDefinition[] = [
  {
    id: "harbor-union-bastion",
    mapId: HUB_MAP_ID,
    displayName: "Harbor Union Bastion",
    rescueActorId: "hub-dog",
    rescueActorName: "Dog",
    rescueLine: "Careful now!",
    isUnlocked: true,
    arrivalPositions: hubCompanionStartPositions,
  },
];

export function updateWorldWipeRecovery(
  state: GameState,
  nowMs: number,
  options: WorldWipeRecoveryOptions = {},
): GameState {
  if (state.worldWipeRecovery?.status === "pending_choice") {
    return state;
  }

  if (!shouldTriggerWorldWipeRecovery(state)) {
    return state;
  }

  const choices = getWorldWipeRecoveryChoices(state, options);

  if (choices.length === 0) {
    return state;
  }

  const wipeId = createWipeId(state);

  if (choices.length > 1) {
    return {
      ...state,
      worldWipeRecovery: {
        status: "pending_choice",
        wipeId,
        sourceMapId: state.currentMapId,
        choices,
      },
    };
  }

  return completeWorldWipeRecovery(state, choices[0], wipeId, nowMs);
}

export function resolveWorldWipeRecoveryChoice(
  state: GameState,
  hubId: string,
  nowMs: number,
): GameState {
  const recovery = state.worldWipeRecovery;

  if (recovery?.status !== "pending_choice") {
    return state;
  }

  const choice = recovery.choices.find((candidate) => candidate.hubId === hubId);

  return choice
    ? completeWorldWipeRecovery(state, choice, recovery.wipeId, nowMs)
    : state;
}

export function getWorldWipeRecoveryChoices(
  state: GameState,
  options: WorldWipeRecoveryOptions = {},
): WorldWipeRecoveryChoice[] {
  if (!state.currentMapId) {
    return [];
  }

  const hubs = (options.rescueHubs ?? DEFAULT_RESCUE_HUBS).filter(
    (hub) => hub.isUnlocked,
  );
  const reachableHubs = hubs
    .map((hub) => ({
      hub,
      hopDistance: getMapHopDistance(state.currentMapId as DebugMapId, hub.mapId),
    }))
    .filter(
      (entry): entry is { hub: RescueHubDefinition; hopDistance: number } =>
        Number.isFinite(entry.hopDistance),
    );
  const closestDistance = Math.min(
    ...reachableHubs.map((entry) => entry.hopDistance),
  );

  if (!Number.isFinite(closestDistance)) {
    return [];
  }

  return reachableHubs
    .filter((entry) => entry.hopDistance === closestDistance)
    .map(({ hub, hopDistance }) => ({
      hubId: hub.id,
      hubDisplayName: hub.displayName,
      mapId: hub.mapId,
      rescueActorId: hub.rescueActorId,
      rescueActorName: hub.rescueActorName,
      rescueLine: hub.rescueLine,
      hopDistance,
      fee: getRescueFee(hopDistance),
      arrivalPositions: hub.arrivalPositions,
    }));
}

function shouldTriggerWorldWipeRecovery(state: GameState): state is GameState & {
  currentMapId: DebugMapId;
} {
  if (!state.currentMapId || state.currentMapId === HUB_MAP_ID) {
    return false;
  }

  const companions = getCompanions(state);

  return (
    companions.length > 0 &&
    companions.every(
      (companion) => companion.state === "dead" || companion.health <= 0,
    )
  );
}

function completeWorldWipeRecovery(
  state: GameState,
  choice: WorldWipeRecoveryChoice,
  wipeId: string,
  nowMs: number,
): GameState {
  const previousCrowns = getCurrencyBalance(state.wallet, "crowns");
  const chargedFee = Math.min(previousCrowns, choice.fee);
  let nextState =
    chargedFee > 0
      ? removeCurrencyFromWalletState(
          state,
          "crowns",
          chargedFee,
          "world_wipe_recovery",
        ).state
      : markWalletVisible(state, nowMs);

  nextState = resetStateToRescueHub(nextState, choice);

  return {
    ...nextState,
    worldWipeRecovery: {
      status: "rescued",
      wipeId,
      sourceMapId: state.currentMapId ?? choice.mapId,
      selectedChoice: choice,
      chargedFee,
      previousCrowns,
      createdAt: nowMs,
      expiresAt: nowMs + WORLD_WIPE_RESCUE_OVERLAY_DURATION_MS,
    },
  };
}

function resetStateToRescueHub(
  state: GameState,
  choice: WorldWipeRecoveryChoice,
): GameState {
  const targetMap = createDebugMap(choice.mapId);
  let nextState: GameState = {
    ...state,
    entities: getRescueHubEntities(state, choice),
    currentMapId: choice.mapId,
    map: targetMap,
    activeTeleport: null,
    leaderIntent: null,
    globalPoiIntent: null,
    localPoiTarget: null,
    lastPoiDecision: undefined,
    worldTravelTargetMapId: null,
    exploredTiles: {},
    followTrailsByEntityId: {},
    combatFeedbackEvents: [],
    failedMoveByEntityId: {},
    movementFailureMsByEntityId: {},
    movementFailuresByEntityId: {},
    moveIntentsByEntityId: {},
    reservedPositionsByEntityId: {},
    movementPathsByEntityId: {},
    movementDecisionsByEntityId: {},
    lastPositionsByEntityId: {},
    defenderWaitTicksByLeaderId: {},
    defenderBlockedTicksByEntityId: {},
    defenderWaitMsByLeaderId: {},
    defenderBlockedMsByEntityId: {},
    skillMarksByEnemyId: {},
    skillSelfBuffsByCompanionId: {},
    skillGatherBuffsByCompanionId: {},
    skillBindsByEnemyId: {},
    skillShieldBlocksById: {},
    skillCooldownsByCompanionId: {},
    skillVisualEvents: [],
    dropVisualEvents: [],
    resurrectionProgressByCompanionId: {},
    resurrectionChannelsByHelperId: {},
    partyFormation: {
      phase: "idle",
      targetId: null,
      approachPoint: null,
      direction: { x: 0, y: 0 },
      slotsByEntityId: {},
      slotReasonsByEntityId: {},
      skippedTargetIds: [],
    },
  };

  const companions = getCompanions(nextState).sort(
    (first, second) => first.partyOrder - second.partyOrder,
  );

  for (const [index, companion] of companions.entries()) {
    const position =
      choiceArrivalPosition(choice, index) ??
      choice.arrivalPositions[0];

    nextState = updateEntity(nextState, {
      ...moveEntityTo(companion, position),
      state: "follow",
      health: companion.maxHealth,
      currentTargetId:
        companion.id === nextState.partyLeaderId ? null : nextState.partyLeaderId,
      followTargetId:
        companion.id === nextState.partyLeaderId
          ? companion.id
          : nextState.partyLeaderId,
      defendPosition: null,
      commandPriority: "autonomous",
    });
  }

  const leader = nextState.entities[nextState.partyLeaderId];

  nextState = {
    ...nextState,
    exploredTiles:
      leader?.kind === "companion"
        ? { [`${Math.round(leader.position.x)},${Math.round(leader.position.y)}`]: true }
        : {},
  };

  return recordMapReachedForQuests(nextState, choice.mapId);
}

function getRescueHubEntities(
  state: GameState,
  choice: WorldWipeRecoveryChoice,
): Record<string, GameEntity> {
  const entities: Record<string, GameEntity> = Object.fromEntries(
    getCompanions(state).map((companion) => [companion.id, companion]),
  );

  if (choice.mapId === HUB_MAP_ID) {
    for (const npc of hubNpcStartData) {
      entities[npc.id] = createNpc(
        npc.id,
        npc.position,
        npc.displayName,
        npc.npcRole,
      );
    }
  }

  return entities;
}

function choiceArrivalPosition(
  choice: Pick<RescueHubDefinition, "arrivalPositions">,
  index: number,
): Position | undefined {
  return choice.arrivalPositions[index] ?? choice.arrivalPositions[0];
}

function getCompanions(state: GameState): Companion[] {
  return Object.values(state.entities).filter(
    (entity): entity is Companion => entity.kind === "companion",
  );
}

function getRescueFee(hopDistance: number): number {
  return RESCUE_BASE_FEE + RESCUE_FEE_PER_HOP * hopDistance;
}

function getMapHopDistance(fromMapId: DebugMapId, toMapId: DebugMapId): number {
  if (fromMapId === toMapId) {
    return 0;
  }

  const visited = new Set<DebugMapId>([fromMapId]);
  const queue: Array<{ mapId: DebugMapId; distance: number }> = [
    { mapId: fromMapId, distance: 0 },
  ];

  while (queue.length > 0) {
    const current = queue.shift();

    if (!current) {
      break;
    }

    for (const teleport of debugMapDefinitions[current.mapId].teleports) {
      if (visited.has(teleport.targetMapId)) {
        continue;
      }

      const distance = current.distance + 1;

      if (teleport.targetMapId === toMapId) {
        return distance;
      }

      visited.add(teleport.targetMapId);
      queue.push({ mapId: teleport.targetMapId, distance });
    }
  }

  return Number.POSITIVE_INFINITY;
}

function createWipeId(state: GameState): string {
  const companionIds = getCompanions(state)
    .map((companion) => companion.id)
    .sort()
    .join(",");

  return `${state.currentMapId ?? "unknown"}:${
    state.simulationFrame ?? state.simulationTick
  }:${companionIds}`;
}
