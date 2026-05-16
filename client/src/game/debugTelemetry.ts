import type { GameState } from "./state";
import { getCharacterXpProgress } from "./leveling";
import {
  getEnemyAttackRange,
  getEnemyCombatStyle,
  getEnemyTargetPreference,
} from "./enemyArchetypes";
import {
  getNavigationDistance,
  getNavigationGrid,
  getNavigationPositionKey,
  isNavigationCellWalkable,
  toNavigationNode,
} from "./navigation";
import type {
  ClassId,
  CommandPriority,
  DebugMovementResult,
  DebugNavigationTelemetry,
  DebugTelemetryEntitySnapshot,
  DebugTelemetryEvent,
  DebugTelemetryReport,
  DebugTelemetryState,
  GameEntity,
  PartyMemberRole,
  Position,
} from "./types";
import type { QuestId, QuestState } from "./questTypes";
import type { SimulationTiming } from "./simulationTiming";

const DEFAULT_MAX_DEBUG_TICKS = 1000;
const DEBUG_TELEMETRY_SAMPLE_INTERVAL_MS = 100;

export function createDebugTelemetryState(
  maxTicks = DEFAULT_MAX_DEBUG_TICKS,
): DebugTelemetryState {
  return {
    isRecording: false,
    tickNumber: 0,
    frameNumber: 0,
    maxTicks,
    ticks: [],
    events: [],
    startedAt: null,
    stoppedAt: null,
  };
}

export function startDebugTelemetryRecording(state: GameState): GameState {
  return {
    ...state,
    debugTelemetry: {
      ...(state.debugTelemetry ?? createDebugTelemetryState()),
      isRecording: true,
      startedAt: Date.now(),
      stoppedAt: null,
    },
  };
}

export function stopDebugTelemetryRecording(state: GameState): GameState {
  const debugTelemetry = state.debugTelemetry ?? createDebugTelemetryState();

  return {
    ...state,
    debugTelemetry: {
      ...debugTelemetry,
      isRecording: false,
      stoppedAt: Date.now(),
    },
  };
}

export function clearDebugTelemetry(state: GameState): GameState {
  return {
    ...state,
    debugTelemetry: createDebugTelemetryState(
      state.debugTelemetry?.maxTicks ?? DEFAULT_MAX_DEBUG_TICKS,
    ),
  };
}

export function exportDebugTelemetryReport(
  state: GameState,
): DebugTelemetryReport {
  const debugTelemetry = state.debugTelemetry ?? createDebugTelemetryState();

  return {
    exportedAt: Date.now(),
    tickCount: debugTelemetry.ticks.length,
    eventCount: debugTelemetry.events.length,
    currentMapId: state.currentMapId,
    currentMapDisplayName: state.map?.displayName,
    currentMapDebugName: state.map?.debugName,
    activeTeleportId: state.activeTeleport?.id ?? null,
    activeTeleportSourceMapId: state.activeTeleport?.sourceMapId,
    activeTeleportTargetMapId: state.activeTeleport?.targetMapId,
    teleportTriggerSource: state.activeTeleport?.triggeredBy,
    globalPoiIntent: state.globalPoiIntent,
    localPoiTarget: state.localPoiTarget,
    lastPoiDecision: state.lastPoiDecision,
    activeQuestSummary: getActiveQuestSummary(state),
    telemetry: debugTelemetry,
  };
}

export function appendDebugTelemetryEvent(
  state: GameState,
  event: Omit<DebugTelemetryEvent, "tick">,
): GameState {
  const debugTelemetry = state.debugTelemetry;

  if (!debugTelemetry?.isRecording) {
    return state;
  }

  const telemetryEvent = {
    ...event,
    tick: debugTelemetry.tickNumber,
  };
  const firstTick =
    debugTelemetry.ticks[0]?.tick ??
    Math.max(0, debugTelemetry.tickNumber - debugTelemetry.maxTicks + 1);

  return {
    ...state,
    debugTelemetry: {
      ...debugTelemetry,
      events: [...debugTelemetry.events, telemetryEvent].filter(
        (currentEvent) => currentEvent.tick >= firstTick,
      ),
    },
  };
}

