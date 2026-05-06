import { useEffect, useRef, useState } from "react";
import "./App.css";

import {
  addEnemy,
  addEntity,
  createCompanion,
  createDebugMap,
  createEmptyResourceInventory,
  createEnemy,
  createPlayer,
  createResource,
  clearDebugTelemetry,
  debugAddCompanionToParty,
  debugRefreshResources,
  debugRandomizeLocations,
  debugRemoveCompanionFromParty,
  debugResurrectEnemy,
  debugRestorePartyHealth,
  exportDebugTelemetryReport,
  issueCompanionCommands,
  isCombatEntity,
  setAutoModeEnabled,
  setLeaderIntent,
  setPartyLeader,
  setPartyMemberRole,
  setPartyOrder,
  startGameLoop,
  startDebugTelemetryRecording,
  stopDebugTelemetryRecording,
  updateEntity,
  type Companion,
  type CombatEntity,
  type Enemy,
  type GameEntity,
  type GameState,
  type PartyMemberRole,
  type Player,
  type ResourceEntity,
  type ResourceType,
} from "./game";

const playerId = "test-player";
const companionIds = ["test-companion", "test-companion-2", "test-companion-3"];
const partyMemberRoleOptions: PartyMemberRole[] = [
  "none",
  "defender",
  "fighter",
  "support",
  "gatherer",
];
const enemyIds = [
  "test-enemy",
  "test-enemy-2",
  "test-enemy-3",
  "test-enemy-4",
  "test-enemy-5",
  "test-enemy-6",
  "test-enemy-7",
  "test-enemy-8",
  "test-enemy-9",
  "test-enemy-10",
  "test-enemy-11",
  "test-enemy-12",
  "test-enemy-13",
  "test-enemy-14",
];
const resourceIds = [
  "test-resource-wood",
  "test-resource-ore",
  "test-resource-herb",
  "test-resource-wood-2",
  "test-resource-ore-2",
  "test-resource-herb-2",
  "test-resource-wood-3",
  "test-resource-ore-3",
  "test-resource-herb-3",
  "test-resource-wood-4",
];
const debugMap = createDebugMap();
const cellSize = 28;
const gridColumns = debugMap.columns;
const gridRows = debugMap.rows;
const companionStartPositions = [
  { x: 3, y: 2 },
  { x: 3, y: 3 },
  { x: 4, y: 2 },
];
const enemyStartPositions = [
  { x: 30, y: 2 },
  { x: 22, y: 5 },
  { x: 32, y: 8 },
  { x: 14, y: 10 },
  { x: 2, y: 15 },
  { x: 24, y: 13 },
  { x: 31, y: 16 },
  { x: 5, y: 20 },
  { x: 17, y: 20 },
  { x: 29, y: 22 },
  { x: 11, y: 24 },
  { x: 20, y: 25 },
  { x: 33, y: 5 },
  { x: 4, y: 7 },
];
const resourceStartData: {
  id: string;
  position: { x: number; y: number };
  resourceType: ResourceType;
}[] = [
  { id: resourceIds[0], position: { x: 2, y: 5 }, resourceType: "wood" },
  { id: resourceIds[1], position: { x: 12, y: 2 }, resourceType: "ore" },
  { id: resourceIds[2], position: { x: 17, y: 5 }, resourceType: "herb" },
  { id: resourceIds[3], position: { x: 6, y: 13 }, resourceType: "wood" },
  { id: resourceIds[4], position: { x: 30, y: 10 }, resourceType: "ore" },
  { id: resourceIds[5], position: { x: 25, y: 15 }, resourceType: "herb" },
  { id: resourceIds[6], position: { x: 9, y: 22 }, resourceType: "wood" },
  { id: resourceIds[7], position: { x: 16, y: 24 }, resourceType: "ore" },
  { id: resourceIds[8], position: { x: 32, y: 24 }, resourceType: "herb" },
  { id: resourceIds[9], position: { x: 22, y: 12 }, resourceType: "wood" },
];

