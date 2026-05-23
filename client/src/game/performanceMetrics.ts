export type NavigationPathMetricBucket =
  | "roam"
  | "home"
  | "gather"
  | "combat"
  | "follow"
  | "poi"
  | "other";

export type GamePerformanceMetrics = {
  attackSlotChecks: number;
  movementFailures: number;
  navigationPathQueries: number;
  navigationPathQueriesByBucket: Record<NavigationPathMetricBucket, number>;
  pathDistanceQueries: number;
  updateCount: number;
  updateMsTotal: number;
};

function createEmptyNavigationPathBuckets(): Record<NavigationPathMetricBucket, number> {
  return {
    roam: 0,
    home: 0,
    gather: 0,
    combat: 0,
    follow: 0,
    poi: 0,
    other: 0,
  };
}

const emptyMetrics: GamePerformanceMetrics = {
  attackSlotChecks: 0,
  movementFailures: 0,
  navigationPathQueries: 0,
  navigationPathQueriesByBucket: createEmptyNavigationPathBuckets(),
  pathDistanceQueries: 0,
  updateCount: 0,
  updateMsTotal: 0,
};

let metrics: GamePerformanceMetrics = {
  ...emptyMetrics,
  navigationPathQueriesByBucket: createEmptyNavigationPathBuckets(),
};

export function recordAttackSlotCheck(): void {
  metrics.attackSlotChecks += 1;
}

export function recordMovementFailure(): void {
  metrics.movementFailures += 1;
}

export function recordNavigationPathQuery(
  bucket: NavigationPathMetricBucket = "other",
): void {
  metrics.navigationPathQueries += 1;
  metrics.navigationPathQueriesByBucket[bucket] += 1;
}

export function recordPathDistanceQuery(): void {
  metrics.pathDistanceQueries += 1;
}

export function recordUpdateDuration(updateMs: number): void {
  metrics.updateCount += 1;
  metrics.updateMsTotal += updateMs;
}

export function consumeGamePerformanceMetrics(): GamePerformanceMetrics {
  const consumedMetrics = metrics;
  metrics = {
    ...emptyMetrics,
    navigationPathQueriesByBucket: createEmptyNavigationPathBuckets(),
  };

  return consumedMetrics;
}
