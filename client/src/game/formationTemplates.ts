import type {
  Companion,
  FormationAssignments,
  FormationDepth,
  FormationPresetId,
  FormationTemplate,
  Position,
} from "./types";

export const DEFAULT_FORMATION_SPACING = 2.5;

const TEMPLATE_ROWS: Record<FormationPresetId, number[][]> = {
  arrow: [[1], [1, 1], [1, 2], [1, 2, 1], [1, 2, 2]],
  balanced: [[1], [2], [2, 1], [2, 2], [2, 1, 2]],
  "side-by-side": [[1], [2], [3], [4], [5]],
};

export function getFormationTemplate(
  preset: FormationPresetId,
  memberCount: number,
  spacing = DEFAULT_FORMATION_SPACING,
): FormationTemplate | undefined {
  const rows = TEMPLATE_ROWS[preset]?.[memberCount - 1];
  if (!rows || !Number.isFinite(spacing) || spacing <= 0) return undefined;

  return {
    preset,
    spacing,
    slots: rows.flatMap((columns, row) => {
      const depth: FormationDepth = rows.length === 1 ? "neutral"
        : row === 0 ? "front" : row === rows.length - 1 ? "rear" : "middle";
      return Array.from({ length: columns }, (_, column) => {
        const side = column - (columns - 1) / 2;
        return {
          // Keep semantic ownership where that slot survives a roster change.
          id: `${preset}:${depth}:${side}`,
          side: side * spacing,
          forward: row === 0 ? 0 : -row * spacing,
          lane: side < 0 ? "left" : side > 0 ? "right" : "center",
          depth,
        };
      });
    }),
  };
}

/** Ideal geometry only: callers must validate standing/movement before using it. */
export function transformFormationSlots(
  assignments: FormationAssignments,
  leader: Pick<Companion, "id" | "position" | "health" | "state"> | undefined,
  facing: Position,
  origin = leader?.position,
  lateralScale = 1,
  rowScale = 1,
): Record<string, Position> {
  if (!leader || leader.id !== assignments.leaderId || leader.state === "dead" ||
    leader.health <= 0 || !origin || !Number.isFinite(origin.x) || !Number.isFinite(origin.y)) return {};
  const template = getFormationTemplate(assignments.preset, assignments.members.length, assignments.spacing);
  const leaderSlot = template?.slots.find(slot => slot.id === assignments.slotsByEntityId[leader.id]);
  if (!template || !leaderSlot) return {};

  const length = Math.hypot(facing.x, facing.y);
  const forward = Number.isFinite(length) && length > 0
    ? { x: facing.x / length, y: facing.y / length } : { x: 0, y: -1 };
  const right = { x: -forward.y, y: forward.x };
  const positions: Record<string, Position> = {};
  for (const member of assignments.members) {
    const slot = template.slots.find(candidate => candidate.id === assignments.slotsByEntityId[member.id]);
    if (!slot) continue;
    const side = (slot.side - leaderSlot.side) * lateralScale;
    const ahead = (slot.forward - leaderSlot.forward) * rowScale;
    positions[member.id] = {
      x: origin.x + forward.x * ahead + right.x * side,
      y: origin.y + forward.y * ahead + right.y * side,
    };
  }
  return positions;
}

export function rotateFormationFacing(previous: Position, desired: Position, deltaSeconds: number): Position {
  if (Math.hypot(desired.x, desired.y) < 0.001) return previous;
  const start = Math.atan2(previous.y, previous.x), end = Math.atan2(desired.y, desired.x);
  let turn = ((end - start) % (2 * Math.PI) + 3 * Math.PI) % (2 * Math.PI) - Math.PI;
  if (Math.abs(turn + Math.PI) < 1e-9) turn = Math.PI;
  const cap = Math.max(0, deltaSeconds) * 2 * Math.PI;
  const angle = start + Math.max(-cap, Math.min(cap, turn));
  return { x: Math.cos(angle), y: Math.sin(angle) };
}