function formatCoordinate(value: number): string {
  return value.toFixed(1);
}

function getPartyMarkerClass(entityId: string, leaderId: string): string {
  return `entity-marker companion${entityId === leaderId ? " leader" : ""}`;
}

function createInitialState(): GameState {
  const player = createPlayer(playerId, { x: 2, y: 2 });
  const companion = createCompanion(
    companionIds[0],
    companionStartPositions[0],
    playerId,
    "gatherer",
  );
  const enemies = enemyIds.map((enemyId, index) =>
    createEnemy(enemyId, enemyStartPositions[index], "aggressive"),
  );
  const resources = resourceStartData.map((resource) =>
    createResource(resource.id, resource.position, {
      resourceType: resource.resourceType,
    }),
  );

  const baseState = [player, companion, ...resources].reduce(addEntity, {
    entities: {},
    inventory: createEmptyResourceInventory(),
    map: debugMap,
    autoModeEnabled: false,
    simulationTick: 0,
    partyLeaderId: player.id,
    leaderIntent: null,
    exploredTiles: {
      [`${player.position.x},${player.position.y}`]: true,
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

  const player = gameState.entities[playerId] as Player;
  const companions = companionIds
    .map((id) => gameState.entities[id] as Companion | undefined)
    .filter((companion): companion is Companion => Boolean(companion));
  const activeCompanionIds = companions.map((companion) => companion.id);
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
  const inventory = gameState.inventory;

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

  function changePartyOrder(entityId: string, partyOrder: number) {
    setGameState((state) => setPartyOrder(state, entityId, partyOrder));
  }

  function changePartyLeader(entityId: string) {
    setGameState((state) => setPartyLeader(state, entityId));
  }

  function commandCompanionsToFollow() {
    if (activeCompanionIds.length === 0) {
      return;
    }

    setGameState((state) =>
      issueCompanionCommands(state, activeCompanionIds, {
        type: "follow",
        targetId: playerId,
      }),
    );
  }

  function commandCompanionsToIdle() {
    if (activeCompanionIds.length === 0) {
      return;
    }

    setGameState((state) =>
      issueCompanionCommands(state, activeCompanionIds, {
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

      return (leader?.kind === "player" || leader?.kind === "companion")
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
    if (activeCompanionIds.length === 0 || !targetResourceId) {
      return;
    }

    setGameState((state) =>
      issueCompanionCommands(state, activeCompanionIds, {
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
        playerId,
        companionStartPositions,
      ),
    );
  }

  function removeCompanionFromParty() {
    setGameState((state) => debugRemoveCompanionFromParty(state, companionIds));
  }

  function randomizeLocations() {
    setGameState((state) =>
      debugRandomizeLocations(state, gridColumns, gridRows),
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

  return (
    <main className="game-page">
      <section className="game-panel">
        <h1>Follow System Test</h1>

        <div className="test-area" aria-label="Follow system top-down test area">
          {debugMap.walls.map((wall) => (
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
          <div
            className={getPartyMarkerClass(player.id, gameState.partyLeaderId)}
            style={{
              transform: `translate(${player.position.x * cellSize}px, ${
                player.position.y * cellSize
              }px)`,
            }}
            title="Player"
          >
            <span className="map-marker-id">1</span>
            <EntityDebugLabel
              name="Player"
              entity={player}
              detail={`HP ${player.health} GS ${player.gatherSpeed}`}
              isVisible={showEntityInfo}
            />
            <HealthBar entity={player} />
            <AttackCooldownIndicator entity={player} currentTime={currentTime} />
          </div>
          {companions.map((companion, index) => (
            <div
              key={companion.id}
              className={getPartyMarkerClass(companion.id, gameState.partyLeaderId)}
              style={{
                transform: `translate(${companion.position.x * cellSize}px, ${
                  companion.position.y * cellSize
                }px)`,
              }}
              title="Companion"
            >
              <span className="map-marker-id">{index + 2}</span>
              <EntityDebugLabel
                name={`C${index + 2}`}
                entity={companion}
                detail={`HP ${companion.health} GS ${companion.gatherSpeed} Role ${companion.role}`}
                isVisible={showEntityInfo}
              />
              <HealthBar entity={companion} />
              <AttackCooldownIndicator
                entity={companion}
                currentTime={currentTime}
              />
            </div>
          ))}
          {enemies.map((enemy, index) =>
            enemy.state === "dead" ? (
              <div
                key={enemy.id}
                className="dead-label"
                style={{
                  transform: `translate(${enemy.position.x * cellSize}px, ${
                    enemy.position.y * cellSize
                  }px)`,
                }}
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
                key={enemy.id}
                className="entity-marker enemy"
                onClick={() => commandPartyToTargetEnemy(enemy.id)}
                style={{
                  transform: `translate(${enemy.position.x * cellSize}px, ${
                    enemy.position.y * cellSize
                  }px)`,
                }}
                title="Enemy"
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
                key={resource.id}
                className="depleted-label"
                style={{
                  transform: `translate(${resource.position.x * cellSize}px, ${
                    resource.position.y * cellSize
                  }px)`,
                }}
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
                key={resource.id}
                className={`entity-marker resource ${resource.resourceType}`}
                onClick={() => commandCompanionsToGatherResource(resource.id)}
                style={{
                  transform: `translate(${resource.position.x * cellSize}px, ${
                    resource.position.y * cellSize
                  }px)`,
                }}
                title="Resource"
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
                Player ({formatCoordinate(player.position.x)},{" "}
                {formatCoordinate(player.position.y)}) | State{" "}
                {player.state} | HP {player.health} | Target{" "}
                {player.currentTargetId ?? "none"} | Gather Speed{" "}
                {player.gatherSpeed} | Role {player.role} | Order{" "}
                {player.partyOrder} | Leader{" "}
                {gameState.partyLeaderId === player.id ? "yes" : "no"} |
                Party {companions.length + 1}/4 | Enemies Alive{" "}
                {enemies.filter((enemy) => enemy.state !== "dead").length}/
                {enemies.length} | Resources Available{" "}
                {resources.filter((resource) => !resource.isDepleted).length}/
                {resources.length} | Inventory Wood{" "}
                {inventory.wood} Ore {inventory.ore} Herb {inventory.herb} |
                Auto Mode {gameState.autoModeEnabled ? "On" : "Off"} |
                Explored {Object.keys(gameState.exploredTiles).length}
              </span>
              <div className="companion-status-list">
                <label className="companion-role-control">
                  <span>Player role/order</span>
                  <select
                    value={player.role}
                    onChange={(event) =>
                      changePartyMemberRole(
                        player.id,
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
                    value={player.partyOrder}
                    onChange={(event) =>
                      changePartyOrder(player.id, Number(event.target.value))
                    }
                  />
                  <button onClick={() => changePartyLeader(player.id)}>
                    Set Leader
                  </button>
                </label>
                {companions.length > 0
                  ? companions.map((companion, index) => (
                      <label
                        key={companion.id}
                        className="companion-role-control"
                      >
                        <span>
                          C{index + 1} ({formatCoordinate(companion.position.x)},{" "}
                          {formatCoordinate(companion.position.y)}) | State {companion.state} |
                          HP {companion.health} | Target{" "}
                          {companion.currentTargetId ?? "none"} | Gather Speed{" "}
                          {companion.gatherSpeed} | Order{" "}
                          {companion.partyOrder} | Leader{" "}
                          {gameState.partyLeaderId === companion.id ? "yes" : "no"}
                        </span>
                        <select
                          value={companion.role}
                          onChange={(event) =>
                            changePartyMemberRole(
                              companion.id,
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
                          value={companion.partyOrder}
                          onChange={(event) =>
                            changePartyOrder(
                              companion.id,
                              Number(event.target.value),
                            )
                          }
                        />
                        <button onClick={() => changePartyLeader(companion.id)}>
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
