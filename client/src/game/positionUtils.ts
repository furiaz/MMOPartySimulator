import type { Position } from "./types";

export function arePositionsEqual(a: Position, b: Position): boolean {
  return a.x === b.x && a.y === b.y;
}

export function getGridDistance(from: Position, to: Position): number {
  return Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y));
}

export function getManhattanDistance(from: Position, to: Position): number {
  return Math.abs(to.x - from.x) + Math.abs(to.y - from.y);
}

export function getEuclideanDistance(from: Position, to: Position): number {
  return Math.hypot(to.x - from.x, to.y - from.y);
}

export function getPositionKey(position: Position): string {
  return `${position.x},${position.y}`;
}
