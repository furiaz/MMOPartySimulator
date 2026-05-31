import type { GameState } from "./state";
import type { PartyFormationState } from "./types";

function createIdlePartyFormation(): PartyFormationState {
  return {
    phase: "idle",
    targetId: null,
    approachPoint: null,
    direction: { x: 0, y: 0 },
    slotsByEntityId: {},
    slotReasonsByEntityId: {},
    skippedTargetIds: [],
  };
}

export function clearMapTransitionRuntimeState(state: GameState): GameState {
  return {
    ...state,
    activeTeleport: null,
    directCompanionCommandsById: {},
    directCommandGraceUntilByCompanionId: {},
    interruptedPoiTarget: null,
    exploredTiles: {},
    followTrailsByEntityId: {},
    combatFeedbackEvents: [],
    failedMoveByEntityId: {},
    movementFailureMsByEntityId: {},
    movementFailuresByEntityId: {},
    movementPathRetryAtMsByEntityId: {},
    moveIntentsByEntityId: {},
    reservedPositionsByEntityId: {},
    movementPathsByEntityId: {},
    attackSlotCacheByEntityId: {},
    movementDecisionsByEntityId: {},
    lastPositionsByEntityId: {},
    defenderWaitTicksByLeaderId: {},
    defenderBlockedTicksByEntityId: {},
    defenderWaitMsByLeaderId: {},
    defenderBlockedMsByEntityId: {},
    skillVisualEvents: [],
    enemyAoeChannelsByCasterId: {},
    enemyAoeCooldownsByCasterId: {},
    dropVisualEvents: [],
    resurrectionProgressByCompanionId: {},
    resurrectionChannelsByHelperId: {},
    partyFormation: createIdlePartyFormation(),
  };
}
