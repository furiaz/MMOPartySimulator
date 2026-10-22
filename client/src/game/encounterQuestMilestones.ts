import { ORC_WARCAMP_ENCOUNTER_ID } from "./orcWarcampLayout";
import type { QuestEncounterMilestone } from "./questTypes";
import type { GameState } from "./state";

/** Read durable encounter facts; never spawn actors or perform encounter actions. */
export function isEncounterQuestMilestoneComplete(
  state: Pick<GameState, "warmasterLifecycle">,
  milestone: QuestEncounterMilestone | undefined,
): boolean {
  if (milestone?.encounterId !== ORC_WARCAMP_ENCOUNTER_ID) return false;
  const lifecycle = state.warmasterLifecycle;
  if (!lifecycle) return false;
  switch (milestone.kind) {
    case "boss_defeated":
    case "captive_rescued":
      return lifecycle.rescued === true;
    case "chest_collected":
      return lifecycle.chestCollectedOnce === true;
    default:
      return false;
  }
}
