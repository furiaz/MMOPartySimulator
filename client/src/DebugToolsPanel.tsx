import type { KeyboardEvent } from "react";

export type DebugToolsSection =
  | "companion"
  | "party"
  | "movement"
  | "encounters"
  | "progression"
  | "town"
  | "debug";

type DebugToolsPanelProps = {
  activeSection: DebugToolsSection;
  onSectionChange: (section: DebugToolsSection) => void;
  superSpeedEnabled: boolean;
  superExpEnabled: boolean;
  companionInfiniteHealthEnabled: boolean;
  entityInfoVisible: boolean;
  telemetryRecording: boolean;
  telemetrySampleCount: number;
  telemetryMaxSamples: number;
  telemetryEventCount: number;
  directCommandCount: number;
  directCommandGraceCount: number;
  questStatusText: string;
  questObjectiveText: string;
  globalPoiText: string;
  localPoiText: string;
  poiReasonText: string;
  actionFeedback: string | null;
  companions: Array<{
    id: string;
    displayName: string;
    className: string;
    level: number;
  }>;
  selectedCompanionId: string;
  nextCompanionClassName: string;
  canAddCompanion: boolean;
  canRemoveCompanion: boolean;
  enemyGroups: Array<{
    mapId: string;
    mapDisplayName: string;
    enemies: Array<{ id: string; displayName: string; level: number }>;
  }>;
  selectedEnemyTypeId: string;
  cropOptions: Array<{ id: string; displayName: string; unlocked: boolean }>;
  selectedCropId: string;
  selectedCropUnlocked: boolean;
  townServicesUnlocked: boolean;
  creatureOptions: Array<{ id: string; displayName: string; ownedCount: number }>;
  selectedCreatureId: string;
  onToggleSuperSpeed: () => void;
  onToggleSuperExp: () => void;
  onSelectedCompanionChange: (companionId: string) => void;
  onCycleCompanionClass: () => void;
  onRestoreCompanionHealth: () => void;
  onLevelUpCompanion: () => void;
  onKillCompanion: () => void;
  onAddCompanion: () => void;
  onRemoveCompanion: () => void;
  onRestorePartyHealth: () => void;
  onLevelUpAllCompanions: () => void;
  onToggleCompanionInfiniteHealth: () => void;
  onKillOneCompanion: () => void;
  onTeleportHubOne: () => void;
  onTeleportHubTwo: () => void;
  onTeleportSlimewardCamp: () => void;
  onResetSlimewardDungeon: () => void;
  onRefreshGatherPoints: () => void;
  onResurrectEnemy: () => void;
  onForceSuperiorEnemy: () => void;
  onAddEnemiesToSubzone: () => void;
  onRemoveDebugEnemies: () => void;
  onSelectedEnemyTypeChange: (enemyTypeId: string) => void;
  onSummonEnemy: () => void;
  onAddCrowns: () => void;
  onAddFlasks: () => void;
  onAddCraftingMaterials: () => void;
  onFinishCurrentQuest: () => void;
  onTurnInCurrentQuest: () => void;
  onToggleEntityInfo: () => void;
  onToggleTelemetryRecording: () => void;
  onExportTelemetry: () => void;
  onExportAndClearTelemetry: () => void;
  onClearTelemetry: () => void;
  onReleaseRendererCache: () => void;
  onUnlockTownServices: () => void;
  onSelectedCropChange: (cropId: string) => void;
  onUnlockCrop: () => void;
  onSelectedCreatureChange: (creatureId: string) => void;
  onAddOwnedCreature: () => void;
};

const debugToolSections: Array<{
  id: DebugToolsSection;
  label: string;
}> = [
  { id: "companion", label: "Companion" },
  { id: "party", label: "Party" },
  { id: "movement", label: "Movement" },
  { id: "encounters", label: "Encounters" },
  { id: "progression", label: "Progression" },
  { id: "town", label: "Town" },
  { id: "debug", label: "Debug" },
];

