import { getPartyLeader } from "./partySystem";
import { getEuclideanDistance } from "./positionUtils";
import type { GameState } from "./state";
import type { NpcEntity } from "./types";

export const GUILD_TAVERN_INTERACTION_RANGE = 8;

export function isGuildTavernNpc(
  entity: unknown,
): entity is NpcEntity & {
  npcRole: "guild_coordinator" | "tavern_keeper";
} {
  return (
    typeof entity === "object" &&
    entity !== null &&
    "kind" in entity &&
    entity.kind === "npc" &&
    "npcRole" in entity &&
    (entity.npcRole === "guild_coordinator" ||
      entity.npcRole === "tavern_keeper")
  );
}

export function isPartyLeaderNearGuildTavern(state: GameState): boolean {
  const leader = getPartyLeader(state);

  if (!leader) {
    return false;
  }

  return Object.values(state.entities).some(
    (entity) =>
      isGuildTavernNpc(entity) &&
      getEuclideanDistance(leader.position, entity.position) <=
        GUILD_TAVERN_INTERACTION_RANGE,
  );
}
