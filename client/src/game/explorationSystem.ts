import { isAutonomousEntity } from "./entities";
import {
  getPartyLeader,
  type PartyMember,
} from "./partySystem";
import {
  isActiveResourcePosition,
  moveEntityTowardPositionIfUnoccupied,
  previewMoveTowardPosition,
  reservePositionForFrame,
  setLeaderIntent,
  type GameState,
} from "./state";
import {
  findNearestReachableNavigationPosition,
  getNavigationPositionKey,
} from "./navigation";
import { isCompanionResurrectionChanneling } from "./resurrectionSystem";

export function updateExplorationSystem(
  state: GameState,
  movedEntityIds = new Set<string>(),
): GameState {
  if (!state.autoModeEnabled || !state.map) {
    return state;
  }

  if (isPartyFormationActive(state)) {
    return markAutonomousEntityTilesExplored(state);
  }

  let nextState = markAutonomousEntityTilesExplored(state);
  const explorer = getExploringPartyMember(nextState);

  if (!explorer || movedEntityIds.has(explorer.id)) {
    return nextState;
  }

  const targetPosition = findNearestUnexploredReachablePosition(
    nextState,
    explorer.position,
  );

  if (!targetPosition) {
    return setLeaderIntent(nextState, null);
  }

  nextState = setLeaderIntent(nextState, {
    type: "explore",
    targetId: null,
    targetPosition,
  });
  nextState = moveEntityTowardPositionIfUnoccupied(
    nextState,
    explorer,
    targetPosition,
  );
  if (didEntityMove(nextState, explorer)) {
    movedEntityIds.add(explorer.id);
  }

  return markAutonomousEntityTilesExplored(nextState);
}

function didEntityMove(state: GameState, entity: PartyMember): boolean {
  const currentEntity = state.entities[entity.id];

  return Boolean(
    currentEntity &&
      (currentEntity.position.x !== entity.position.x ||
        currentEntity.position.y !== entity.position.y),
  );
}

export function reserveExploringPartyMemberNextTile(state: GameState): GameState {
  if (!state.autoModeEnabled || !state.map) {
    return state;
  }

  if (isPartyFormationActive(state)) {
    return state;
  }

  const explorer = getExploringPartyMember(state);

  if (!explorer) {
    return state;
  }

  const targetPosition = findNearestUnexploredReachablePosition(
    state,
    explorer.position,
  );

  if (!targetPosition) {
    return state;
  }

  const nextTile = previewMoveTowardPosition(state, explorer, targetPosition);

  return nextTile
    ? reservePositionForFrame(state, explorer.id, nextTile)
    : state;
}

function isPartyFormationActive(state: GameState): boolean {
  return Boolean(
    state.partyFormation &&
      state.partyFormation.phase !== "idle",
  );
}

function markAutonomousEntityTilesExplored(state: GameState): GameState {
  let exploredTiles = state.exploredTiles;

  for (const entity of Object.values(state.entities)) {
    if (!isAutonomousEntity(entity) || entity.state === "dead") {
      continue;
    }

    const key = getNavigationPositionKey(entity.position);

    if (exploredTiles[key]) {
      continue;
    }

    exploredTiles = {
      ...exploredTiles,
      [key]: true,
    };
  }

  return exploredTiles === state.exploredTiles
    ? state
    : {
        ...state,
        exploredTiles,
      };
}

function getExploringPartyMember(state: GameState): PartyMember | undefined {
  const leader = getPartyLeader(state);

  if (
    leader?.commandPriority === "autonomous" &&
    !isCompanionResurrectionChanneling(state, leader.id) &&
    (leader.state === "idle" || leader.state === "follow")
  ) {
    return leader;
  }

  return Object.values(state.entities).find(
    (entity): entity is PartyMember =>
      entity.kind === "companion" &&
      entity.commandPriority === "autonomous" &&
      !isCompanionResurrectionChanneling(state, entity.id) &&
      (entity.state === "idle" || entity.state === "follow"),
  );
}

function findNearestUnexploredReachablePosition(
  state: GameState,
  start: { x: number; y: number },
): { x: number; y: number } | null {
  if (!state.map) {
    return null;
  }

  return findNearestReachableNavigationPosition(
    state.map,
    start,
    (position) =>
      !state.exploredTiles[getNavigationPositionKey(position)] &&
      !isActiveResourcePosition(state, position),
    {
      isBlocked: (position) => isActiveResourcePosition(state, position),
    },
  );
}