export function recordDebugTelemetryTick(
  previousState: GameState,
  nextState: GameState,
  timing?: SimulationTiming,
): GameState {
  const debugTelemetry = previousState.debugTelemetry;

  if (!debugTelemetry?.isRecording) {
    return nextState.debugTelemetry === debugTelemetry
      ? nextState
      : { ...nextState, debugTelemetry };
  }

  const tick = timing?.frameNumber ?? debugTelemetry.tickNumber + 1;
  const recordedAt = timing?.nowMs ?? Date.now();
  const appendedEvents = getAppendedTelemetryEvents(debugTelemetry, nextState, tick);

  if (!shouldRecordTelemetrySample(debugTelemetry, nextState, recordedAt)) {
    return {
      ...nextState,
      debugTelemetry: {
        ...debugTelemetry,
        tickNumber: tick,
        frameNumber: tick,
        events: [...debugTelemetry.events, ...appendedEvents],
      },
    };
  }

  const events = [
    ...appendedEvents,
    ...getTelemetryEvents(previousState, nextState, tick),
  ];
  const telemetryTick = {
    tick,
    frame: tick,
    sample: tick,
    simulationTimeMs: nextState.simulationTimeMs ?? 0,
    deltaMs: timing?.deltaMs ?? nextState.simulationDeltaMs,
    recordedAt,
    currentMapId: nextState.currentMapId,
    currentMapDisplayName: nextState.map?.displayName,
    currentMapDebugName: nextState.map?.debugName,
    activeTeleportId: nextState.activeTeleport?.id ?? null,
    activeTeleportSourceMapId: nextState.activeTeleport?.sourceMapId,
    activeTeleportTargetMapId: nextState.activeTeleport?.targetMapId,
    teleportTriggerSource: nextState.activeTeleport?.triggeredBy,
    globalPoiIntent: nextState.globalPoiIntent,
    localPoiTarget: nextState.localPoiTarget,
    lastPoiDecision: nextState.lastPoiDecision,
    activeQuestSummary: getActiveQuestSummary(nextState),
    entities: Object.values(nextState.entities).map((entity) =>
      getEntitySnapshot(previousState, nextState, entity, tick),
    ),
    events,
  };
  const ticks = [...debugTelemetry.ticks, telemetryTick].slice(
    -debugTelemetry.maxTicks,
  );
  const firstTick = ticks[0]?.tick ?? tick;

  return {
    ...nextState,
    debugTelemetry: {
      ...debugTelemetry,
      tickNumber: tick,
      frameNumber: tick,
      ticks,
      events: [...debugTelemetry.events, ...events].filter(
        (event) => event.tick >= firstTick,
      ),
    },
  };
}

function shouldRecordTelemetrySample(
  debugTelemetry: DebugTelemetryState,
  nextState: GameState,
  recordedAt: number,
): boolean {
  const previousSample = debugTelemetry.ticks[debugTelemetry.ticks.length - 1];

  return (
    !previousSample ||
    previousSample.currentMapId !== nextState.currentMapId ||
    recordedAt - previousSample.recordedAt >= DEBUG_TELEMETRY_SAMPLE_INTERVAL_MS
  );
}

function getAppendedTelemetryEvents(
  previousDebugTelemetry: DebugTelemetryState,
  nextState: GameState,
  tick: number,
): DebugTelemetryEvent[] {
  const nextDebugTelemetry = nextState.debugTelemetry;

  if (!nextDebugTelemetry || nextDebugTelemetry === previousDebugTelemetry) {
    return [];
  }

  const previousEventKeys = new Set(
    previousDebugTelemetry.events.map(getTelemetryEventKey),
  );

  return nextDebugTelemetry.events
    .filter((event) => !previousEventKeys.has(getTelemetryEventKey(event)))
    .map((event) => ({ ...event, tick }));
}

