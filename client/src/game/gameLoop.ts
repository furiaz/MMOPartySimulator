import type { GameState } from "./state";
import { updateGame } from "./updateGame";

export type GameStateUpdater = (update: (state: GameState) => GameState) => void;

export function startGameLoop(
  updateState: GameStateUpdater,
  tickMs = 500,
): () => void {
  const intervalId = setInterval(() => {
    updateState(updateGame);
  }, tickMs);

  return () => clearInterval(intervalId);
}
