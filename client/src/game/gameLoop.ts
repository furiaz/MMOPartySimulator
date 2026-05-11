import type { GameState } from "./state";
import { updateGame } from "./updateGame";
import { GAME_LOOP_TICK_MS } from "./simulationTiming";

export type GameStateUpdater = (update: (state: GameState) => GameState) => void;

export function startGameLoop(
  updateState: GameStateUpdater,
  tickMs = GAME_LOOP_TICK_MS,
): () => void {
  const intervalId = setInterval(() => {
    updateState(updateGame);
  }, tickMs);

  return () => clearInterval(intervalId);
}
