import { useEffect, useRef, useState } from "react";
import "./App.css";

import {
  addEnemy,
  addEntity,
  CLASS_DEFINITIONS,
  companionIds,
  companionStartPositions,
  createCompanion,
  createDebugMap,
  createEmptyResourceInventory,
  createEnemy,
  createResource,
  DEBUG_MAP_COLUMNS,
  DEBUG_MAP_ROWS,
  clearDebugTelemetry,
  debugAddCompanionToParty,
  debugRefreshResources,
  debugRandomizeLocations,
  debugRemoveCompanionFromParty,
  debugResurrectEnemy,
  debugRestorePartyHealth,
  enemyIds,
  exportDebugTelemetryReport,
  issueCompanionCommands,
  isCombatEntity,
  mapOneEnemyStartPositions,
  mapOneResourceStartData,
  MAP_ONE_ID,
  resourceIds,
  setMapTeleportPoi,
  setAutoModeEnabled,
  setLeaderIntent,
  setPartyLeader,
  setPartyMemberClass,
  setPartyMemberRole,
  setPartyOrder,
  startGameLoop,
  startDebugTelemetryRecording,
  stopDebugTelemetryRecording,
  teleporterPosition,
  TELEPORTER_RANGE,
  updateEntity,
  type Companion,
  type ClassId,
  type CombatEntity,
  type Enemy,
  type GameEntity,
  type GameState,
  type PartyMemberRole,
  type ResourceEntity,
} from "./game";

const partyMemberRoleOptions: PartyMemberRole[] = [
  "none",
  "defender",
  "fighter",
  "support",
  "gatherer",
];
const partyMemberClassOptions: ClassId[] = [
  "beginner",
  "blade",
  "aegis",
  "hunter",
  "beast",
  "elementalist",
  "runecaster",
  "lightbearer",
  "penitent",
];
const debugMap = createDebugMap();
const cellSize = 28;

function formatCoordinate(value: number): string {
  return value.toFixed(1);
}

function formatResourceName(resourceType: ResourceEntity["resourceType"]): string {
  return resourceType.charAt(0).toUpperCase() + resourceType.slice(1);
}

function formatTargetId(entity: CombatEntity): string {
  return entity.currentTargetId ?? "none";
}

function getResourceTooltip(resource: ResourceEntity): string {
  return [
    formatResourceName(resource.resourceType),
    `Durability ${resource.durability}/${resource.maxDurability}`,
    `Resources left ${resource.quantity}`,
  ].join("\n");
}

function getEnemyTooltip(enemy: Enemy): string {
  return [
    "Enemy",
    `HP ${enemy.health}/${enemy.maxHealth}`,
    `State ${enemy.state}`,
    `Target ${formatTargetId(enemy)}`,
    `Aggression ${enemy.aggressionMode}`,
  ].join("\n");
}

function getPartyMarkerClass(member: Companion, leaderId: string): string {
  if (member.id === leaderId) {
    return "entity-marker companion leader";
  }

  const classPath = CLASS_DEFINITIONS[member.classId].path;
  const classPathClass = classPath ? ` class-path-${classPath}` : "";

  return `entity-marker companion${classPathClass}`;
}

function createInitialState(): GameState {
  const leader = createCompanion(
    companionIds[0],
    companionStartPositions[0],
    companionIds[0],
    "none",
    0,
  );
  const gatherer = createCompanion(
    companionIds[1],
    companionStartPositions[1],
    leader.id,
    "gatherer",
    1,
  );
  const enemies = enemyIds.map((enemyId, index) =>
    createEnemy(enemyId, mapOneEnemyStartPositions[index], "aggressive"),
  );
  const resources = mapOneResourceStartData.map((resource) =>
    createResource(resource.id, resource.position, {
      resourceType: resource.resourceType,
    }),
  );

  const baseState = [leader, gatherer, ...resources].reduce(addEntity, {
    entities: {},
    inventory: createEmptyResourceInventory(),
    map: debugMap,
    currentMapId: MAP_ONE_ID,
    activeTeleport: null,
    autoModeEnabled: false,
    simulationTick: 0,
    partyLeaderId: leader.id,
    leaderIntent: null,
    exploredTiles: {
      [`${leader.position.x},${leader.position.y}`]: true,
    },
    followTrailsByEntityId: {},
    combatFeedbackEvents: [],
  });

  return enemies.reduce(addEnemy, baseState);
}

