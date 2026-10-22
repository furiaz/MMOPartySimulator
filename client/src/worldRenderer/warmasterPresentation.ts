import type { PatronEnergyTransfer } from "../game/warmasterState";
import type { AoeBounds, Position } from "../game/types";
export function getPatronTransferPosition(transfer: PatronEnergyTransfer, bossPosition: Position, now: number): Position {
  const progress = Math.max(0, Math.min(1, (now - transfer.startedAt) / Math.max(1, transfer.arrivesAt - transfer.startedAt)));
  return { x: transfer.origin.x + (bossPosition.x - transfer.origin.x) * progress, y: transfer.origin.y + (bossPosition.y - transfer.origin.y) * progress };
}
export function isAuraVisible(position: Position, radius: number, bounds: AoeBounds): boolean {
  return position.x + radius >= bounds.minX && position.x - radius <= bounds.maxX && position.y + radius >= bounds.minY && position.y - radius <= bounds.maxY;
}