function getTelemetryEventKey(event: DebugTelemetryEvent): string {
  return [
    event.tick,
    event.type,
    event.entityId,
    event.targetId ?? "",
    event.previousTargetId ?? "",
    event.archetypeId ?? "",
    event.enemyCombatStyle ?? "",
    event.enemyTargetPreference ?? "",
    event.enemyLevel ?? "",
    event.enemyEffectiveScalingLevel ?? "",
    event.enemyScalingBand ?? "",
    event.enemyThreat ?? "",
    event.enemyAttack ?? "",
    event.enemyDefense ?? "",
    event.enemyMagicDefense ?? "",
    event.enemyEvasion ?? "",
    event.enemyScalingOverrides?.join(",") ?? "",
    event.attackRange ?? "",
    event.targetDecisionReason ?? "",
    event.previousClassId ?? "",
    event.nextClassId ?? "",
    event.xpAmount ?? "",
    event.baseXpAmount ?? "",
    event.modifiedXpAmount ?? "",
    event.xpModifier ?? "",
    event.previousLevel ?? "",
    event.nextLevel ?? "",
    event.previousXp ?? "",
    event.nextXp ?? "",
    event.skillId ?? "",
    event.skillDisplayName ?? "",
    event.skillScore ?? "",
    event.skillEffectType ?? "",
    event.itemId ?? "",
    event.itemDisplayName ?? "",
    event.tableId ?? "",
    event.dropChance ?? "",
    event.result ?? "",
    event.formationPhase ?? "",
    event.currentMapId ?? "",
    event.previousMapId ?? "",
    event.nextMapId ?? "",
    event.activeTeleportId ?? "",
    event.activeTeleportSourceMapId ?? "",
    event.activeTeleportTargetMapId ?? "",
    event.teleportTriggerSource ?? "",
    event.localPoiId ?? "",
    event.poiCategory ?? "",
    event.questId ?? "",
    event.objectiveId ?? "",
    event.reason ?? "",
    event.currencyId ?? "",
    event.currencyDisplayName ?? "",
    event.currencyAmount ?? "",
    event.previousCurrencyBalance ?? "",
    event.nextCurrencyBalance ?? "",
    event.quantitySold ?? "",
    event.valueEach ?? "",
    event.totalItemValue ?? "",
    event.totalExchangeValue ?? "",
  ].join("|");
}

function getActiveQuestSummary(
  state: GameState,
): Partial<Record<QuestId, QuestState>> | undefined {
  const activeQuestEntries = Object.entries(state.quests).filter(([, quest]) =>
    quest.status === "active" || quest.status === "ready_to_turn_in"
  ) as [QuestId, QuestState][];

  return activeQuestEntries.length > 0
    ? Object.fromEntries(activeQuestEntries) as Partial<Record<QuestId, QuestState>>
    : undefined;
}

