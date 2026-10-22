import type { GameState } from "./state";
import type { AoeBounds, Enemy, GameEntity, Position } from "./types";
import { ORC_WARCAMP_ARENA } from "./orcWarcampLayout";
export const WARMASTER_ARENA: AoeBounds = ORC_WARCAMP_ARENA;
export const WARMASTER_MAX_POWER = 10;
export const WARMASTER_TRANSFER_MS = 1000;
export const WARMASTER_RETREAT_MS = 3000;
export const WARMASTER_ABILITY_IDS = ["orc_warmaster_patron_burst", "orc_warmaster_patron_cleave", "orc_warmaster_kick", "orc_warmaster_rending_dash"];
export type PatronEnergyTransfer = {
  id: string;
  bossId: string;
  attemptId: string;
  origin: Position;
  startedAt: number;
  arrivesAt: number;
};
export type WarmasterAttempt = {
  id: string;
  bossId: string;
  power: number;
  emptySince?: number;
  transfers: PatronEnergyTransfer[];
  transferSequence: number;
  speechShown?: true;
  speechStartedAt?: number;
};
export function isInsideWarmasterArena(position: Position): boolean {
  return position.x >= WARMASTER_ARENA.minX && position.x <= WARMASTER_ARENA.maxX && position.y >= WARMASTER_ARENA.minY && position.y <= WARMASTER_ARENA.maxY;
}
export function isWarmaster(entity: GameEntity | undefined): entity is Enemy {
  return entity?.kind === "enemy" && entity.enemyTypeId === "orc_warmaster";
}
export function getWarmasterPower(state: GameState, enemyId: string): number {
  return state.warmasterAttempt?.bossId === enemyId ? state.warmasterAttempt.power : 0;
}
/** Called at the alive-to-dead mutation boundary, before rewards or removal. */
export function recordPatronDeath(state: GameState, previous: GameEntity | undefined, entity: GameEntity, now: number): GameState {
  const attempt = state.warmasterAttempt;
  if (!attempt || state.currentMapId !== "map-7" || previous?.kind !== "enemy" || previous.health <= 0 || previous.state === "dead" || entity.kind !== "enemy" || (entity.health > 0 && entity.state !== "dead") || !["orc", "orc_raider", "orc_shieldbearer"].includes(entity.enemyTypeId ?? "") || !isInsideWarmasterArena(entity.position))
    return state;
  const boss = state.entities[attempt.bossId];
  if (!isWarmaster(boss) || boss.health <= 0 || boss.state === "dead")
    return state;
  const sequence = attempt.transferSequence + 1;
  return {
    ...state, warmasterAttempt: {
      ...attempt,
      transferSequence: sequence,
      transfers: [...attempt.transfers, {
        id: `${attempt.id}:${sequence}`,
        bossId: boss.id,
        attemptId: attempt.id,
        origin: { ...entity.position },
        startedAt: now,
        arrivesAt: now + WARMASTER_TRANSFER_MS
      }]

    }
  };
}
