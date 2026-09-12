import type { NpcEntity } from "./game/types";
import { BANK_INTERACTION_RANGE } from "./game/bank";
import { SMITH_CRAFTING_INTERACTION_RANGE } from "./game/crafting";
import { FARM_INTERACTION_RANGE } from "./game/farm";
import { GUILD_TAVERN_INTERACTION_RANGE } from "./game/guildTavern";

export const questGiverInteractionRange = 4;
export const merchantInteractionRange = SMITH_CRAFTING_INTERACTION_RANGE;
export const bankInteractionRange = BANK_INTERACTION_RANGE;
export const guildTavernInteractionRange = GUILD_TAVERN_INTERACTION_RANGE;
export const farmInteractionRange = FARM_INTERACTION_RANGE;
export const defaultNpcInteractionRange = 3;

export function getNpcInteractionRange(
  npc: Pick<NpcEntity, "npcRole">,
): number {
  if (npc.npcRole === "quest_giver" || npc.npcRole === "class_mentor") {
    return questGiverInteractionRange;
  }

  if (npc.npcRole === "merchant" || npc.npcRole === "smith") {
    return merchantInteractionRange;
  }

  if (npc.npcRole === "bank_chest") {
    return bankInteractionRange;
  }

  if (
    npc.npcRole === "guild_coordinator" ||
    npc.npcRole === "tavern_keeper"
  ) {
    return guildTavernInteractionRange;
  }

  if (npc.npcRole === "farmer" || npc.npcRole === "livestock_keeper") {
    return farmInteractionRange;
  }

  return defaultNpcInteractionRange;
}