function getEntitySnapshot(
  previousState: GameState,
  nextState: GameState,
  entity: GameEntity,
  tick: number,
): DebugTelemetryEntitySnapshot {
  const previousEntity = previousState.entities[entity.id];
  const movementResult = getMovementResult(previousEntity, nextState, entity);
  const movementFailure = nextState.movementFailuresByEntityId?.[entity.id];
  const navigation = getNavigationTelemetry(
    nextState,
    previousEntity ?? entity,
    entity,
    movementResult,
  );

  return {
    tick,
    entityId: entity.id,
    kind: entity.kind,
    classId: getClassId(entity),
    role: getRole(entity),
    state: entity.state,
    position: { ...entity.position },
    currentTargetId: getCurrentTargetId(entity),
    archetypeId: getArchetypeId(entity),
    enemyCombatStyle: getEnemyCombatStyleSnapshot(entity),
    enemyTargetPreference: getEnemyTargetPreferenceSnapshot(entity),
    enemyLevel: getEnemyLevel(entity),
    enemyEffectiveScalingLevel: getEnemyEffectiveScalingLevel(entity),
    enemyScalingBand: getEnemyScalingBand(entity),
    enemyThreat: getEnemyThreat(entity),
    enemyAttack: getEnemyAttack(entity),
    enemyDefense: getEnemyDefense(entity),
    enemyMagicDefense: getEnemyMagicDefense(entity),
    enemyEvasion: getEnemyEvasion(entity),
    enemyScalingOverrides: getEnemyScalingOverrides(entity),
    attackRange: getAttackRangeSnapshot(entity),
    targetDecisionReason: getTargetDecisionReason(entity),
    commandPriority: getCommandPriority(entity),
    characterLevel: getCharacterLevel(entity),
    characterXp: getCharacterXp(entity),
    characterXpToNextLevel: getCharacterXpToNextLevel(entity),
    characterXpProgressPercent: getCharacterXpProgressPercent(entity),
    lastCharacterXpGained: getLastCharacterXpGained(entity),
    activeCooldownSkillId: getActiveCooldownSkillId(nextState, entity),
    movementResult,
    reason: getReason(nextState, entity, movementResult),
    formationPhase: nextState.partyFormation?.phase,
    formationSlot: nextState.partyFormation?.slotsByEntityId[entity.id] ?? null,
    formationSlotReason:
      nextState.partyFormation?.slotReasonsByEntityId[entity.id],
    targetDistance: movementFailure?.targetDistance,
    intendedPosition: movementFailure?.intendedPosition,
    blockerId: movementFailure?.blockerId,
    blockerKind: movementFailure?.blockerKind,
    navigation,
  };
}

function getNavigationTelemetry(
  state: GameState,
  previousEntity: GameEntity,
  entity: GameEntity,
  movementResult: DebugMovementResult,
): DebugNavigationTelemetry | undefined {
  if (!state.map) {
    return undefined;
  }

  const movementPath = state.movementPathsByEntityId?.[entity.id];
  const movementFailure = state.movementFailuresByEntityId?.[entity.id];
  const decisionReason = state.movementDecisionsByEntityId?.[entity.id];
  const startCell = toNavigationNode(previousEntity.position);
  const targetCell = state.moveIntentsByEntityId?.[entity.id]
    ? toNavigationNode(state.moveIntentsByEntityId[entity.id])
    : null;
  const nextCell = getNavigationNextCell(
    entity,
    movementResult,
    movementPath?.waypoints[0],
    movementFailure?.intendedPosition,
  );
  const nextNavigationCell = nextCell
    ? getNavigationGrid(state.map).cellsByKey[getNavigationPositionKey(nextCell)]
    : undefined;
  const maxPathDistance = state.map.columns * state.map.rows * 2;

  return {
    startCell,
    targetCell,
    nextCell,
    pathLength: movementPath?.waypoints.length,
    targetPathDistance: targetCell
      ? getNavigationDistance(
          state.map,
          startCell,
          targetCell,
          maxPathDistance,
        )
      : undefined,
    nextCellWalkable: nextCell
      ? isNavigationCellWalkable(state.map, nextCell)
      : undefined,
    nextCellWallAdjacent: nextNavigationCell?.wallAdjacent,
    blockedBy: movementFailure?.blockerKind ?? "none",
    reason: decisionReason,
  };
}

function getNavigationNextCell(
  entity: GameEntity,
  movementResult: DebugMovementResult,
  waypoint?: Position,
  intendedPosition?: Position | null,
): Position | null {
  if (intendedPosition) {
    return toNavigationNode(intendedPosition);
  }

  if (waypoint) {
    return toNavigationNode(waypoint);
  }

  return movementResult === "moved" ? toNavigationNode(entity.position) : null;
}