function EntityDebugLabel({
  name,
  entity,
  detail,
  isVisible,
}: {
  name: string;
  entity: GameEntity;
  detail?: string;
  isVisible: boolean;
}) {
  const targetId = "currentTargetId" in entity ? entity.currentTargetId : null;

  if (!isVisible) {
    return null;
  }

  return (
    <span className="entity-label">
      {name}
      {detail ? ` ${detail}` : ""}
      <br />
      State {entity.state}
      <br />
      Target {targetId ?? "none"}
    </span>
  );
}

type HealthBarEntity = GameEntity & {
  health: number;
  maxHealth: number;
};

function hasHealthBar(entity: GameEntity): entity is HealthBarEntity {
  return "health" in entity && "maxHealth" in entity;
}

function HealthBar({ entity }: { entity: HealthBarEntity }) {
  const healthPercent =
    entity.maxHealth > 0
      ? Math.max(0, Math.min(100, (entity.health / entity.maxHealth) * 100))
      : 0;

  return (
    <span
      className="health-bar"
      title={`HP ${entity.health}/${entity.maxHealth}`}
    >
      <span style={{ width: `${healthPercent}%` }} />
    </span>
  );
}

function AttackCooldownIndicator({
  entity,
  currentTime,
}: {
  entity: CombatEntity;
  currentTime: number;
}) {
  const cooldownProgress = Math.max(
    0,
    1 - (currentTime - entity.lastAttackAt) / 1000,
  );

  if (cooldownProgress <= 0 || entity.state === "dead") {
    return null;
  }

  return (
    <span className="attack-cooldown">
      <span style={{ width: `${cooldownProgress * 100}%` }} />
    </span>
  );
}

