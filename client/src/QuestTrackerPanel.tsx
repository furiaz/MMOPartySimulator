import { QUEST_DEFINITIONS, type QuestState } from "./game";
import {
  formatQuestStatus,
  getObjectiveLabel,
  getQuestRuntimeProgressDisplay,
} from "./questUiHelpers";

const questObjectiveCompleteSrc =
  "assets/Generated/prototype-vfx/sprites/quest-objective-complete.png";

export function QuestTrackerPanel({
  isHidden,
  onShow,
  quest,
  onHide,
}: {
  isHidden: boolean;
  onShow: () => void;
  quest: QuestState | null;
  onHide: () => void;
}) {
  if (quest?.status === "completed" || quest?.status === "locked") {
    return null;
  }

  const definition = quest ? QUEST_DEFINITIONS[quest.questId] : null;
  const runtimeProgress = getQuestRuntimeProgressDisplay(quest);

  return (
    <section
      className={`quest-tracker-panel${isHidden ? " collapsed" : ""}`}
      aria-label="Current quests"
    >
      <div className="quest-tracker-header">
        <h2>Quests</h2>
        <button onClick={isHidden ? onShow : onHide} type="button">
          {isHidden ? "Show" : "Hide"}
        </button>
      </div>
      {isHidden ? null : quest && definition ? (
        <>
          <div className="quest-tracker-title">
            <strong>{definition.displayName}</strong>
            <span>{formatQuestStatus(quest.status)}</span>
          </div>
          {runtimeProgress ? (
            <div
              className="quest-runtime-progress"
              title={`${runtimeProgress.label}: ${Math.round(
                runtimeProgress.currentMs / 1000,
              )}s / ${Math.round(runtimeProgress.requiredMs / 1000)}s`}
            >
              <div>
                <span>{runtimeProgress.label}</span>
                <strong>{Math.round(runtimeProgress.percent)}%</strong>
              </div>
              <span className="quest-runtime-progress-bar">
                <span style={{ width: `${runtimeProgress.percent}%` }} />
              </span>
            </div>
          ) : null}
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
        </>
      ) : (
        <div className="quest-tracker-empty">No acquired quests</div>
      )}
    </section>
  );
}
