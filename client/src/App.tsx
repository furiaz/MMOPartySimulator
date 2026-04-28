import { useEffect, useRef, useState } from "react";
import "./App.css";

import {
  addEntity,
  createCompanion,
  createEnemy,
  createPlayer,
  createResource,
  debugAddCompanionToParty,
  debugRefreshResources,
  debugRandomizeLocations,
  debugRemoveCompanionFromParty,
  debugResurrectEnemy,
  debugRestorePartyHealth,
  issueCompanionCommand,
  issueEntityCommand,
  startGameLoop,
  type Companion,
  type Enemy,
  type GameState,
  type Player,
  type ResourceEntity,
} from "./game";

const playerId = "test-player";
const companionIds = ["test-companion", "test-companion-2", "test-companion-3"];
const enemyId = "test-enemy";
const resourceId = "test-resource";
const cellSize = 36;
const gridColumns = 12;
const gridRows = 9;
const companionStartPositions = [
  { x: 2, y: 2 },
  { x: 2, y: 3 },
  { x: 2, y: 4 },
];

function createInitialState(): GameState {
  const player = createPlayer(playerId, { x: 8, y: 5 });
  const companion = createCompanion(
    companionIds[0],
    companionStartPositions[0],
    playerId,
  );
  const enemy = createEnemy(enemyId, { x: 10, y: 7 });
  const resource = createResource(resourceId, { x: 3, y: 7 });

  return addEntity(
    addEntity(addEntity(addEntity({ entities: {} }, player), companion), enemy),
    resource,
  );
}

function App() {
  const [gameState, setGameState] = useState<GameState>(createInitialState);
  const [isSimulationRunning, setIsSimulationRunning] = useState(false);
  const stopLoopRef = useRef<(() => void) | null>(null);

  const player = gameState.entities[playerId] as Player;
  const companions = companionIds
    .map((id) => gameState.entities[id] as Companion | undefined)
    .filter((companion): companion is Companion => Boolean(companion));
  const primaryCompanion = companions[0];
  const enemy = gameState.entities[enemyId] as Enemy;
  const resource = gameState.entities[resourceId] as ResourceEntity;

  useEffect(() => {
    return () => {
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

  function commandCompanionToFollow() {
    if (!primaryCompanion) {
      return;
    }

    setGameState((state) =>
      issueCompanionCommand(state, {
        type: "follow",
        companionId: primaryCompanion.id,
        targetId: playerId,
      }),
    );
  }

  function commandCompanionToIdle() {
    if (!primaryCompanion) {
      return;
    }

    setGameState((state) =>
      issueCompanionCommand(state, {
        type: "idle",
        companionId: primaryCompanion.id,
      }),
    );
  }

  function commandPartyToTargetEnemy() {
    setGameState((state) => {
      const playerAttackState = issueEntityCommand(state, {
        type: "attack",
        entityId: playerId,
        targetId: enemyId,
      });

      if (!primaryCompanion) {
        return playerAttackState;
      }

      return issueEntityCommand(
        playerAttackState,
        {
          type: "attack",
          entityId: primaryCompanion.id,
          targetId: enemyId,
        },
      );
    });
  }

  function commandCompanionToGatherResource() {
    if (!primaryCompanion) {
      return;
    }

    setGameState((state) =>
      issueCompanionCommand(state, {
        type: "gather",
        companionId: primaryCompanion.id,
        targetId: resourceId,
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
    setGameState((state) => debugResurrectEnemy(state, enemyId));
  }

  function refreshGatherPoints() {
    setGameState(debugRefreshResources);
  }

  function restorePartyHealth() {
    setGameState(debugRestorePartyHealth);
  }

  return (
    <main className="game-page">
      <section className="game-panel">
        <h1>Follow System Test</h1>

        <div className="test-area" aria-label="Follow system top-down test area">
          <div
            className="entity-marker player"
            style={{
              transform: `translate(${player.position.x * cellSize}px, ${
                player.position.y * cellSize
              }px)`,
            }}
            title="Player"
          >
            <span className="entity-label">Player HP {player.health}</span>
          </div>
          {companions.map((companion, index) => (
            <div
              key={companion.id}
              className="entity-marker companion"
              style={{
                transform: `translate(${companion.position.x * cellSize}px, ${
                  companion.position.y * cellSize
                }px)`,
              }}
              title="Companion"
            >
              <span className="entity-label">
                C{index + 1} HP {companion.health}
              </span>
            </div>
          ))}
          {enemy.state === "dead" ? (
            <div
              className="dead-label"
              style={{
                transform: `translate(${enemy.position.x * cellSize}px, ${
                  enemy.position.y * cellSize
                }px)`,
              }}
            >
              Dead
            </div>
          ) : (
            <div
              className="entity-marker enemy"
              onClick={commandPartyToTargetEnemy}
              style={{
                transform: `translate(${enemy.position.x * cellSize}px, ${
                  enemy.position.y * cellSize
                }px)`,
              }}
              title="Enemy"
            >
              <span className="entity-label">Enemy HP {enemy.health}</span>
            </div>
          )}
          {resource.isDepleted ? (
            <div
              className="depleted-label"
              style={{
                transform: `translate(${resource.position.x * cellSize}px, ${
                  resource.position.y * cellSize
                }px)`,
              }}
            >
              Depleted
            </div>
          ) : (
            <div
              className="entity-marker resource"
              style={{
                transform: `translate(${resource.position.x * cellSize}px, ${
                  resource.position.y * cellSize
                }px)`,
              }}
              title="Resource"
            >
              <span className="entity-label">
                Resource {resource.durability}
              </span>
            </div>
          )}
        </div>

        <div className="test-controls">
          <button onClick={toggleSimulationLoop}>
            {isSimulationRunning ? "Stop Simulation" : "Start Simulation"}
          </button>
          <button onClick={commandCompanionToFollow}>Follow</button>
          <button onClick={commandCompanionToIdle}>Idle</button>
          <button onClick={commandPartyToTargetEnemy}>Target Enemy</button>
          <button onClick={commandCompanionToGatherResource}>
            Gather Resource
          </button>
          <span>
            Player ({player.position.x}, {player.position.y}) | State{" "}
            {player.state} | HP {player.health} | Target{" "}
            {player.currentTargetId ?? "none"} |
            Party {companions.length + 1}/4 | Companion{" "}
            {primaryCompanion
              ? `(${primaryCompanion.position.x}, ${primaryCompanion.position.y}) | State ${primaryCompanion.state} | HP ${primaryCompanion.health} | Target ${primaryCompanion.currentTargetId ?? "none"}`
              : "not in party"}{" "}
            | Enemy ({enemy.position.x},{" "}
            {enemy.position.y}) | State {enemy.state} | HP {enemy.health} |
            Resource ({resource.position.x}, {resource.position.y}) | Durability{" "}
            {resource.durability} | Depleted {resource.isDepleted ? "yes" : "no"}
          </span>
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
          </div>
        </section>
      </section>
    </main>
  );
}

export default App;
