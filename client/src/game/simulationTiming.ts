export const GAME_LOOP_TICK_MS = 100;
export const MAX_SIMULATION_DELTA_MS = 100;

export type SimulationTiming = {
  nowMs: number;
  deltaMs: number;
  deltaSeconds: number;
  frameNumber: number;
};

export function createSimulationTiming(
  nowMs: number,
  deltaMs = GAME_LOOP_TICK_MS,
  frameNumber = 0,
): SimulationTiming {
  const clampedDeltaMs = clampSimulationDelta(deltaMs);

  return {
    nowMs,
    deltaMs: clampedDeltaMs,
    deltaSeconds: clampedDeltaMs / 1000,
    frameNumber,
  };
}

export function clampSimulationDelta(deltaMs: number): number {
  if (!Number.isFinite(deltaMs) || deltaMs <= 0) {
    return GAME_LOOP_TICK_MS;
  }

  return Math.min(deltaMs, MAX_SIMULATION_DELTA_MS);
}
