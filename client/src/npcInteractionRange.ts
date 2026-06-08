import type { NpcEntity } from "./game/types";

export const questGiverInteractionRange = 2;
export const merchantInteractionRange = 2;
export const defaultNpcInteractionRange = 1.5;

export function getNpcInteractionRange(
  npc: Pick<NpcEntity, "npcRole">,
): number {
  if (npc.npcRole === "quest_giver" || npc.npcRole === "class_mentor") {
    return questGiverInteractionRange;
  }

  if (npc.npcRole === "merchant") {
    return merchantInteractionRange;
  }

  return defaultNpcInteractionRange;
}