export function DebugToolsPanel({
  activeSection,
  onSectionChange,
  superSpeedEnabled,
  superExpEnabled,
  companionInfiniteHealthEnabled,
  entityInfoVisible,
  telemetryRecording,
  telemetrySampleCount,
  telemetryMaxSamples,
  telemetryEventCount,
  directCommandCount,
  directCommandGraceCount,
  questStatusText,
  questObjectiveText,
  globalPoiText,
  localPoiText,
  poiReasonText,
  actionFeedback,
  companions,
  selectedCompanionId,
  nextCompanionClassName,
  canAddCompanion,
  canRemoveCompanion,
  enemyGroups,
  selectedEnemyTypeId,
  cropOptions,
  selectedCropId,
  selectedCropUnlocked,
  townServicesUnlocked,
  creatureOptions,
  selectedCreatureId,
  onToggleSuperSpeed,
  onToggleSuperExp,
  onSelectedCompanionChange,
  onCycleCompanionClass,
  onRestoreCompanionHealth,
  onLevelUpCompanion,
  onKillCompanion,
  onAddCompanion,
  onRemoveCompanion,
  onRestorePartyHealth,
  onLevelUpAllCompanions,
  onToggleCompanionInfiniteHealth,
  onKillOneCompanion,
  onTeleportHubOne,
  onTeleportHubTwo,
  onTeleportSlimewardCamp,
  onResetSlimewardDungeon,
  onRefreshGatherPoints,
  onResurrectEnemy,
  onForceSuperiorEnemy,
  onAddEnemiesToSubzone,
  onRemoveDebugEnemies,
  onSelectedEnemyTypeChange,
  onSummonEnemy,
  onAddCrowns,
  onAddFlasks,
  onAddCraftingMaterials,
  onFinishCurrentQuest,
  onTurnInCurrentQuest,
  onToggleEntityInfo,
  onToggleTelemetryRecording,
  onExportTelemetry,
  onExportAndClearTelemetry,
  onClearTelemetry,
  onReleaseRendererCache,
  onUnlockTownServices,
  onSelectedCropChange,
  onUnlockCrop,
  onSelectedCreatureChange,
  onAddOwnedCreature,
}: DebugToolsPanelProps) {
  const panelId = `debug-tools-panel-${activeSection}`;

  function handleTabKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    sectionIndex: number,
  ) {
    let nextIndex: number | null = null;

    if (event.key === "ArrowRight") {
      nextIndex = (sectionIndex + 1) % debugToolSections.length;
    } else if (event.key === "ArrowLeft") {
      nextIndex =
        (sectionIndex - 1 + debugToolSections.length) % debugToolSections.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = debugToolSections.length - 1;
    }

    if (nextIndex === null) {
      return;
    }

    event.preventDefault();
    const nextSection = debugToolSections[nextIndex];
    onSectionChange(nextSection.id);
    document.getElementById(`debug-tools-tab-${nextSection.id}`)?.focus();
  }

  return (
    <section className="debug-tools" aria-label="Debug tools">
      <header className="debug-tools-header">
        <div>
          <h2>Debug Tools</h2>
          <p>Development-only controls</p>
        </div>
        <div className="debug-tools-pinned-controls">
          <button
            aria-pressed={superSpeedEnabled}
            className={superSpeedEnabled ? "active" : ""}
            onClick={onToggleSuperSpeed}
            type="button"
          >
            Super Speed {superSpeedEnabled ? "On" : "Off"}
          </button>
          <button
            aria-pressed={superExpEnabled}
            className={superExpEnabled ? "active" : ""}
            onClick={onToggleSuperExp}
            type="button"
          >
            Super EXP {superExpEnabled ? "On" : "Off"}
          </button>
        </div>
      </header>

      <div className="debug-tools-tabs" role="tablist" aria-label="Debug tool sections">
        {debugToolSections.map((section, sectionIndex) => (
          <button
            aria-controls={`debug-tools-panel-${section.id}`}
            aria-selected={activeSection === section.id}
            className={activeSection === section.id ? "active" : ""}
            id={`debug-tools-tab-${section.id}`}
            key={section.id}
            onClick={() => onSectionChange(section.id)}
            onKeyDown={(event) => handleTabKeyDown(event, sectionIndex)}
            role="tab"
            tabIndex={activeSection === section.id ? 0 : -1}
            type="button"
          >
            {section.label}
          </button>
        ))}
      </div>

      <div
        aria-labelledby={`debug-tools-tab-${activeSection}`}
        className="debug-tools-content"
        id={panelId}
        role="tabpanel"
      >
        {activeSection === "companion" ? (
          <div className="debug-tool-section">
            <h3>Companion</h3>
            <label className="debug-tool-field">
              <span>Selected companion</span>
              <select
                onChange={(event) => onSelectedCompanionChange(event.target.value)}
                value={selectedCompanionId}
              >
                {companions.map((companion) => (
                  <option key={companion.id} value={companion.id}>
                    {companion.displayName} · {companion.className} · Lv {companion.level}
                  </option>
                ))}
              </select>
            </label>
            <div className="debug-tool-grid">
              <button onClick={onCycleCompanionClass} type="button">
                Next Class · {nextCompanionClassName}
              </button>
              <button onClick={onRestoreCompanionHealth} type="button">Restore HP</button>
              <button onClick={onLevelUpCompanion} type="button">Level Up</button>
              <button onClick={onKillCompanion} type="button">Kill Companion</button>
            </div>
          </div>
        ) : null}

        {activeSection === "party" ? (
          <div className="debug-tool-section">
            <h3>Party</h3>
            <div className="debug-tool-grid">
              <button disabled={!canAddCompanion} onClick={onAddCompanion} type="button">Add Companion</button>
              <button disabled={!canRemoveCompanion} onClick={onRemoveCompanion} type="button">Remove Companion</button>
              <button onClick={onRestorePartyHealth} type="button">Restore Party HP</button>
              <button onClick={onLevelUpAllCompanions} type="button">Level Up All</button>
              <button
                aria-pressed={companionInfiniteHealthEnabled}
                className={companionInfiniteHealthEnabled ? "active" : ""}
                onClick={onToggleCompanionInfiniteHealth}
                type="button"
              >
                Infinite Health {companionInfiniteHealthEnabled ? "On" : "Off"}
              </button>
              <button onClick={onKillOneCompanion} type="button">Kill One Companion</button>
            </div>
          </div>
        ) : null}

        {activeSection === "movement" ? (
          <div className="debug-tool-section">
            <h3>Movement</h3>
            <div className="debug-tool-grid">
              <button onClick={onTeleportHubOne} type="button">Teleport Hub 1</button>
              <button onClick={onTeleportHubTwo} type="button">Teleport Hub 2</button>
              <button onClick={onTeleportSlimewardCamp} type="button">Teleport Slimeward Camp</button>
              <button onClick={onResetSlimewardDungeon} type="button">Reset Slimeward Dungeon</button>
              <button onClick={onRefreshGatherPoints} type="button">Refresh Gather Points</button>
            </div>
            <div className="debug-status-grid">
              <span>Direct Commands {directCommandCount}</span>
              <span>Rejoin Grace {directCommandGraceCount}</span>
              <span>Global POI {globalPoiText}</span>
              <span>Local POI {localPoiText}</span>
              <span>POI Reason {poiReasonText}</span>
            </div>
          </div>
        ) : null}

        {activeSection === "encounters" ? (
          <div className="debug-tool-section">
            <h3>Encounters</h3>
            <div className="debug-tool-inline-form">
              <label className="debug-tool-field">
                <span>Enemy type</span>
                <select
                  onChange={(event) => onSelectedEnemyTypeChange(event.target.value)}
                  value={selectedEnemyTypeId}
                >
                  {enemyGroups.map((group) => (
                    <optgroup key={group.mapId} label={group.mapDisplayName}>
                      {group.enemies.map((enemy) => (
                        <option key={enemy.id} value={enemy.id}>
                          {enemy.displayName} · Lv {enemy.level}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>
              <button onClick={onSummonEnemy} type="button">Summon</button>
            </div>
            <div className="debug-tool-grid">
              <button onClick={onResurrectEnemy} type="button">Resurrect Enemy</button>
              <button onClick={onForceSuperiorEnemy} type="button">Force Superior</button>
              <button onClick={onAddEnemiesToSubzone} type="button">Add Enemies to Subzone</button>
              <button onClick={onRemoveDebugEnemies} type="button">Remove Debug Enemies</button>
            </div>
          </div>
        ) : null}

        {activeSection === "progression" ? (
          <div className="debug-tool-section">
            <h3>Progression</h3>
            <div className="debug-tool-grid">
              <button onClick={onAddCrowns} type="button">+100 Crowns</button>
              <button onClick={onAddFlasks} type="button">Add Flasks</button>
              <button onClick={onAddCraftingMaterials} type="button">Add Craft Materials x20</button>
              <button onClick={onFinishCurrentQuest} type="button">Finish Current Quest</button>
              <button onClick={onTurnInCurrentQuest} type="button">Turn In Current Quest</button>
            </div>
            <div className="debug-status-grid">
              <span>Quest {questStatusText}</span>
              <span>Objective {questObjectiveText}</span>
            </div>
          </div>
        ) : null}

        {activeSection === "town" ? (
          <div className="debug-tool-section">
            <h3>Town</h3>
            <div className="debug-tool-grid">
              <button
                disabled={townServicesUnlocked}
                onClick={onUnlockTownServices}
                type="button"
              >
                {townServicesUnlocked
                  ? "Town Services Unlocked"
                  : "Unlock Town Services"}
              </button>
            </div>
            <div className="debug-tool-inline-form">
              <label className="debug-tool-field">
                <span>Farm crop</span>
                <select
                  onChange={(event) => onSelectedCropChange(event.target.value)}
                  value={selectedCropId}
                >
                  {cropOptions.map((crop) => (
                    <option key={crop.id} value={crop.id}>
                      {crop.displayName}{crop.unlocked ? " · Unlocked" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <button disabled={selectedCropUnlocked} onClick={onUnlockCrop} type="button">
                {selectedCropUnlocked ? "Crop Unlocked" : "Unlock Crop"}
              </button>
            </div>
            <div className="debug-tool-inline-form">
              <label className="debug-tool-field">
                <span>Livestock creature</span>
                <select
                  onChange={(event) => onSelectedCreatureChange(event.target.value)}
                  value={selectedCreatureId}
                >
                  {creatureOptions.map((creature) => (
                    <option key={creature.id} value={creature.id}>
                      {creature.displayName} · Owned {creature.ownedCount}
                    </option>
                  ))}
                </select>
              </label>
              <button onClick={onAddOwnedCreature} type="button">Add Owned Creature</button>
            </div>
          </div>
        ) : null}

        {activeSection === "debug" ? (
          <div className="debug-tool-section">
            <h3>Debug</h3>
            <div className="debug-tool-grid">
              <button onClick={onToggleEntityInfo} type="button">
                {entityInfoVisible ? "Hide Entity Info" : "Show Entity Info"}
              </button>
              <button onClick={onToggleTelemetryRecording} type="button">
                {telemetryRecording ? "Stop Debug Recording" : "Start Debug Recording"}
              </button>
              <button onClick={onExportTelemetry} type="button">Export Debug JSON</button>
              <button onClick={onExportAndClearTelemetry} type="button">Export &amp; Clear JSON</button>
              <button onClick={onClearTelemetry} type="button">Clear Debug Report</button>
              <button onClick={onReleaseRendererCache} type="button">Release Renderer Cache</button>
            </div>
            <div className="debug-status-grid">
              <span>
                Recording {telemetryRecording ? "On" : "Off"} · Samples {telemetrySampleCount}/{telemetryMaxSamples} · Events {telemetryEventCount}
              </span>
            </div>
          </div>
        ) : null}

        <p aria-live="polite" className="debug-tools-feedback">
          {actionFeedback ?? "Ready."}
        </p>
      </div>
    </section>
  );
}