function App() {
  const [gameState, setGameState] = useState<GameState>(createInitialState);
  const [isSimulationRunning, setIsSimulationRunning] = useState(false);
  const [showEntityInfo, setShowEntityInfo] = useState(true);
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const stopLoopRef = useRef<(() => void) | null>(null);
  const currentMap = gameState.map ?? debugMap;

  const partyMembers = companionIds
    .map((id) => gameState.entities[id] as Companion | undefined)
    .filter((companion): companion is Companion => Boolean(companion));
  const activePartyMemberIds = partyMembers.map((companion) => companion.id);
  const leader = partyMembers.find(
    (member) => member.id === gameState.partyLeaderId,
  ) ?? partyMembers[0];
  const enemies = enemyIds
    .map((id) => gameState.entities[id] as Enemy | undefined)
    .filter((enemy): enemy is Enemy => Boolean(enemy));
  const resources = resourceIds
    .map((id) => gameState.entities[id] as ResourceEntity | undefined)
    .filter((resource): resource is ResourceEntity => Boolean(resource));
  const targetEnemy = enemies.find((enemy) => enemy.state !== "dead");
  const targetResource = resources.find((resource) => !resource.isDepleted);
  const poiTarget = gameState.leaderIntent?.targetId
    ? gameState.entities[gameState.leaderIntent.targetId]
    : null;
  const enemyPoiPosition =
    poiTarget?.kind === "enemy" && poiTarget.state !== "dead"
      ? poiTarget.position
      : null;
  const gathererTargetResourceIds = new Set(
    partyMembers
      .filter(
        (entity) =>
          entity.role === "gatherer" &&
          entity.state === "gather" &&
          Boolean(entity.currentTargetId),
      )
      .map((entity) => entity.currentTargetId),
  );
  const inventory = gameState.inventory;
  const showTeleporter = gameState.currentMapId === MAP_ONE_ID;
  const activeTeleport = gameState.activeTeleport;
  const isTeleporterPoi =
    gameState.leaderIntent?.type === "move" &&
    gameState.leaderIntent.targetPosition &&
    Math.hypot(
      gameState.leaderIntent.targetPosition.x - teleporterPosition.x,
      gameState.leaderIntent.targetPosition.y - teleporterPosition.y,
    ) <= 0.001;

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setCurrentTime(Date.now());
    }, 100);

    return () => {
      window.clearInterval(intervalId);
      stopLoopRef.current?.();
    };
  }, []);

  function toggleSimulationLoop() {
    if (stopLoopRef.current) {
      stopLoopRef.current();
      stopLoopRef.current = null;
      setIsSimulationRunning(false);
      return;
    }

    stopLoopRef.current = startGameLoop(setGameState);
    setIsSimulationRunning(true);
  }

  function toggleAutoMode() {
    setGameState((state) =>
      setAutoModeEnabled(state, !state.autoModeEnabled),
    );
  }

  function changePartyMemberRole(
    entityId: string,
    role: PartyMemberRole,
  ) {
    setGameState((state) => setPartyMemberRole(state, entityId, role));
  }

  function changePartyMemberClass(entityId: string, classId: ClassId) {
    setGameState((state) => setPartyMemberClass(state, entityId, classId));
  }

  function changePartyOrder(entityId: string, partyOrder: number) {
    setGameState((state) => setPartyOrder(state, entityId, partyOrder));
  }

  function changePartyLeader(entityId: string) {
    setGameState((state) => setPartyLeader(state, entityId));
  }

  function commandCompanionsToFollow() {
    if (!leader || activePartyMemberIds.length === 0) {
      return;
    }

    setGameState((state) =>
      issueCompanionCommands(
        state,
        activePartyMemberIds.filter(
          (entityId) => entityId !== state.partyLeaderId,
        ),
        {
          type: "follow",
          targetId: state.partyLeaderId,
        },
      ),
    );
  }

  function commandCompanionsToIdle() {
    if (activePartyMemberIds.length === 0) {
      return;
    }

    setGameState((state) =>
      issueCompanionCommands(state, activePartyMemberIds, {
        type: "idle",
      }),
    );
  }

  function commandPartyToTargetEnemy(targetEnemyId = targetEnemy?.id) {
    if (!targetEnemyId) {
      return;
    }

    setGameState((state) => {
      const target = state.entities[targetEnemyId];
      const leader = state.entities[state.partyLeaderId];
      const leaderIntentState = setLeaderIntent(state, {
        type: "attack",
        targetId: targetEnemyId,
        targetPosition: target?.position ?? null,
      });

      return leader?.kind === "companion"
        ? updateEntity(leaderIntentState, {
            ...leader,
            state: "follow",
            currentTargetId: targetEnemyId,
            commandPriority: "autonomous",
          })
        : leaderIntentState;
    });
  }

  function commandCompanionsToGatherResource(targetResourceId = targetResource?.id) {
    if (activePartyMemberIds.length === 0 || !targetResourceId) {
      return;
    }

    setGameState((state) =>
      issueCompanionCommands(state, activePartyMemberIds, {
        type: "gather",
        targetId: targetResourceId,
      }),
    );
  }

  function addCompanionToParty() {
    setGameState((state) =>
      debugAddCompanionToParty(
        state,
        companionIds,
        state.partyLeaderId,
        companionStartPositions,
      ),
    );
  }

  function removeCompanionFromParty() {
    setGameState((state) => debugRemoveCompanionFromParty(state, companionIds));
  }

  function randomizeLocations() {
    setGameState((state) =>
      debugRandomizeLocations(state, DEBUG_MAP_COLUMNS, DEBUG_MAP_ROWS),
    );
  }

  function resurrectEnemy() {
    setGameState((state) =>
      enemyIds.reduce(debugResurrectEnemy, state),
    );
  }

  function refreshGatherPoints() {
    setGameState(debugRefreshResources);
  }

  function restorePartyHealth() {
    setGameState(debugRestorePartyHealth);
  }

  function toggleEntityInfo() {
    setShowEntityInfo((isVisible) => !isVisible);
  }

  function toggleDebugTelemetryRecording() {
    setGameState((state) =>
      state.debugTelemetry?.isRecording
        ? stopDebugTelemetryRecording(state)
        : startDebugTelemetryRecording(state),
    );
  }

  function clearDebugTelemetryReport() {
    setGameState(clearDebugTelemetry);
  }

  function exportDebugTelemetryJson() {
    const report = exportDebugTelemetryReport(gameState);
    const blob = new Blob([JSON.stringify(report, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `debug-telemetry-${new Date()
      .toISOString()
      .replace(/[:.]/g, "-")}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function triggerTeleport() {
    setGameState(setMapTeleportPoi);
  }

  return (
    <main className="game-page">
      <section className="game-panel">
        <h1>Follow System Test</h1>

        <div
          key={gameState.currentMapId ?? MAP_ONE_ID}
          className="test-area"
          aria-label="Follow system top-down test area"
        >
          {currentMap.walls.map((wall) => (
            <div
              key={`${wall.x}-${wall.y}`}
              className="wall-tile"
              style={{
                transform: `translate(${wall.x * cellSize}px, ${
                  wall.y * cellSize
                }px)`,
              }}
            />
          ))}
          {showTeleporter ? (
            <>
              {activeTeleport ? (
                <div
                  className="teleport-range"
                  style={{
                    width: TELEPORTER_RANGE * cellSize * 2,
                    height: TELEPORTER_RANGE * cellSize * 2,
                    transform: `translate(${
                      (teleporterPosition.x - TELEPORTER_RANGE) * cellSize
                    }px, ${
                      (teleporterPosition.y - TELEPORTER_RANGE) * cellSize
                    }px)`,
                  }}
                  title="Teleport rally range"
                />
              ) : null}
              {isTeleporterPoi && !activeTeleport ? (
                <div
                  className="poi-ring teleport-poi"
                  style={{
                    transform: `translate(${teleporterPosition.x * cellSize}px, ${
                      teleporterPosition.y * cellSize
                    }px)`,
                  }}
                  title="Teleport point of interest"
                />
              ) : null}
              <button
                className="teleporter"
                onClick={triggerTeleport}
                style={{
                  transform: `translate(${teleporterPosition.x * cellSize}px, ${
                    teleporterPosition.y * cellSize
                  }px)`,
                }}
                title="Teleport to map 2"
                type="button"
              />
            </>
          ) : null}
          {gameState.combatFeedbackEvents.map((event) => {
            const entity = gameState.entities[event.entityId];

            if (!entity) {
              return null;
            }

            return (
              <div
                key={event.id}
                className={`combat-feedback ${event.type}`}
                style={{
                  transform: `translate(${entity.position.x * cellSize}px, ${
                    entity.position.y * cellSize
                  }px)`,
                }}
              >
                {event.text}
              </div>
            );
          })}
          {enemyPoiPosition ? (
            <div
              className="poi-ring enemy-poi"
              style={{
                transform: `translate(${enemyPoiPosition.x * cellSize}px, ${
                  enemyPoiPosition.y * cellSize
                }px)`,
              }}
              title="Enemy point of interest"
            />
          ) : null}
          {partyMembers.map((member, index) => (
            <div
              key={member.id}
              className={getPartyMarkerClass(member, gameState.partyLeaderId)}
              style={{
                transform: `translate(${member.position.x * cellSize}px, ${
                  member.position.y * cellSize
                }px)`,
              }}
              title="Party member"
            >
              <span className="map-marker-id">{index + 1}</span>
              <EntityDebugLabel
                name={`C${index + 1}`}
                entity={member}
                detail={`HP ${member.health} GS ${member.gatherSpeed} Role ${member.role}`}
                isVisible={showEntityInfo}
              />
              <HealthBar entity={member} />
              <AttackCooldownIndicator
                entity={member}
                currentTime={currentTime}
              />
            </div>
          ))}
          {enemies.map((enemy, index) =>
            enemy.state === "dead" ? (
              <div
                key={`${gameState.currentMapId ?? MAP_ONE_ID}-${enemy.id}`}
                className="dead-label"
                style={{
                  transform: `translate(${enemy.position.x * cellSize}px, ${
                    enemy.position.y * cellSize
                  }px)`,
                }}
                title={getEnemyTooltip(enemy)}
              >
                {showEntityInfo ? (
                  <>
                    E{index + 1}
                    <br />
                    State {enemy.state}
                    <br />
                    Target {enemy.currentTargetId ?? "none"}
                  </>
                ) : null}
                <HealthBar entity={enemy} />
              </div>
            ) : (
              <div
                key={`${gameState.currentMapId ?? MAP_ONE_ID}-${enemy.id}`}
                className="entity-marker enemy"
                onClick={() => commandPartyToTargetEnemy(enemy.id)}
                style={{
                  transform: `translate(${enemy.position.x * cellSize}px, ${
                    enemy.position.y * cellSize
                  }px)`,
                }}
                title={getEnemyTooltip(enemy)}
              >
                <span className="map-marker-id">{index + 1}</span>
                <EntityDebugLabel
                  name={`E${index + 1}`}
                  entity={enemy}
                  detail={`HP ${enemy.health} Aggro ${enemy.aggressionMode}`}
                  isVisible={showEntityInfo}
                />
                {hasHealthBar(enemy) ? <HealthBar entity={enemy} /> : null}
                {isCombatEntity(enemy) ? (
                  <AttackCooldownIndicator
                    entity={enemy}
                    currentTime={currentTime}
                  />
                ) : null}
              </div>
            ),
          )}
          {resources.map((resource) =>
            resource.isDepleted ? (
              <div
                key={`${gameState.currentMapId ?? MAP_ONE_ID}-${resource.id}`}
                className="depleted-label"
                style={{
                  transform: `translate(${resource.position.x * cellSize}px, ${
                    resource.position.y * cellSize
                  }px)`,
                }}
                title={getResourceTooltip(resource)}
              >
                {showEntityInfo ? (
                  <>
                    {resource.resourceType}
                    <br />
                    Depleted
                    <br />
                    Quantity {resource.quantity}
                  </>
                ) : null}
              </div>
            ) : (
              <div
                key={`${gameState.currentMapId ?? MAP_ONE_ID}-${resource.id}`}
                className={`entity-marker resource ${resource.resourceType}${
                  gathererTargetResourceIds.has(resource.id)
                    ? " gatherer-target"
                    : ""
                }`}
                onClick={() => commandCompanionsToGatherResource(resource.id)}
                style={{
                  transform: `translate(${resource.position.x * cellSize}px, ${
                    resource.position.y * cellSize
                  }px)`,
                }}
                title={getResourceTooltip(resource)}
              >
                <EntityDebugLabel
                  name={resource.resourceType}
                  entity={resource}
                  detail={`${resource.durability}/${resource.maxDurability} Qty ${resource.quantity}`}
                  isVisible={showEntityInfo}
                />
              </div>
            ),
          )}
        </div>

        <div className="test-controls">
          <button onClick={toggleSimulationLoop}>
            {isSimulationRunning ? "Stop Simulation" : "Start Simulation"}
          </button>
          <button onClick={toggleAutoMode}>
            Auto Mode {gameState.autoModeEnabled ? "On" : "Off"}
          </button>
          <button onClick={commandCompanionsToFollow}>Follow All</button>
          <button onClick={commandCompanionsToIdle}>Idle All</button>
          <button onClick={() => commandPartyToTargetEnemy()}>
            Target Enemy
          </button>
          <button onClick={() => commandCompanionsToGatherResource()}>
            Gather Resource All
          </button>
          {showEntityInfo ? (
            <>
              <span>
                Leader {leader ? `C${partyMembers.indexOf(leader) + 1}` : "none"} |
                Party {partyMembers.length}/4 | Enemies Alive{" "}
                {enemies.filter((enemy) => enemy.state !== "dead").length}/
                {enemies.length} | Resources Available{" "}
                {resources.filter((resource) => !resource.isDepleted).length}/
                {resources.length} | Inventory Wood{" "}
                {inventory.wood} Ore {inventory.ore} Herb {inventory.herb} |
                Map {gameState.currentMapId ?? MAP_ONE_ID} |
                Teleport {activeTeleport ? "Rallying" : isTeleporterPoi ? "POI" : "Idle"} |
                Auto Mode {gameState.autoModeEnabled ? "On" : "Off"} |
                Explored {Object.keys(gameState.exploredTiles).length}
              </span>
              <div className="companion-status-list">
                {partyMembers.length > 0
                  ? partyMembers.map((member, index) => (
                      <label
                        key={member.id}
                        className="companion-role-control"
                      >
                        <span>
                          C{index + 1} ({formatCoordinate(member.position.x)},{" "}
                          {formatCoordinate(member.position.y)}) | State {member.state} |
                          HP {member.health} | Target{" "}
                          {member.currentTargetId ?? "none"} | Gather Speed{" "}
                          {member.gatherSpeed} | Class{" "}
                          {CLASS_DEFINITIONS[member.classId].displayName} | Role{" "}
                          {member.role} | Order{" "}
                          {member.partyOrder} | Leader{" "}
                          {gameState.partyLeaderId === member.id ? "yes" : "no"}
                        </span>
                        <select
                          value={member.classId}
                          onChange={(event) =>
                            changePartyMemberClass(
                              member.id,
                              event.target.value as ClassId,
                            )
                          }
                        >
                          {partyMemberClassOptions.map((classId) => (
                            <option key={classId} value={classId}>
                              {CLASS_DEFINITIONS[classId].displayName}
                            </option>
                          ))}
                        </select>
                        <select
                          value={member.role}
                          onChange={(event) =>
                            changePartyMemberRole(
                              member.id,
                              event.target.value as PartyMemberRole,
                            )
                          }
                        >
                          {partyMemberRoleOptions.map((role) => (
                            <option key={role} value={role}>
                              {role}
                            </option>
                          ))}
                        </select>
                        <input
                          type="number"
                          value={member.partyOrder}
                          onChange={(event) =>
                            changePartyOrder(
                              member.id,
                              Number(event.target.value),
                            )
                          }
                        />
                        <button onClick={() => changePartyLeader(member.id)}>
                          Set Leader
                        </button>
                      </label>
                    ))
                  : "No companions in party"}
              </div>
            </>
          ) : null}
        </div>

        <section className="debug-tools" aria-label="Debug tools">
          <h2>Debug Tools</h2>
          <div className="test-controls">
            <button onClick={addCompanionToParty}>Add Companion to Party</button>
            <button onClick={removeCompanionFromParty}>
              Remove Companion from Party
            </button>
            <button onClick={randomizeLocations}>
              Randomize Locations
            </button>
            <button onClick={resurrectEnemy}>Resurrect Enemy</button>
            <button onClick={restorePartyHealth}>Restore Party HP</button>
            <button onClick={refreshGatherPoints}>
              Refresh Gather Points
            </button>
            <button onClick={toggleEntityInfo}>
              {showEntityInfo ? "Hide Entity Info" : "Show Entity Info"}
            </button>
            <button onClick={toggleDebugTelemetryRecording}>
              {gameState.debugTelemetry?.isRecording
                ? "Stop Debug Recording"
                : "Start Debug Recording"}
            </button>
            <button onClick={exportDebugTelemetryJson}>
              Export Debug JSON
            </button>
            <button onClick={clearDebugTelemetryReport}>
              Clear Debug Report
            </button>
            <span>
              Debug Recording{" "}
              {gameState.debugTelemetry?.isRecording ? "On" : "Off"} | Ticks{" "}
              {gameState.debugTelemetry?.ticks.length ?? 0}/
              {gameState.debugTelemetry?.maxTicks ?? 1000} | Events{" "}
              {gameState.debugTelemetry?.events.length ?? 0}
            </span>
          </div>
        </section>
      </section>
    </main>
  );
}

export default App;
