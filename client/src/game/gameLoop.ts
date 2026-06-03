import type { GameState } from "./state";
import { updateGame } from "./updateGame";
import { clampSimulationDelta } from "./simulationTiming";
import { recordUpdateDuration } from "./performanceMetrics";

export type GameStateUpdater = (update: (state: GameState) => GameState) => void;
export const MAX_SIMULATION_FPS = 60;
export const MIN_SIMULATION_FRAME_MS = 1000 / MAX_SIMULATION_FPS;

export function startGameLoop(
  updateState: GameStateUpdater,
): () => void {
  let animationFrameId = 0;
  let accumulatedElapsedMs = 0;
  let previousTimeMs = Date.now();
  let isRunning = true;

  function step() {
    if (!isRunning) {
      return;
    }

    const nowMs = Date.now();
    const elapsedMs = nowMs - previousTimeMs;
    previousTimeMs = nowMs;

    if (Number.isFinite(elapsedMs) && elapsedMs > 0) {
      accumulatedElapsedMs += elapsedMs;
    }

    if (accumulatedElapsedMs >= MIN_SIMULATION_FRAME_MS) {
      const deltaMs = clampSimulationDelta(accumulatedElapsedMs);
      accumulatedElapsedMs %= MIN_SIMULATION_FRAME_MS;

      updateState((state) => {
        const updateStartedAt = performance.now();
        const nextState = updateGame(state, {
          nowMs,
          deltaMs,
          frameNumber: (state.simulationFrame ?? state.simulationTick ?? 0) + 1,
        });

        recordUpdateDuration(performance.now() - updateStartedAt);

        return nextState;
      });
    }

    animationFrameId = requestAnimationFrame(step);
  }

  animationFrameId = requestAnimationFrame(step);

  return () => {
    isRunning = false;
    cancelAnimationFrame(animationFrameId);
  };
}
