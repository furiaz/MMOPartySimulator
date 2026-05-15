import { HUB_MAP_ID } from "./debugMap";
import { getPartyMembers } from "./partySystem";
import { updateEntity, type GameState } from "./state";
import type { Position } from "./types";

export function updateHealingFountainSystem(state: GameState): GameState {
  if (state.currentMapId !== HUB_MAP_ID || !state.map?.healingFountains.length) {
    return state;
  }

  const partyMembers = getPartyMembers(state);
  const isPartyInRange = state.map.healingFountains.some((fountain) =>
    partyMembers.some(
      (member) => getDistance(member.position, fountain.position) <= fountain.range,
    ),
  );

  if (!isPartyInRange) {
    return state;
  }

  let nextState = state;

  for (const member of partyMembers) {
    if (member.state === "dead" || member.health <= 0 || member.health >= member.maxHealth) {
      continue;
    }

    nextState = updateEntity(nextState, {
      ...member,
      health: member.maxHealth,
    });
  }

  return nextState;
}

function getDistance(first: Position, second: Position): number {
  return Math.hypot(first.x - second.x, first.y - second.y);
}
