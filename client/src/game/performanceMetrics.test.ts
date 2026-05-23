import { describe, expect, it } from "vitest";
import {
  consumeGamePerformanceMetrics,
  recordAttackSlotCheck,
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
    recordUpdateDuration(3.5);

    expect(consumeGamePerformanceMetrics()).toEqual({
      attackSlotChecks: 1,
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