function getTelemetryEvents(
  previousState: GameState,
  nextState: GameState,
  tick: number,
): DebugTelemetryEvent[] {
  const events: DebugTelemetryEvent[] = getCombatFeedbackEvents(
    previousState,
    nextState,
    tick,
  );

  for (const entity of Object.values(nextState.entities)) {
    const previousEntity = previousState.entities[entity.id];

    if (!previousEntity) {
      continue;
    }

    addTargetEvents(events, previousEntity, entity, tick);
    addStateEvents(events, previousEntity, entity, tick);
    addRoleEvents(events, previousEntity, entity, tick);
    addHealthEvents(events, previousEntity, entity, tick);
    addResourceEvents(events, previousEntity, entity, tick);

    if (nextState.failedMoveByEntityId?.[entity.id]) {
      const movementFailure = nextState.movementFailuresByEntityId?.[entity.id];
      const navigation = getNavigationTelemetry(
        nextState,
        previousEntity,
        entity,
        "blocked",
      );

      events.push({
        tick,
        type: "movement_failed",
        entityId: entity.id,
        targetId: movementFailure?.targetId ?? getCurrentTargetId(entity),
        reason: getReason(nextState, entity, "blocked"),
        targetDistance: movementFailure?.targetDistance,
        intendedPosition: movementFailure?.intendedPosition,
        blockerId: movementFailure?.blockerId,
        blockerKind: movementFailure?.blockerKind,
        attackSlot: nextState.partyFormation?.slotsByEntityId[entity.id] ?? null,
        navigation,
      });
    }
  }

  return events;
}

function getCombatFeedbackEvents(
  previousState: GameState,
  nextState: GameState,
  tick: number,
): DebugTelemetryEvent[] {
  const previousFeedbackIds = new Set(
    previousState.combatFeedbackEvents.map((event) => event.id),
  );

  return nextState.combatFeedbackEvents
    .filter((event) => !previousFeedbackIds.has(event.id))
    .map((event): DebugTelemetryEvent | null => {
      if (event.type === "attack") {
        return {
          tick,
          type: "attack_started",
          entityId: event.entityId,
        };
      }

      if (event.type === "damage") {
        return {
          tick,
          type: "damage_dealt",
          entityId: event.entityId,
          reason: event.text,
        };
      }

      if (event.type === "death") {
        return {
          tick,
          type: "entity_died",
          entityId: event.entityId,
        };
      }

      if (event.type === "gather") {
        return {
          tick,
          type: "gather_started",
          entityId: event.entityId,
        };
      }

      if (event.type === "heal") {
        return {
          tick,
          type: "healing_resolved",
          entityId: event.entityId,
          reason: event.text,
        };
      }

      return null;
    })
    .filter((event): event is DebugTelemetryEvent => Boolean(event));
}

function addTargetEvents(
  events: DebugTelemetryEvent[],
  previousEntity: GameEntity,
  entity: GameEntity,
  tick: number,
): void {
  const previousTargetId = getCurrentTargetId(previousEntity);
  const targetId = getCurrentTargetId(entity);

  if (!targetId || previousTargetId === targetId) {
    return;
  }

  events.push({
    tick,
    type: previousTargetId ? "target_changed" : "target_acquired",
    entityId: entity.id,
    targetId,
    previousTargetId,
    archetypeId: getArchetypeId(entity),
    enemyCombatStyle: getEnemyCombatStyleSnapshot(entity),
    enemyTargetPreference: getEnemyTargetPreferenceSnapshot(entity),
    attackRange: getAttackRangeSnapshot(entity),
    targetDecisionReason: getTargetDecisionReason(entity),
  });
}

function addStateEvents(
  events: DebugTelemetryEvent[],
  previousEntity: GameEntity,
  entity: GameEntity,
  tick: number,
): void {
  if (
    previousEntity.state !== "attack" &&
    entity.state === "attack" &&
    !events.some(
      (event) =>
        event.type === "attack_started" && event.entityId === entity.id,
    )
  ) {
    events.push({
      tick,
      type: "attack_started",
      entityId: entity.id,
      targetId: getCurrentTargetId(entity),
    });
  }

  if (previousEntity.state !== "gather" && entity.state === "gather") {
    events.push({
      tick,
      type: "gather_started",
      entityId: entity.id,
      targetId: getCurrentTargetId(entity),
    });
  }
}

