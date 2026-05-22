export type GamePerformanceMetrics = {
  attackSlotChecks: number;
  movementFailures: number;
  navigationPathQueries: number;
  pathDistanceQueries: number;
  updateCount: number;
  updateMsTotal: number;
};

const emptyMetrics: GamePerformanceMetrics = {
  attackSlotChecks: 0,
  movementFailures: 0,
  navigationPathQueries: 0,
  pathDistanceQueries: 0,
  updateCount: 0,
  updateMsTotal: 0,
};

let metrics: GamePerformanceMetrics = { ...emptyMetrics };

export function recordAttackSlotCheck(): void {
  metrics.attackSlotChecks += 1;
}

export function recordMovementFailure(): void {
  metrics.movementFailures += 1;
}

export function recordNavigationPathQuery(): void {
  metrics.navigationPathQueries += 1;
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
  metrics = { ...emptyMetrics };

  return consumedMetrics;
}
