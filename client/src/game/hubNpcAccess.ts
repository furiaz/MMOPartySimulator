import { HUB_MAP_ID, HUB_TWO_MAP_ID } from "./debugMap";
import type { GameState } from "./state";
import type { DebugMapId, NpcEntity } from "./types";

export type FunctionalHubNpcRole = Extract<
  NpcEntity["npcRole"],
  | "quest_giver"
  | "class_mentor"
  | "merchant"
  | "smith"
  | "bank_chest"
  | "guild_coordinator"
  | "tavern_keeper"
  | "farmer"
  | "livestock_keeper"
>;

const FUNCTIONAL_HUB_NPC_ROLES: ReadonlySet<NpcEntity["npcRole"]> = new Set([
  "quest_giver",
  "class_mentor",
  "merchant",
  "smith",
  "bank_chest",
  "guild_coordinator",
  "tavern_keeper",
  "farmer",
  "livestock_keeper",
]);

export function isTownHubMapId(
  mapId: DebugMapId | undefined,
): mapId is typeof HUB_MAP_ID | typeof HUB_TWO_MAP_ID {
  return mapId === HUB_MAP_ID || mapId === HUB_TWO_MAP_ID;
}

export function isFunctionalHubNpcRole(
  role: NpcEntity["npcRole"],
): role is FunctionalHubNpcRole {
  return FUNCTIONAL_HUB_NPC_ROLES.has(role);
}

export function isFunctionalHubNpcAvailable(
  state: Pick<GameState, "currentMapId" | "entities">,
  npc: Pick<NpcEntity, "id" | "npcRole">,
): boolean {
  if (
    !isTownHubMapId(state.currentMapId) ||
    !isFunctionalHubNpcRole(npc.npcRole)
  ) {
    return false;
  }

  const currentEntity = state.entities[npc.id];

  return (
    currentEntity?.kind === "npc" && currentEntity.npcRole === npc.npcRole
  );
}

export function isHubNpcRoleAvailable(
  state: Pick<GameState, "currentMapId" | "entities">,
  roles: readonly NpcEntity["npcRole"][],
): boolean {
  if (!isTownHubMapId(state.currentMapId)) {
    return false;
  }

  return Object.values(state.entities).some(
    (entity) => entity.kind === "npc" && roles.includes(entity.npcRole),
  );
}