function addRoleEvents(
  events: DebugTelemetryEvent[],
  previousEntity: GameEntity,
  entity: GameEntity,
  tick: number,
): void {
  const previousRole = getRole(previousEntity);
  const nextRole = getRole(entity);

  if (previousRole && nextRole && previousRole !== nextRole) {
    events.push({
      tick,
      type: "role_changed",
      entityId: entity.id,
      previousRole,
      nextRole,
    });
  }
}

function addHealthEvents(
  events: DebugTelemetryEvent[],
  previousEntity: GameEntity,
  entity: GameEntity,
  tick: number,
): void {
  const previousHealth = getHealth(previousEntity);
  const nextHealth = getHealth(entity);

  if (previousHealth === null || nextHealth === null) {
    return;
  }

  if (
    nextHealth < previousHealth &&
    !events.some(
      (event) =>
        event.type === "damage_dealt" && event.entityId === entity.id,
    )
  ) {
    events.push({
      tick,
      type: "damage_dealt",
      entityId: entity.id,
      amount: previousHealth - nextHealth,
    });
  }

  if (
    previousEntity.state !== "dead" &&
    entity.state === "dead" &&
    !events.some(
      (event) => event.type === "entity_died" && event.entityId === entity.id,
    )
  ) {
    events.push({
      tick,
      type: "entity_died",
      entityId: entity.id,
    });
  }
}

function addResourceEvents(
  events: DebugTelemetryEvent[],
  previousEntity: GameEntity,
  entity: GameEntity,
  tick: number,
): void {
  if (
    previousEntity.kind === "resource" &&
    entity.kind === "resource" &&
    !previousEntity.isDepleted &&
    entity.isDepleted
  ) {
    events.push({
      tick,
      type: "resource_depleted",
      entityId: entity.id,
    });
  }
}

function getMovementResult(
  previousEntity: GameEntity | undefined,
  nextState: GameState,
  entity: GameEntity,
): DebugMovementResult {
  if (!previousEntity) {
    return "waited";
  }

  if (didPositionChange(previousEntity.position, entity.position)) {
    return "moved";
  }

  if (nextState.failedMoveByEntityId?.[entity.id]) {
    return getCurrentTargetId(entity) ? "blocked" : "failed";
  }

  return "waited";
}

function getReason(
  state: GameState,
  entity: GameEntity,
  movementResult: DebugMovementResult,
): string | undefined {
  if (movementResult === "blocked") {
    return "blocked";
  }

  if (movementResult === "failed") {
    return "movement failed";
  }

  if (entity.state === "dead") {
    return "dead";
  }

  if (state.defenderWaitMsByLeaderId?.[entity.id]) {
    return "waiting for formation";
  }

  if (
    state.partyFormation &&
    state.partyFormation.phase !== "idle" &&
    (entity.id in state.partyFormation.slotsByEntityId ||
      getCurrentTargetId(entity) === state.partyFormation.targetId)
  ) {
    return `formation:${state.partyFormation.phase}`;
  }

  if (
    (entity.state === "attack" ||
      entity.state === "gather" ||
      entity.state === "follow") &&
    !getCurrentTargetId(entity)
  ) {
    return "no target";
  }

  if (entity.state === "gather") {
    return "gathering";
  }

  if (entity.state === "attack") {
    return "attacking";
  }

  if (
    entity.state === "follow" &&
    (state.followTrailsByEntityId[entity.id]?.length ?? 0) > 0
  ) {
    return "following trail";
  }

  if (entity.state === "defend") {
    return "defending";
  }

  if (entity.kind === "resource" && entity.isDepleted) {
    return "resource depleted";
  }

  if (entity.state === "idle") {
    return "idle";
  }

  return undefined;
}

