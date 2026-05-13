import type { GameState } from "./state";
import { updateGame } from "./updateGame";
import { clampSimulationDelta } from "./simulationTiming";

export type GameStateUpdater = (update: (state: GameState) => GameState) => void;

export function startGameLoop(
  updateState: GameStateUpdater,
): () => void {
  let animationFrameId = 0;
  let previousTimeMs: number | null = null;
  let isRunning = true;

  function step() {
    if (!isRunning) {
      return;
    }

    const nowMs = Date.now();
    const deltaMs =
      previousTimeMs === null
        ? 0
        : clampSimulationDelta(nowMs - previousTimeMs);
    previousTimeMs = nowMs;

    updateState((state) =>
      updateGame(state, {
        nowMs,
        deltaMs,
        frameNumber: (state.simulationFrame ?? state.simulationTick ?? 0) + 1,
      }),
    );

    animationFrameId = requestAnimationFrame(step);
  }

  animationFrameId = requestAnimationFrame(step);

  return () => {
    isRunning = false;
    cancelAnimationFrame(animationFrameId);
  };
}
