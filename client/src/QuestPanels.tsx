import type { ReactNode } from "react";
import { getBoardObjectiveLabel } from "./game/guildNoticeBoard";
import {
  QUEST_DEFINITIONS,
  getGuildNoticeBoardState,
  type GameState,
  type GuildNoticeBoardQuest,
  type QuestId,
  type QuestState,
} from "./game";
import {
  formatQuestStatus,
  getObjectiveLabel,
  getQuestDetailLocations,
  getQuestLogQuests,
  getQuestProgressTotals,
  getQuestRewardText,
  getQuestRuntimeProgressDisplay,
  getQuestTurnInErrorText,
} from "./questUiHelpers";

export function QuestsPanel({
  currentTime,
  state,
  quests,
  selectedQuestId,
  onSelectQuest,
}: {
  currentTime: number;
  state: GameState;
  quests: GameState["quests"];
  selectedQuestId: QuestId | null;
  onSelectQuest: (questId: QuestId) => void;
}) {
  const visibleQuests = getQuestLogQuests(quests);
  const noticeBoardQuests = getGuildNoticeBoardState(
    state,
    currentTime,
  ).slots.filter(
    (quest): quest is GuildNoticeBoardQuest =>
      quest !== null && quest.status !== "available",
  );
  const selectedQuest =
    visibleQuests.find((quest) => quest.questId === selectedQuestId) ??
    visibleQuests[0] ??
    null;
  const hasVisibleQuests = visibleQuests.length > 0 || noticeBoardQuests.length > 0;

  return (
    <section className="quests-panel" aria-label="Quests">
      <h2>Quests</h2>
      {hasVisibleQuests ? (
        <div className="menu-split-layout">
          <div className="quest-list">
            {visibleQuests.length > 0 ? (
              <QuestListSection heading="Main Quest" count={visibleQuests.length}>
                {visibleQuests.map((quest) => {
                  const definition = QUEST_DEFINITIONS[quest.questId];
                  const progressTotals = getQuestProgressTotals(quest);

                  return (
                    <button
                      key={quest.questId}
                      className={`quest-list-item${
                        selectedQuest?.questId === quest.questId ? " selected" : ""
                      }`}
                      onClick={() => onSelectQuest(quest.questId)}
                      type="button"
                    >
                      <span>{definition.displayName}</span>
                      <span>
                        {progressTotals.currentCount}/{progressTotals.requiredCount}
                      </span>
                    </button>
                  );
                })}
              </QuestListSection>
            ) : null}
            {noticeBoardQuests.length > 0 ? (
              <QuestListSection
                heading="Notice Board"
                count={noticeBoardQuests.length}
              >
                {noticeBoardQuests.map((quest) => (
                  <div
                    className="quest-list-item notice-board-quest-list-item"
                    key={quest.id}
                  >
                    <span className="quest-list-item-content">
                      <strong>{quest.title}</strong>
                      <small>{getNoticeBoardQuestObjectiveSummary(quest)}</small>
                    </span>
                    <span>{getNoticeBoardQuestStatusLabel(quest)}</span>
                  </div>
                ))}
              </QuestListSection>
            ) : null}
          </div>
          {selectedQuest ? <QuestDetailPanel quest={selectedQuest} /> : null}
        </div>
      ) : (
        <div className="placeholder-box">No acquired quests.</div>
      )}
    </section>
  );
}

function QuestListSection({
  children,
  count,
  heading,
}: {
  children: ReactNode;
  count: number;
  heading: string;
}) {
  return (
    <div className="quest-list-section">
      <div className="quest-list-section-heading">
        <span>{heading}</span>
        <small>{count}</small>
      </div>
      {children}
    </div>
  );
}

function QuestDetailPanel({ quest }: { quest: QuestState }) {
  const definition = QUEST_DEFINITIONS[quest.questId];
  const turnInErrorText = getQuestTurnInErrorText(quest);
  const runtimeProgress = getQuestRuntimeProgressDisplay(quest);
  const questLocations = getQuestDetailLocations(quest);
  const locationHeading =
    questLocations.length === 1 ? "Location" : "Locations";

  return (
    <div className="quest-detail-panel">
      <div className="menu-section-heading">
        <span>{definition.displayName}</span>
        <span>{formatQuestStatus(quest.status)}</span>
      </div>
      {questLocations.length > 0 ? (
        <div className="placeholder-box">
          {locationHeading}:{" "}
          {questLocations.map((location) => location.label).join(" | ")}
        </div>
      ) : null}
      <div className="quest-objective-list">
        {definition.objectives.map((objective) => {
          const progress = quest.objectiveProgress[objective.id];
          const requiredCount = objective.requiredCount ?? 1;

          return (
            <div
              key={objective.id}
              className={`quest-objective-row${
                progress?.completed ? " completed" : ""
              }`}
            >
              <span>{getObjectiveLabel(objective, requiredCount)}</span>
              <strong>
                {progress?.currentCount ?? 0}/{requiredCount}
              </strong>
            </div>
          );
        })}
      </div>
      {runtimeProgress ? (
        <div className="quest-runtime-progress quest-runtime-progress-detail">
          <div>
            <span>{runtimeProgress.statusText}</span>
            <strong>
              {Math.round(runtimeProgress.currentMs / 1000)}s/
              {Math.round(runtimeProgress.requiredMs / 1000)}s
            </strong>
          </div>
          <span className="quest-runtime-progress-bar">
            <span style={{ width: `${runtimeProgress.percent}%` }} />
          </span>
        </div>
      ) : null}
      <div className="placeholder-box">
        Rewards: {getQuestRewardText(definition.rewards)}
      </div>
      {turnInErrorText ? (
        <div className="placeholder-box">{turnInErrorText}</div>
      ) : null}
    </div>
  );
}

function getNoticeBoardQuestObjectiveSummary(
  quest: GuildNoticeBoardQuest,
): string {
  return quest.objectives
    .map((objective) => {
      return `${getBoardObjectiveLabel(objective)} ${objective.currentCount}/${objective.requiredCount}`;
    })
    .join(", ");
}

function getNoticeBoardQuestStatusLabel(
  quest: GuildNoticeBoardQuest,
): string {
  if (quest.status === "taken") {
    return "Taken";
  }

  if (quest.status === "done") {
    return quest.rewardClaimedAtMs === null ? "Done" : "Completed";
  }

  return "Available";
}
