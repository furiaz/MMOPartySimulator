import { getScaledEnemyStats } from "./enemyScaling";
import type { AoeBounds, CombatStructure, DebugMapId, EnemyTypeId, Position } from "./types";

export const BARRACK_PREPARATION_MS = 9_000;
export const BARRACK_RESPAWN_MS = 120_000;
export const BARRACK_ACTIVATION_RADIUS = 10;
export const BARRACK_REINFORCEMENT_CAP = 5;

export type BarrackDefinition = {
  subzoneId: string;
  id: string;
  mapId: DebugMapId;
  position: Position;
  footprint: AoeBounds;
  attackBounds: AoeBounds;
  spawnCandidates: Position[];
  tutorial?: boolean;
};

export const BARRACK_DEFINITIONS: readonly BarrackDefinition[] = [
  { id: "map-7-route-barrack", mapId: "map-7", subzoneId: "orc-warcamp", position: { x: 75, y: 26 },
    footprint: { minX: 72.5, maxX: 77.5, minY: 24.5, maxY: 26.5 },
    attackBounds: { minX: 73, maxX: 78, minY: 22, maxY: 27 },
    spawnCandidates: [{ x: 74, y: 23 }, { x: 77, y: 23 }, { x: 74, y: 29 }, { x: 77, y: 29 }], tutorial: true },
  { id: "map-7-arena-barrack-west", mapId: "map-7", subzoneId: "orc-warcamp", position: { x: 88, y: 12 },
    footprint: { minX: 86.5, maxX: 89.5, minY: 11.5, maxY: 12.5 },
    attackBounds: { minX: 87, maxX: 90, minY: 10, maxY: 13 },
    spawnCandidates: [{ x: 88, y: 15 }, { x: 85, y: 15 }, { x: 92, y: 15 }] },
  { id: "map-7-arena-barrack-east", mapId: "map-7", subzoneId: "orc-warcamp", position: { x: 102, y: 12 },
    footprint: { minX: 100.5, maxX: 103.5, minY: 11.5, maxY: 12.5 },
    attackBounds: { minX: 101, maxX: 104, minY: 10, maxY: 13 },
    spawnCandidates: [{ x: 102, y: 15 }, { x: 98, y: 15 }, { x: 106, y: 15 }] },
];

export function getBarrackMaxHealth(): number {
  return getScaledEnemyStats(18, "orc").maxHealth * 3;
}

export function rollBarrackEnemy(random: () => number): EnemyTypeId {
  const roll = random();
  return roll < 0.8 ? "orc" : roll < 0.9 ? "orc_raider" : "orc_shieldbearer";
}

export function getBarrackCollisionCells(definition: BarrackDefinition): Position[] {
  const cells: Position[] = [];
  for (let y = Math.ceil(definition.footprint.minY); y < definition.footprint.maxY; y++) {
    for (let x = Math.ceil(definition.footprint.minX); x < definition.footprint.maxX; x++) cells.push({ x, y });
  }
  return cells;
}

export function createBarrackEntity(definition: BarrackDefinition, health = getBarrackMaxHealth()): CombatStructure {
  return { id: definition.id, kind: "structure", structureType: "orc_barracks", displayName: "Orc Barrack",
    position: { ...definition.position }, footprint: { ...definition.footprint }, attackBounds: { ...definition.attackBounds }, health, maxHealth: getBarrackMaxHealth(),
    state: health > 0 ? "idle" : "dead", lastAttackAt: 0, currentTargetId: null,
    attack: 0, defense: 0, magicDefense: 0, evasion: 0 };
}
