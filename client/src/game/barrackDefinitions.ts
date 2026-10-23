import { getScaledEnemyStats } from "./enemyScaling";
import type { AoeBounds, CombatStructure, DebugMapId, EnemyTypeId, Position } from "./types";
import { ORC_WARCAMP_ARENA, ORC_WARCAMP_ARENA_BARRACKS, ORC_WARCAMP_ENCOUNTER_ID, ORC_WARCAMP_ROUTE_BARRACK_POSITION } from "./orcWarcampLayout";

export const BARRACK_PREPARATION_MS = 12_000;
export const BARRACK_RESPAWN_MS = 120_000;
export const BARRACK_REBUILD_SPEECH = { text: "Work Work", leadMs: 10_000, durationMs: 5_000 } as const;
export const BARRACK_CLEARANCE_RETRY_MS = 250;
export const BARRACK_ACTIVATION_RADIUS = 10;

export type BarrackDefinition = {
  subzoneId: string;
  id: string;
  mapId: DebugMapId;
  position: Position;
  footprint: AoeBounds;
  attackBounds: AoeBounds;
  spawnCandidates: Position[];
  reinforcementCap: number;
  tutorial?: boolean;
  activation?: { encounterId: string; bounds: AoeBounds };
};

export const BARRACK_DEFINITIONS: readonly BarrackDefinition[] = [
  { id: "map-7-route-barrack", mapId: "map-7", subzoneId: "orc-warcamp", position: ORC_WARCAMP_ROUTE_BARRACK_POSITION,
    footprint: { minX: 72.5, maxX: 77.5, minY: 24.5, maxY: 26.5 },
    attackBounds: { minX: 73, maxX: 78, minY: 22, maxY: 27 },
    spawnCandidates: [{ x: 74, y: 23 }, { x: 77, y: 23 }, { x: 74, y: 29 }, { x: 77, y: 29 }], reinforcementCap: 5, tutorial: true },
  ...ORC_WARCAMP_ARENA_BARRACKS.map(({ id, position, spawnCandidates }): BarrackDefinition => ({
    id, position, spawnCandidates, reinforcementCap: 2, mapId: "map-7", subzoneId: "orc-warcamp",
    footprint: { minX: position.x - 1.5, maxX: position.x + 1.5, minY: position.y - 0.5, maxY: position.y + 0.5 },
    attackBounds: { minX: position.x - 1, maxX: position.x + 2, minY: position.y - 2, maxY: position.y + 1 },
    activation: { encounterId: ORC_WARCAMP_ENCOUNTER_ID, bounds: ORC_WARCAMP_ARENA },
  })),
];

export function getBarrackMaxHealth(): number {
  return getScaledEnemyStats(18, "orc").maxHealth * 6;
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
