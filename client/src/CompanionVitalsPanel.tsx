import { INVENTORY_ITEM_ICON_SRC } from "./assetIcons";
import {
  CLASS_DEFINITIONS,
  companionIds,
  getCharacterXpProgress,
  getCompanionDerivedStats,
  getCompanionFlaskDisplayState,
  getItemDefinition,
  type ClassPath,
  type Companion,
  type CompanionGlobalCooldownState,
} from "./game";
import { CLASS_PORTRAIT_SRC } from "./visualAssets";

const classPathLabels: Record<ClassPath, string> = {
  honor: "Honor Path",
  primal: "Primal Path",
  arcane: "Arcane Path",
  holy: "Holy Path",
};

function getActiveFoodRemainingSeconds(
  member: Companion,
  currentTime: number,
): number | null {
  const foodBuff = member.consumableBuffs.food;

  if (!foodBuff || foodBuff.expiresAt <= currentTime) {
    return null;
  }

  return Math.ceil((foodBuff.expiresAt - currentTime) / 1000);
}

export function CompanionVitalsPanel({
  currentTime,
  globalCooldownsByCompanionId,
  members,
}: {
  currentTime: number;
  globalCooldownsByCompanionId?: Record<string, CompanionGlobalCooldownState>;
  members: Companion[];
}) {
  if (members.length === 0) {
    return null;
  }

  const orderedMembers = [...members].sort(
    (a, b) => a.partyOrder - b.partyOrder || a.id.localeCompare(b.id),
  );

  return (
    <section className="companion-vitals-panel" aria-label="Companion vitals">
      {orderedMembers.map((member) => {
        const classDefinition = CLASS_DEFINITIONS[member.classId];
        const classPath = classDefinition.path;
        const classPathLabel = classPath ? classPathLabels[classPath] : null;
        const assignedFoodDefinition = member.consumables.foodItemId
          ? getItemDefinition(member.consumables.foodItemId)
          : null;
        const activeFoodRemainingSeconds = getActiveFoodRemainingSeconds(
          member,
          currentTime,
        );
        const activeFoodDefinition =
          activeFoodRemainingSeconds !== null && member.consumableBuffs.food
            ? getItemDefinition(member.consumableBuffs.food.itemId)
            : null;
        const derivedStats = getCompanionDerivedStats(member);
        const healthPercent =
          derivedStats.maxHealth > 0
            ? Math.max(
                0,
                Math.min(
                  100,
                  (member.health / derivedStats.maxHealth) * 100,
                ),
              )
            : 0;
        const characterXpProgress = getCharacterXpProgress(member);
        const characterXpText = characterXpProgress.isMaxLevel
          ? "MAX"
          : `${characterXpProgress.xp}/${characterXpProgress.xpToNextLevel}`;
        const companionNumber = companionIds.indexOf(member.id) + 1;
        const companionLabel =
          companionNumber > 0 ? `Companion ${companionNumber}` : member.id;
        const portraitSrc = CLASS_PORTRAIT_SRC[member.classId];
        const pathClassName = classPath ?? "beginner";
        const flaskIconSrc = member.consumables.flask
          ? INVENTORY_ITEM_ICON_SRC[member.consumables.flask.itemId]
          : null;
        const flaskDisplayState = getCompanionFlaskDisplayState(
          member,
          currentTime,
        );
        const displayedFoodDefinition =
          activeFoodDefinition ?? assignedFoodDefinition;
        const displayedFoodIconSrc = displayedFoodDefinition
          ? INVENTORY_ITEM_ICON_SRC[displayedFoodDefinition.id]
          : null;
        const globalCooldown = globalCooldownsByCompanionId?.[member.id];
        const globalCooldownRemainingMs =
          globalCooldown && globalCooldown.expiresAt > currentTime
            ? globalCooldown.expiresAt - currentTime
            : 0;
        const globalCooldownDurationMs = globalCooldown
          ? Math.max(1, globalCooldown.expiresAt - globalCooldown.startedAt)
          : 1;
        const globalCooldownPercent = Math.min(
          100,
          Math.max(
            0,
            (globalCooldownRemainingMs / globalCooldownDurationMs) * 100,
          ),
        );

        return (
          <article
            key={member.id}
            className={`companion-vitals-card companion-vitals-card-${pathClassName}`}
          >
            {globalCooldownRemainingMs > 0 ? (
              <span
                className="companion-vitals-gcd-bar"
                title={`Global cooldown ${Math.ceil(
                  globalCooldownRemainingMs / 1000,
                )}s`}
              >
                <span style={{ width: `${globalCooldownPercent}%` }} />
              </span>
            ) : null}
            <div className="companion-vitals-portrait-frame">
              <img
                alt=""
                className="companion-vitals-portrait"
                draggable={false}
                src={portraitSrc}
              />
            </div>
            <div className="companion-vitals-main">
              <div className="companion-vitals-header">
                <span>{companionLabel}</span>
                <span>Lv {member.characterLevel}</span>
              </div>
              <div className="companion-vitals-class">
                <span>{classDefinition.displayName}</span>
                {classPathLabel ? <span>{classPathLabel}</span> : null}
              </div>
              <div className="companion-vitals-meter-row">
                <span>HP</span>
                <span>
                  {member.health}/{derivedStats.maxHealth}
                </span>
              </div>
              <span
                className="companion-vitals-bar companion-vitals-hp"
                title={`HP ${member.health}/${derivedStats.maxHealth}`}
              >
                <span style={{ width: `${healthPercent}%` }} />
              </span>
              <div className="companion-vitals-meter-row">
                <span>Exp</span>
                <span>{characterXpText}</span>
              </div>
              <span
                className={`companion-vitals-bar companion-vitals-exp${
                  characterXpProgress.isMaxLevel
                    ? " companion-vitals-exp-max"
                    : ""
                }`}
                title={`Exp ${characterXpText}`}
              >
                <span style={{ width: `${characterXpProgress.percent}%` }} />
              </span>
              <div className="companion-vitals-slots">
                <span
                  className="companion-vitals-consumable"
                  title={
                    flaskDisplayState
                      ? `${flaskDisplayState.displayName}: ${flaskDisplayState.usesLeft} uses left${
                          flaskDisplayState.cooldownRemainingMs > 0
                            ? `, ${Math.ceil(
                                flaskDisplayState.cooldownRemainingMs / 1000,
                              )}s cooldown`
                            : ", ready"
                        }`
                      : "No flask equipped"
                  }
                >
                  {flaskDisplayState?.cooldownRemainingMs ? (
                    <span
                      className="companion-vitals-cooldown-fill"
                      style={{
                        width: `${flaskDisplayState.cooldownPercent}%`,
                      }}
                    />
                  ) : null}
                  <span className="companion-vitals-slot-label">Flask</span>
                  <span className="companion-vitals-icon-frame">
                    {flaskIconSrc ? (
                      <img
                        alt=""
                        className="companion-vitals-slot-icon"
                        draggable={false}
                        src={flaskIconSrc}
                      />
                    ) : null}
                    {flaskDisplayState ? (
                      <span className="companion-vitals-uses-badge">
                        {flaskDisplayState.usesLeft}
                      </span>
                    ) : null}
                  </span>
                  <span>
                    {flaskDisplayState
                      ? `${flaskDisplayState.displayName}`
                      : "Empty"}
                  </span>
                </span>
                <span
                  className="companion-vitals-consumable"
                  title={
                    activeFoodRemainingSeconds !== null &&
                    displayedFoodDefinition
                      ? `${displayedFoodDefinition.displayName}: ${activeFoodRemainingSeconds}s remaining`
                      : assignedFoodDefinition?.displayName ?? "No food assigned"
                  }
                >
                  <span className="companion-vitals-slot-label">Food:</span>
                  <span className="companion-vitals-icon-frame">
                    {displayedFoodIconSrc ? (
                      <img
                        alt=""
                        className="companion-vitals-slot-icon"
                        draggable={false}
                        src={displayedFoodIconSrc}
                      />
                    ) : null}
                  </span>
                  <span>
                    {activeFoodRemainingSeconds !== null
                      ? `${activeFoodRemainingSeconds}s`
                      : assignedFoodDefinition?.displayName ?? "Empty"}
                  </span>
                </span>
              </div>
            </div>
          </article>
        );
      })}
    </section>
  );
}
