import { createAoeCastTransform, doesAoeIntersectFootprint, isPositionInsideAoe, resolveAoePattern } from "./aoePatterns";
import type { AoePattern, Companion, CompanionAoeVariantId, GameEntity, Position, ResolvedAoeArea, SkillId } from "./types";

export type CompanionAoeVariant = {
  id: CompanionAoeVariantId;
  displayName: string;
  pattern: AoePattern;
  origin: "caster" | "target" | "mobility";
  powerMultiplier: number;
  description: string;
};

const circle = (radius: number): AoePattern => ({ type: "circle", radius });
const semicircle = (range: number): AoePattern => ({ type: "cone", range, angleRadians: Math.PI });
const smallCross: AoePattern = { type: "cross", armLength: 1 };
const variant = (
  id: CompanionAoeVariantId, displayName: string, pattern: AoePattern,
  origin: CompanionAoeVariant["origin"], description: string, powerMultiplier = 1,
): CompanionAoeVariant => ({ id, displayName, pattern, origin, description, powerMultiplier });
const sweepVariants = [
  variant("semicircle", "Forward Semicircle", semicircle(2), "caster", "180° forward area; radius 2 (diameter 4). Normal skill damage."),
  variant("circle", "Full Circle", circle(2), "caster", "360° around the caster; radius 2 (diameter 4). Deals 70% of normal skill damage.", 0.7),
];
const mobilityVariants = [
  variant("circle", "Circle", circle(2), "mobility", "Radius 2 (diameter 4). Offensive: landing position. Defensive: departure position."),
  variant("cross", "Cross", smallCross, "mobility", "Five touching 1.5×1.5 squares; span 4.5. Offensive: landing position. Defensive: departure position."),
];

/** Authored companion choices; no UI, sprite dimensions or faction rules. */
export const COMPANION_AOE_VARIANTS: Partial<Record<SkillId, readonly CompanionAoeVariant[]>> = {
  sweeping_strike: sweepVariants,
  maul_sweep: sweepVariants,
  shield_shockwave: [
    variant("circle", "Circle", circle(2), "caster", "Radius 2 (diameter 4). Binds for 1 second and taunts for 5 seconds."),
    variant("cone", "Knockback Cone", semicircle(2), "caster", "180° forward cone; reach 2. Stuns for 1 second at impact, pushes up to 2 units, then taunts for 3 seconds after the push ends. Walls shorten the push."),
  ],
  arrow_burst: [
    variant("cone", "Forward Cone", { type: "cone", range: 3.4, angleRadians: Math.PI / 2 }, "caster", "90° cone from the caster, reaching 3.4. Normal skill damage."),
    variant("line", "Line", { type: "line", squareCount: 4 }, "caster", "Forward strip 6 long × 1.5 wide. Normal skill damage."),
  ],
  fire_burst: [
    variant("circle", "Circle", circle(3), "target", "Centered on the selected enemy; radius 3 (diameter 6), area 28.27. Normal damage and Burn."),
    variant("cross", "Cross", { type: "cross", armLength: 3 }, "target", "Centered on the selected enemy; 13 touching 1.5×1.5 squares, span 10.5, area 29.25. Normal damage and Burn."),
    variant("x", "X", { type: "x", armLength: 3 }, "target", "Centered on the selected enemy; 13 diagonal 1.5×1.5 squares, area 29.25. Gaps are safe. Normal damage and Burn."),
    variant("line", "Line", { type: "rectangle", rows: 6, columns: 2, offset: { x: -4.5, y: 0 } }, "target", "A 9×3 strip centered on the selected enemy, area 27; aligned caster-to-target. Normal damage and Burn."),
  ],
  circle_of_renewal: [
    variant("circle", "Normal Circle", circle(5), "target", "Centered on the selected ally; radius 5 (diameter 10). Normal healing."),
    variant("concentrated", "Concentrated Circle", circle(5 * Math.sqrt(0.7)), "target", "Centered on the selected ally; radius 4.18 (diameter 8.37). 70% of the normal circle's area; 130% healing.", 1.3),
  ],
  dawn_step: mobilityVariants,
  atonement_step: mobilityVariants,
};

export function getCompanionAoeVariant(skillId: SkillId, selected?: unknown): CompanionAoeVariant | undefined {
  const variants = COMPANION_AOE_VARIANTS[skillId];
  return variants?.find(option => option.id === selected) ?? variants?.[0];
}

export function resolveCompanionAoeArea(
  caster: Companion, skillId: SkillId, selected: unknown, target: Position,
  mobilityOrigin?: Position,
): ResolvedAoeArea | undefined {
  const definition = getCompanionAoeVariant(skillId, selected);
  const pattern = definition?.pattern ?? (skillId === "rune_step" ? circle(2) : undefined);
  if (!pattern) return undefined;
  const origin = definition?.origin === "target" ? target : mobilityOrigin ?? caster.position;
  // Direction is always the snapped caster-to-target vector, even for target-centered areas.
  const transform = createAoeCastTransform(caster.position, target);
  return resolveAoePattern(pattern, { ...transform, origin: { ...origin } });
}

export function isEntityInsideCompanionAoe(area: ResolvedAoeArea, entity: GameEntity): boolean {
  return entity.kind === "structure"
    ? doesAoeIntersectFootprint(area, entity.attackBounds)
    : isPositionInsideAoe(area, entity.position);
}
