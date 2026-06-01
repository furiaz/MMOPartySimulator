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
  getQuestRuntimeProgressDisplay,
  getQuestTurnInErrorText,
} from "./questUiHelpers";

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
        <div className="placeholder-box">No acquired quests.</div>
      )}
    </section>
  );
}

function QuestDetailPanel({ quest }: { quest: QuestState }) {
  const definition = QUEST_DEFINITIONS[quest.questId];
  const turnInErrorText = getQuestTurnInErrorText(quest);
  const runtimeProgress = getQuestRuntimeProgressDisplay(quest);

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
