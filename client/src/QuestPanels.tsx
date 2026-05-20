import {
  QUEST_DEFINITIONS,
  type GameState,
  type QuestId,
  type QuestState,
} from "./game";
import {
  formatQuestStatus,
  getObjectiveLabel,
  getQuestLogQuests,
  getQuestProgressTotals,
  getQuestRewardText,
  getQuestTurnInErrorText,
} from "./questUiHelpers";

const questObjectiveCompleteSrc =
  "Asserts/Generated/prototype-vfx/sprites/quest-objective-complete.png";

export function QuestTrackerPanel({ quest }: { quest: QuestState | null }) {
  if (!quest || quest.status === "completed" || quest.status === "locked") {
    return null;
  }

  const definition = QUEST_DEFINITIONS[quest.questId];

  return (
    <section className="quest-tracker-panel" aria-label="Current quests">
      <div className="quest-tracker-header">
        <span>Current Quest</span>
        <span>{formatQuestStatus(quest.status)}</span>
      </div>
      <strong>{definition.displayName}</strong>
      <div className="quest-tracker-objectives">
        {definition.objectives.map((objective) => {
          const progress = quest.objectiveProgress[objective.id];
          const requiredCount = objective.requiredCount ?? 1;

          return (
            <div
              key={objective.id}
              className={`quest-tracker-objective${
                progress?.completed ? " completed" : ""
              }`}
            >
              <span>{getObjectiveLabel(objective, requiredCount)}</span>
              <span>
                {progress?.completed ? (
                  <img
                    alt=""
                    className="quest-objective-complete-vfx"
                    src={questObjectiveCompleteSrc}
                  />
                ) : null}
                {progress?.currentCount ?? 0}/{requiredCount}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function QuestsPanel({
  quests,
  selectedQuestId,
  onSelectQuest,
}: {
  quests: GameState["quests"];
  selectedQuestId: QuestId | null;
  onSelectQuest: (questId: QuestId) => void;
}) {
  const visibleQuests = getQuestLogQuests(quests);
  const selectedQuest =
    visibleQuests.find((quest) => quest.questId === selectedQuestId) ??
    visibleQuests[0] ??
    null;

  return (
    <section className="quests-panel" aria-label="Quests">
      <h2>Quests</h2>
      {visibleQuests.length > 0 ? (
        <div className="menu-split-layout">
          <div className="quest-list">
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
          </div>
          {selectedQuest ? <QuestDetailPanel quest={selectedQuest} /> : null}
        </div>
      ) : (
        <div className="placeholder-box">No current quests.</div>
      )}
    </section>
  );
}

function QuestDetailPanel({ quest }: { quest: QuestState }) {
  const definition = QUEST_DEFINITIONS[quest.questId];
  const turnInErrorText = getQuestTurnInErrorText(quest);

  return (
    <div className="quest-detail-panel">
      <div className="menu-section-heading">
        <span>{definition.displayName}</span>
        <span>{formatQuestStatus(quest.status)}</span>
      </div>
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
      <div className="placeholder-box">
        Rewards: {getQuestRewardText(definition.rewards)}
      </div>
      {turnInErrorText ? (
        <div className="placeholder-box">{turnInErrorText}</div>
      ) : null}
    </div>
  );
}
