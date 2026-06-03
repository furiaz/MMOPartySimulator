import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GameState } from "./state";
import { createTestGameState } from "./testState";

const updateGameMock = vi.hoisted(() =>
  vi.fn((state: GameState, timing?: { deltaMs?: number; frameNumber?: number }) => ({
    ...state,
    simulationDeltaMs: timing?.deltaMs ?? state.simulationDeltaMs,
    simulationFrame: timing?.frameNumber ?? state.simulationFrame,
    simulationTick: timing?.frameNumber ?? state.simulationTick,
  })),
);
const recordUpdateDurationMock = vi.hoisted(() => vi.fn());

vi.mock("./updateGame", () => ({
  updateGame: updateGameMock,
}));

vi.mock("./performanceMetrics", () => ({
  recordUpdateDuration: recordUpdateDurationMock,
}));

import {
  MAX_SIMULATION_FPS,
  MIN_SIMULATION_FRAME_MS,
  startGameLoop,
} from "./gameLoop";
import type { GameStateUpdater } from "./gameLoop";
import { MAX_SIMULATION_DELTA_MS } from "./simulationTiming";

describe("startGameLoop", () => {
  let callbacks: FrameRequestCallback[];
  let nowMs: number;

  beforeEach(() => {
    callbacks = [];
    nowMs = 0;
    updateGameMock.mockClear();
    recordUpdateDurationMock.mockClear();
    vi.spyOn(Date, "now").mockImplementation(() => nowMs);
    vi.spyOn(performance, "now").mockReturnValue(0);
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn((callback: FrameRequestCallback) => {
        callbacks.push(callback);
        return callbacks.length;
      }),
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function runNextFrame(elapsedMs: number) {
    nowMs += elapsedMs;
    const callback = callbacks.shift();

    expect(callback).toBeDefined();
    callback?.(nowMs);
  }

  function createUpdatingState(): GameStateUpdater {
    let state = createTestGameState();

    return (update) => {
      state = update(state);
    };
  }

  it("caps 120Hz browser frames to 60 simulation updates per second", () => {
    startGameLoop(createUpdatingState());

    for (let frame = 0; frame < 120; frame += 1) {
      runNextFrame(1000 / 120);
    }

    expect(updateGameMock).toHaveBeenCalledTimes(MAX_SIMULATION_FPS);
  });

  it("clamps long-frame simulation deltas through the existing timing cap", () => {
    startGameLoop(createUpdatingState());

    runNextFrame(MIN_SIMULATION_FRAME_MS * 20);

    expect(updateGameMock).toHaveBeenCalledTimes(1);
    expect(updateGameMock.mock.calls[0]?.[1]?.deltaMs).toBe(
      MAX_SIMULATION_DELTA_MS,
    );
  });

  it("does not update after the loop is stopped", () => {
    const stop = startGameLoop(createUpdatingState());

    stop();
    runNextFrame(MIN_SIMULATION_FRAME_MS);

    expect(updateGameMock).not.toHaveBeenCalled();
  });
});