function didPositionChange(a: Position, b: Position): boolean {
  return a.x !== b.x || a.y !== b.y;
}

function getCurrentTargetId(entity: GameEntity): string | null | undefined {
  return "currentTargetId" in entity ? entity.currentTargetId : undefined;
}

function getArchetypeId(entity: GameEntity) {
  return entity.kind === "enemy" ? entity.archetypeId : undefined;
}

function getEnemyCombatStyleSnapshot(entity: GameEntity) {
  return entity.kind === "enemy" ? getEnemyCombatStyle(entity) : undefined;
}

function getEnemyTargetPreferenceSnapshot(entity: GameEntity) {
  return entity.kind === "enemy" ? getEnemyTargetPreference(entity) : undefined;
}

function getEnemyLevel(entity: GameEntity): number | undefined {
  return entity.kind === "enemy" ? entity.level : undefined;
}

function getEnemyEffectiveScalingLevel(entity: GameEntity): number | undefined {
  return entity.kind === "enemy" ? entity.effectiveScalingLevel : undefined;
}

function getEnemyScalingBand(entity: GameEntity) {
  return entity.kind === "enemy" ? entity.scalingBand : undefined;
}

function getEnemyThreat(entity: GameEntity): number | undefined {
  return entity.kind === "enemy" ? entity.threat : undefined;
}

function getEnemyAttack(entity: GameEntity): number | undefined {
  return entity.kind === "enemy" ? entity.attack : undefined;
}

function getEnemyDefense(entity: GameEntity): number | undefined {
  return entity.kind === "enemy" ? entity.defense : undefined;
}

function getEnemyMagicDefense(entity: GameEntity): number | undefined {
  return entity.kind === "enemy" ? entity.magicDefense : undefined;
}

function getEnemyEvasion(entity: GameEntity): number | undefined {
  return entity.kind === "enemy" ? entity.evasion : undefined;
}

function getEnemyScalingOverrides(entity: GameEntity): string[] | undefined {
  return entity.kind === "enemy" ? entity.scalingOverrides : undefined;
}

function getAttackRangeSnapshot(entity: GameEntity): number | undefined {
  return entity.kind === "enemy" ? getEnemyAttackRange(entity) : undefined;
}

function getTargetDecisionReason(entity: GameEntity) {
  return entity.kind === "enemy" ? entity.targetDecisionReason : undefined;
}

function getCommandPriority(entity: GameEntity): CommandPriority | undefined {
  return "commandPriority" in entity ? entity.commandPriority : undefined;
}

function getRole(entity: GameEntity): PartyMemberRole | undefined {
  return entity.kind === "companion" ? entity.role : undefined;
}

function getClassId(entity: GameEntity): ClassId | undefined {
  return entity.kind === "companion" ? entity.classId : undefined;
}

function getCharacterLevel(entity: GameEntity): number | undefined {
  return entity.kind === "companion" ? entity.characterLevel : undefined;
}

function getCharacterXp(entity: GameEntity): number | undefined {
  return entity.kind === "companion" ? entity.characterXp : undefined;
}

function getCharacterXpToNextLevel(entity: GameEntity): number | null | undefined {
  return entity.kind === "companion"
    ? getCharacterXpProgress(entity).xpToNextLevel
    : undefined;
}

function getCharacterXpProgressPercent(entity: GameEntity): number | undefined {
  return entity.kind === "companion"
    ? getCharacterXpProgress(entity).percent
    : undefined;
}

function getLastCharacterXpGained(entity: GameEntity): number | undefined {
  return entity.kind === "companion" ? entity.lastCharacterXpGained : undefined;
}

function getActiveCooldownSkillId(
  state: GameState,
  entity: GameEntity,
) {
  return entity.kind === "companion"
    ? state.skillCooldownsByCompanionId?.[entity.id]?.skillId
    : undefined;
}

function getHealth(entity: GameEntity): number | null {
  return "health" in entity ? entity.health : null;
}
