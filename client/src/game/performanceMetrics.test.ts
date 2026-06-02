import { describe, expect, it } from "vitest";
import {
  consumeGamePerformanceMetrics,
  recordAttackSlotCheck,
  recordEnemyAiActive,
  recordEnemyAiDormant,
  recordEnemyRoamMove,
  recordEnemyRoamStart,
  recordMovementFailure,
  recordNavigationPathQuery,
  recordPathDistanceQuery,
  recordUpdateDuration,
} from "./performanceMetrics";

describe("performance metrics", () => {
  it("records and consumes counters without leaking between samples", () => {
    consumeGamePerformanceMetrics();

    recordAttackSlotCheck();
    recordNavigationPathQuery();
    recordNavigationPathQuery("combat");
    recordPathDistanceQuery();
    recordPathDistanceQuery();
    recordMovementFailure();
    recordEnemyAiActive();
    recordEnemyAiDormant();
    recordEnemyRoamStart();
    recordEnemyRoamMove();
    recordUpdateDuration(3.5);

    expect(consumeGamePerformanceMetrics()).toEqual({
      attackSlotChecks: 1,
      enemyAiActiveCount: 1,
      enemyAiDormantCount: 1,
      enemyRoamMoves: 1,
      enemyRoamStarts: 1,
      movementFailures: 1,
      navigationPathQueries: 2,
      navigationPathQueriesByBucket: {
        roam: 0,
        home: 0,
        gather: 0,
        combat: 1,
        follow: 0,
        poi: 0,
        other: 1,
      },
      pathDistanceQueries: 2,
      updateCount: 1,
      updateMsTotal: 3.5,
    });
    expect(consumeGamePerformanceMetrics()).toEqual({
      attackSlotChecks: 0,
      enemyAiActiveCount: 0,
      enemyAiDormantCount: 0,
      enemyRoamMoves: 0,
      enemyRoamStarts: 0,
      movementFailures: 0,
      navigationPathQueries: 0,
      navigationPathQueriesByBucket: {
        roam: 0,
        home: 0,
        gather: 0,
        combat: 0,
        follow: 0,
        poi: 0,
        other: 0,
      },
      pathDistanceQueries: 0,
      updateCount: 0,
      updateMsTotal: 0,
    });
  });
});
