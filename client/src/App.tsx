import { useEffect, useRef, useState } from "react";
import "./App.css";

import {
  addEntity,
  createCompanion,
  createEnemy,
  createPlayer,
  createResource,
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
const companionId = "test-companion";
const enemyId = "test-enemy";
const resourceId = "test-resource";
const cellSize = 36;

function createInitialState(): GameState {
  const player = createPlayer(playerId, { x: 8, y: 5 });
  const companion = createCompanion(companionId, { x: 2, y: 2 }, playerId);
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
  const companion = gameState.entities[companionId] as Companion;
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
    setGameState((state) =>
      issueCompanionCommand(state, {
        type: "follow",
        companionId,
        targetId: playerId,
      }),
    );
  }

  function commandCompanionToIdle() {
    setGameState((state) =>
      issueCompanionCommand(state, {
        type: "idle",
        companionId,
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

      return issueEntityCommand(playerAttackState, {
        type: "attack",
        entityId: companionId,
        targetId: enemyId,
      });
    });
  }

  function commandCompanionToGatherResource() {
    setGameState((state) =>
      issueCompanionCommand(state, {
        type: "gather",
        companionId,
        targetId: resourceId,
      }),
    );
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
          <div
            className="entity-marker companion"
            style={{
              transform: `translate(${companion.position.x * cellSize}px, ${
                companion.position.y * cellSize
              }px)`,
            }}
            title="Companion"
          >
            <span className="entity-label">Companion HP {companion.health}</span>
          </div>
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
            Companion ({companion.position.x}, {companion.position.y}) | State{" "}
            {companion.state} | HP {companion.health} | Target{" "}
            {companion.currentTargetId ?? "none"} | Enemy ({enemy.position.x},{" "}
            {enemy.position.y}) | State {enemy.state} | HP {enemy.health} |
            Resource ({resource.position.x}, {resource.position.y}) | Durability{" "}
            {resource.durability} | Depleted {resource.isDepleted ? "yes" : "no"}
          </span>
        </div>
      </section>
    </main>
  );
}

export default App;
