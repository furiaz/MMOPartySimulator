import { HUB_MAP_ID } from "./debugMap";
import { refillEquippedFlasksFromHubFountain } from "./consumables";
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
  const activeFountain = state.map.healingFountains.find((fountain) =>
    partyMembers.some(
      (member) => getDistance(member.position, fountain.position) <= fountain.range,
    ),
  );

  if (activeFountain) {
    nextState = refillEquippedFlasksFromHubFountain(nextState, activeFountain.id);
  }

  for (const member of partyMembers) {
    const currentMember = nextState.entities[member.id];

    if (
      currentMember?.kind !== "companion" ||
      currentMember.state === "dead" ||
      currentMember.health <= 0 ||
      currentMember.health >= currentMember.maxHealth
    ) {
      continue;
    }

    nextState = updateEntity(nextState, {
      ...currentMember,
      health: currentMember.maxHealth,
    });
  }

  return nextState;
}

function getDistance(first: Position, second: Position): number {
  return Math.hypot(first.x - second.x, first.y - second.y);
}
