import type { GameState } from "./state";
import type {
  CommandPriority,
  DebugMovementResult,
  DebugTelemetryEntitySnapshot,
  DebugTelemetryEvent,
  DebugTelemetryReport,
  DebugTelemetryState,
  GameEntity,
  PartyMemberRole,
  Position,
} from "./types";

const DEFAULT_MAX_DEBUG_TICKS = 1000;

export function createDebugTelemetryState(
  maxTicks = DEFAULT_MAX_DEBUG_TICKS,
): DebugTelemetryState {
  return {
    isRecording: false,
    tickNumber: 0,
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
): GameState {
  const debugTelemetry = previousState.debugTelemetry;

  if (!debugTelemetry?.isRecording) {
    return nextState.debugTelemetry === debugTelemetry
      ? nextState
      : { ...nextState, debugTelemetry };
  }

  const tick = debugTelemetry.tickNumber + 1;
  const appendedEvents = getAppendedTelemetryEvents(debugTelemetry, nextState, tick);
  const events = [
    ...appendedEvents,
    ...getTelemetryEvents(previousState, nextState, tick),
  ];
  const telemetryTick = {
    tick,
    recordedAt: Date.now(),
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
      ticks,
      events: [...debugTelemetry.events, ...events].filter(
        (event) => event.tick >= firstTick,
      ),
    },
  };
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
    event.formationPhase ?? "",
    event.reason ?? "",
  ].join("|");
}

function getEntitySnapshot(
  previousState: GameState,
  nextState: GameState,
  entity: GameEntity,
  tick: number,
): DebugTelemetryEntitySnapshot {
  const previousEntity = previousState.entities[entity.id];
  const movementResult = getMovementResult(previousEntity, nextState, entity);

  return {
    tick,
    entityId: entity.id,
    kind: entity.kind,
    role: getRole(entity),
    state: entity.state,
    position: { ...entity.position },
    currentTargetId: getCurrentTargetId(entity),
    commandPriority: getCommandPriority(entity),
    movementResult,
    reason: getReason(nextState, entity, movementResult),
    formationPhase: nextState.partyFormation?.phase,
    formationSlot: nextState.partyFormation?.slotsByEntityId[entity.id] ?? null,
    formationSlotReason:
      nextState.partyFormation?.slotReasonsByEntityId[entity.id],
  };
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
      events.push({
        tick,
        type: "movement_failed",
        entityId: entity.id,
        targetId: getCurrentTargetId(entity),
        reason: getReason(nextState, entity, "blocked"),
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

  if (state.defenderWaitTicksByLeaderId?.[entity.id]) {
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

function getCommandPriority(entity: GameEntity): CommandPriority | undefined {
  return "commandPriority" in entity ? entity.commandPriority : undefined;
}

function getRole(entity: GameEntity): PartyMemberRole | undefined {
  return entity.kind === "player" || entity.kind === "companion"
    ? entity.role
    : undefined;
}

function getHealth(entity: GameEntity): number | null {
  return "health" in entity ? entity.health : null;
}
