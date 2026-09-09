import type { GuidePopupId } from "./guidePopupDefinitions";
import type { QuestId, QuestStatus } from "./game/questTypes";

export type QuestStatusLookup = Partial<Record<QuestId, QuestStatus>>;

function didBecomeStatus(
  previousStatuses: QuestStatusLookup,
  nextStatuses: QuestStatusLookup,
  questId: QuestId,
  status: QuestStatus,
): boolean {
  return previousStatuses[questId] !== status && nextStatuses[questId] === status;
}

function didBecomeRouteUnlocked(
  previousStatuses: QuestStatusLookup,
  nextStatuses: QuestStatusLookup,
): boolean {
  const previousStatus = previousStatuses.break_lower_shore_blockage;
  const nextStatus = nextStatuses.break_lower_shore_blockage;

  return (
    previousStatus !== "ready_to_turn_in" &&
    previousStatus !== "completed" &&
    (nextStatus === "ready_to_turn_in" || nextStatus === "completed")
  );
}

export function getGuidePopupsForQuestStatusChanges(
  previousStatuses: QuestStatusLookup,
  nextStatuses: QuestStatusLookup,
): GuidePopupId[] {
  const guidePopupIds: GuidePopupId[] = [];

  if (didBecomeStatus(previousStatuses, nextStatuses, "clear_the_shore", "active")) {
    guidePopupIds.push("first_quest_started");
  }

  if (
    didBecomeStatus(
      previousStatuses,
      nextStatuses,
      "outfit_the_expedition",
      "active",
    )
  ) {
    guidePopupIds.push("equipment_setup");
  }

  if (
    didBecomeStatus(previousStatuses, nextStatuses, "smiths_first_work", "active")
  ) {
    guidePopupIds.push("first_smith_quest_started");
  }

  if (
    didBecomeStatus(
      previousStatuses,
      nextStatuses,
      "break_lower_shore_blockage",
      "active",
    )
  ) {
    guidePopupIds.push("first_route_unlock_quest");
  }

  if (didBecomeRouteUnlocked(previousStatuses, nextStatuses)) {
    guidePopupIds.push("first_route_unlocked");
  }

  if (didBecomeStatus(previousStatuses, nextStatuses, "azure_trial", "available")) {
    guidePopupIds.push("first_class_path");
  }

  return guidePopupIds;
}
