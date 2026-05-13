import { describe, expect, it } from "vitest";
import { startDebugTelemetryRecording } from "./debugTelemetry";
import { createCompanion } from "./entities";
import { moveEntityTowardPositionIfUnoccupied } from "./state";
import { createTestGameState } from "./testState";
import { updateGame } from "./updateGame";

describe("real-time simulation timing", () => {
  it("moves the same distance over equivalent elapsed time", () => {
    const oneStepLeader = createCompanion("leader", { x: 0, y: 0 }, "leader");
    const twoStepLeader = createCompanion("leader", { x: 0, y: 0 }, "leader");
    const target = { x: 10, y: 0 };

    const oneStepState = moveEntityTowardPositionIfUnoccupied(
      createTestGameState({
        entities: { [oneStepLeader.id]: oneStepLeader },
        simulationDeltaMs: 100,
      }),
      oneStepLeader,
      target,
    );

    const firstHalfState = moveEntityTowardPositionIfUnoccupied(
      createTestGameState({
        entities: { [twoStepLeader.id]: twoStepLeader },
        simulationDeltaMs: 50,
      }),
      twoStepLeader,
      target,
    );
    const halfwayLeader = firstHalfState.entities[twoStepLeader.id];
    const secondHalfState =
      halfwayLeader?.kind === "companion"
        ? moveEntityTowardPositionIfUnoccupied(
            {
              ...firstHalfState,
              simulationDeltaMs: 50,
            },
            halfwayLeader,
            target,
          )
        : firstHalfState;

    expect(oneStepState.entities[oneStepLeader.id].position.x).toBeCloseTo(
      secondHalfState.entities[twoStepLeader.id].position.x,
    );
  });

  it("advances simulation time and preserves cooldown timing", () => {
    const leader = {
      ...createCompanion("leader", { x: 0, y: 0 }, "leader"),
      state: "idle" as const,
      currentTargetId: null,
    };
    const state = createTestGameState({
      entities: { [leader.id]: leader },
      partyLeaderId: leader.id,
    });

    const nextState = updateGame(state, {
      nowMs: 1000,
      deltaMs: 50,
    });

    expect(nextState.simulationFrame).toBe(1);
    expect(nextState.simulationTimeMs).toBe(50);
    expect(nextState.simulationDeltaMs).toBe(50);
  });

  it("records real-time telemetry fields while keeping tick as a compatibility alias", () => {
    const leader = createCompanion("leader", { x: 0, y: 0 }, "leader");
    const state = startDebugTelemetryRecording(
      createTestGameState({
        entities: { [leader.id]: leader },
        partyLeaderId: leader.id,
      }),
    );

    const nextState = updateGame(state, {
      nowMs: 1000,
      deltaMs: 50,
      frameNumber: 12,
    });
    const telemetrySamples = nextState.debugTelemetry?.ticks ?? [];
    const telemetrySample = telemetrySamples[telemetrySamples.length - 1];

    expect(telemetrySample?.frame).toBe(12);
    expect(telemetrySample?.sample).toBe(12);
    expect(telemetrySample?.simulationTimeMs).toBe(50);
    expect(telemetrySample?.deltaMs).toBe(50);
    expect(telemetrySample?.tick).toBe(telemetrySample?.frame);
  });

  it("keeps debug telemetry sampling from recording every render frame", () => {
    const leader = createCompanion("leader", { x: 0, y: 0 }, "leader");
    const state = startDebugTelemetryRecording(
      createTestGameState({
        entities: { [leader.id]: leader },
        partyLeaderId: leader.id,
      }),
    );

    const firstFrame = updateGame(state, {
      nowMs: 1000,
      deltaMs: 16,
      frameNumber: 1,
    });
    const skippedFrame = updateGame(firstFrame, {
      nowMs: 1016,
      deltaMs: 16,
      frameNumber: 2,
    });
    const sampledFrame = updateGame(skippedFrame, {
      nowMs: 1100,
      deltaMs: 84,
      frameNumber: 7,
    });

    expect(firstFrame.debugTelemetry?.ticks).toHaveLength(1);
    expect(skippedFrame.debugTelemetry?.ticks).toHaveLength(1);
    expect(skippedFrame.debugTelemetry?.frameNumber).toBe(2);
    expect(sampledFrame.debugTelemetry?.ticks).toHaveLength(2);
    expect(sampledFrame.debugTelemetry?.ticks.at(-1)?.frame).toBe(7);
  });
});
