import { useState } from "react";
import "./App.css";

import {
  addEntity,
  createCompanion,
  createPlayer,
  updateFollowSystem,
  type Companion,
  type GameState,
  type Player,
} from "./game";

const playerId = "test-player";
const companionId = "test-companion";
const cellSize = 36;

function createInitialState(): GameState {
  const player = createPlayer(playerId, { x: 8, y: 5 });
  const companion = createCompanion(companionId, { x: 2, y: 2 }, playerId);

  return addEntity(addEntity({ entities: {} }, player), companion);
}

function App() {
  const [gameState, setGameState] = useState<GameState>(createInitialState);

  const player = gameState.entities[playerId] as Player;
  const companion = gameState.entities[companionId] as Companion;

  function stepFollowSystem() {
    setGameState((currentState) => updateFollowSystem(currentState));
  }

  return (
    <main className="game-page">
      <section className="game-panel">
        <h1>Follow System Test</h1>

        <div className="test-area" aria-label="Follow system top-down test area">
          <div
            className="entity player"
            style={{
              transform: `translate(${player.position.x * cellSize}px, ${
                player.position.y * cellSize
              }px)`,
            }}
            title="Player"
          />
          <div
            className="entity companion"
            style={{
              transform: `translate(${companion.position.x * cellSize}px, ${
                companion.position.y * cellSize
              }px)`,
            }}
            title="Companion"
          />
        </div>

        <div className="test-controls">
          <button onClick={stepFollowSystem}>Step Follow System</button>
          <span>
            Player ({player.position.x}, {player.position.y}) | Companion (
            {companion.position.x}, {companion.position.y})
          </span>
        </div>
      </section>
    </main>
  );
}

export default App;
