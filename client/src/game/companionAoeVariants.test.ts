import { afterEach, describe, expect, it, vi } from "vitest";
import { createCompanion, createEnemy } from "./entities";
import { isPositionInsideAoe } from "./aoePatterns";
import { COMPANION_AOE_VARIANTS, getCompanionAoeVariant, resolveCompanionAoeArea } from "./companionAoeVariants";
import { getCompanionSkillBehavior, getSkillPreferenceControls, getSkillPreferences, normalizeCompanionSkillBehavior, updateCompanionSkillPreference } from "./skillBehavior";
import { getSkillTarget } from "./skillTargeting";
import { resolveSkillEffect } from "./skillEffectResolution";
import { updateCompanionAoeChannelSystem } from "./companionAoeChannelSystem";
import { cancelForcedMovement, startForcedMovement, updateForcedMovements } from "./forcedMovement";
import { clearMapTransitionRuntimeState } from "./mapRuntimeCleanup";
import { sanitizeGameStateForSave } from "./saveGame";
import { getSkillPreferenceOptionDetails } from "./skillPreferenceDetails";
import { getSkillRankMultiplier } from "./skillProgression";
import { SKILL_DEFINITIONS } from "./skills";
import { addEntity, type GameState } from "./state";
import { createTestGameState } from "./testState";
import type { Companion, Enemy, GameEntity, SkillId, SkillPreferenceValues } from "./types";

function companion(id = "caster"): Companion {
  return { ...createCompanion(id, { x: 10, y: 10 }, id, "fighter", 1, "aegis"), state: "attack", currentTargetId: "front", maxHealth: 1000, health: 1000 };
}
function enemy(id: string, x: number, y = 10): Enemy {
  return createEnemy(id, { x, y }, "aggressive", { maxHealth: 1000, defense: 0, magicDefense: 0, evasion: 0 });
}
function setup(...entities: GameEntity[]): GameState {
  return entities.reduce(addEntity, createTestGameState({ partyLeaderId: "caster", map: { columns: 40, rows: 40, walls: [], teleports: [], healingFountains: [], debugName: "variants", displayName: "Variants" } }));
}
function prefer(caster: Companion, skillId: SkillId, values: SkillPreferenceValues): Companion {
  return updateCompanionSkillPreference(setup(caster), caster.id, skillId, values).entities[caster.id] as Companion;
}
function cast(state: GameState, skillId: SkillId, targetId = "front", now = 1000) {
  const caster = state.entities.caster as Companion;
  const target = state.entities[targetId];
  return resolveSkillEffect(state, caster, { skill: SKILL_DEFINITIONS[skillId], target: target?.kind === "resource" || target?.kind === "npc" ? undefined : target, score: 1, selectionPriority: 0 }, now);
}
function statuses(state: GameState, type: string) {
  return Object.values(state.statusEffectsById ?? {}).filter(status => status.type === type);
}

afterEach(() => vi.restoreAllMocks());

describe("authored companion areas", () => {
  it.each([
    ["sweeping_strike", "semicircle", 2], ["maul_sweep", "semicircle", 2],
    ["shield_shockwave", "circle", 2], ["arrow_burst", "cone", 2],
    ["fire_burst", "circle", 4], ["circle_of_renewal", "circle", 2],
    ["dawn_step", "circle", 2], ["atonement_step", "circle", 2],
  ] as const)("validates %s choices and default", (skillId, defaultId, count) => {
    expect(COMPANION_AOE_VARIANTS[skillId]).toHaveLength(count);
    expect(getCompanionAoeVariant(skillId, "unsupported")?.id).toBe(defaultId);
  });

  it("keeps true radial boundaries and a rotated 180-degree front", () => {
    const caster = companion();
    const area = resolveCompanionAoeArea(caster, "sweeping_strike", "semicircle", { x: 10, y: 11 })!;
    expect(isPositionInsideAoe(area, { x: 10, y: 12 })).toBe(true);
    expect(isPositionInsideAoe(area, { x: 12, y: 10 })).toBe(true);
    expect(isPositionInsideAoe(area, { x: 10, y: 9 })).toBe(false);
    const circle = resolveCompanionAoeArea(caster, "sweeping_strike", "circle", caster.position)!;
    expect(isPositionInsideAoe(circle, { x: 11.5, y: 11.5 })).toBe(false);
  });

  it("uses a longer narrow Arrow line and a shorter wide cone", () => {
    const caster = companion();
    const line = resolveCompanionAoeArea(caster, "arrow_burst", "line", { x: 15, y: 10 })!;
    const cone = resolveCompanionAoeArea(caster, "arrow_burst", "cone", { x: 15, y: 10 })!;
    expect(isPositionInsideAoe(line, { x: 16, y: 10 })).toBe(true);
    expect(isPositionInsideAoe(line, { x: 16.01, y: 10 })).toBe(false);
    expect(isPositionInsideAoe(line, { x: 12, y: 11 })).toBe(false);
    expect(isPositionInsideAoe(cone, { x: 12, y: 11 })).toBe(true);
    expect(isPositionInsideAoe(cone, { x: 13.4, y: 10 })).toBe(true);
    expect(isPositionInsideAoe(cone, { x: 13.41, y: 10 })).toBe(false);
  });

  it("centers FireBurst strips, keeps square gaps and locks transforms", () => {
    const caster = companion();
    const target = { x: 12, y: 10 };
    const line = resolveCompanionAoeArea(caster, "fire_burst", "line", target)!;
    expect(isPositionInsideAoe(line, { x: 7.5, y: 10 })).toBe(true);
    expect(isPositionInsideAoe(line, { x: 16.5, y: 10 })).toBe(true);
    expect(isPositionInsideAoe(line, { x: 16.51, y: 10 })).toBe(false);
    for (const id of ["cross", "x"] as const) {
      const area = resolveCompanionAoeArea(caster, "fire_burst", id, target)!;
      expect(area.primitives).toHaveLength(13);
      expect(isPositionInsideAoe(area, target)).toBe(true);
    }
    const cross = resolveCompanionAoeArea(caster, "fire_burst", "cross", target)!;
    expect(isPositionInsideAoe(cross, { x: 13.5, y: 11.5 })).toBe(false);
    target.x = 30;
    caster.position.y = 30;
    expect(line.castTransform.origin).toEqual({ x: 12, y: 10 });
  });

  it("makes Renewal exactly 70% area and 130% healing", () => {
    expect(getCompanionAoeVariant("circle_of_renewal", "concentrated")).toMatchObject({ pattern: { type: "circle", radius: 5 * Math.sqrt(0.7) }, powerMultiplier: 1.3 });
    expect(getCompanionAoeVariant("sweeping_strike", "circle")?.powerMultiplier).toBe(0.7);
    expect(getCompanionAoeVariant("maul_sweep", "circle")?.powerMultiplier).toBe(0.7);
  });

  it("keeps Rune Step fixed and mobility areas at their supplied origin", () => {
    expect(getSkillPreferenceControls("rune_step").map(control => control.key)).not.toContain("variant");
    expect(getSkillPreferenceControls("rune_step").map(control => control.key)).not.toContain("targetMode");
    for (const id of ["rune_step", "dawn_step", "atonement_step"] as const) {
      const area = resolveCompanionAoeArea(companion(), id, "circle", { x: 13, y: 10 }, { x: 11, y: 10 })!;
      expect(area.castTransform.origin).toEqual({ x: 11, y: 10 });
      expect(isPositionInsideAoe(area, { x: 13, y: 10 })).toBe(true);
      expect(isPositionInsideAoe(area, { x: 13.01, y: 10 })).toBe(false);
    }
  });
});

describe("independent skill preferences", () => {
  it("migrates legacy shared settings once without coupling future edits", () => {
    let caster = companion();
    caster.skillBehavior = { ...caster.skillBehavior, mobilitySkillUseMode: "defensive", supportFocus: "defender", selfSacrificeSafetyFloorPercent: 40, fireBurstTargetMode: "low_health" };
    caster.skillBehavior = normalizeCompanionSkillBehavior(caster);
    caster = prefer(caster, "dawn_step", { mobilityMode: "offensive" });
    caster = prefer(caster, "light_mend", { supportFocus: "leader" });
    caster = prefer(caster, "atonement_step", { safetyFloorPercent: 10 });
    expect(getCompanionSkillBehavior(caster, "rune_step").mobilitySkillUseMode).toBe("defensive");
    expect(getCompanionSkillBehavior(caster, "dawn_step").mobilitySkillUseMode).toBe("offensive");
    expect(getCompanionSkillBehavior(caster, "frost_armor").supportFocus).toBe("defender");
    expect(getCompanionSkillBehavior(caster, "light_mend").supportFocus).toBe("leader");
    expect(getCompanionSkillBehavior(caster, "flagellant_lash").selfSacrificeSafetyFloorPercent).toBe(40);
    expect(getSkillPreferences(caster, "fire_burst").targetMode).toBe("low_health");
  });

  it("sanitizes malformed options and preserves valid per-skill values", () => {
    const caster = prefer(companion(), "circle_of_renewal", { variant: "concentrated", targetMode: "highest_health", mainTargetHpThresholdPercent: 1000 });
    expect(getSkillPreferences(caster, "circle_of_renewal")).toMatchObject({ variant: "concentrated", targetMode: "highest_health", mainTargetHpThresholdPercent: 90 });
    const invalid = prefer(caster, "circle_of_renewal", { variant: "x", mainTargetHpThresholdPercent: NaN });
    expect(getSkillPreferences(invalid, "circle_of_renewal")).toMatchObject({ variant: "circle", mainTargetHpThresholdPercent: 70 });
  });

  it("normalizes active and stored roster saves idempotently", () => {
    const caster = prefer(companion(), "fire_burst", { variant: "x", targetMode: "highest_health" });
    const resting = { ...caster, id: "resting" };
    const state = { ...setup(caster), restingCompanionsById: { resting } };
    const restored = sanitizeGameStateForSave(state, 1000);
    for (const member of [restored.entities.caster as Companion, restored.restingCompanionsById!.resting]) {
      expect(getSkillPreferences(member, "fire_burst")).toMatchObject({ variant: "x", targetMode: "highest_health" });
      expect(normalizeCompanionSkillBehavior(member)).toEqual(member.skillBehavior);
    }
  });

  it("exposes only applicable target controls with detailed rank-aware descriptions", () => {
    for (const id of ["sweeping_strike", "maul_sweep", "shield_shockwave", "shield_challenge", "threatening_roar"] as const)
      expect(getSkillPreferenceControls(id).map(control => control.key)).not.toContain("targetMode");
    expect(getSkillPreferenceControls("circle_of_renewal").find(control => control.key === "targetMode")?.choices).toHaveLength(4);
    expect(getSkillPreferenceOptionDetails(companion(), "arrow_burst", "variant", "cone")).toContain("90°");
    expect(getSkillPreferenceOptionDetails(companion(), "maul_sweep", "variant", "circle")).toContain("80.5%");
    expect(getSkillPreferenceOptionDetails(companion(), "shield_shockwave", "variant", "cone")).toContain("after the push ends");
  });
});

describe("area targeting and resolution", () => {
  it.each(["sweeping_strike", "maul_sweep", "shield_shockwave"] as const)("faces the explicit manual target for %s instead of a stale combat target", skillId => {
    const caster = prefer(companion(), skillId, { variant: skillId === "shield_shockwave" ? "cone" : "semicircle" });
    const target = enemy("manual", 9);
    const state = setup(caster, enemy("front", 11), target);
    const selected = getSkillTarget(state, caster, SKILL_DEFINITIONS[skillId], { forcedEnemyTargetId: "manual" });
    expect(selected?.id).toBe("manual");
    const result = cast(state, skillId, selected!.id);
    const area = result.state.companionAoeChannelsByCasterId?.caster.area ?? result.state.skillVisualEvents?.find(event => event.area)?.area;
    expect(area?.castTransform.direction).toEqual({ x: -1, y: 0 });
    expect(isPositionInsideAoe(area!, target.position)).toBe(true);
    expect(isPositionInsideAoe(area!, state.entities.front.position)).toBe(false);
  });
  it.each(["circle", "cross", "x", "line"] as const)("resolves FireBurst %s damage and Burn once using its displayed area", variant => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const caster = prefer(companion(), "fire_burst", { variant });
    const target = enemy("front", 13);
    const state = cast(setup(caster, target), "fire_burst").state;
    expect((state.entities.front as Enemy).health).toBeLessThan(1000);
    expect(statuses(state, "burning")).toHaveLength(1);
    const area = state.skillVisualEvents?.find(event => event.area)?.area;
    expect(area).toBeDefined();
    expect(isPositionInsideAoe(area!, target.position)).toBe(true);
    expect(state.combatFeedbackEvents.filter(event => event.targetEntityId === "front" && event.type === "damage")).toHaveLength(1);
  });

  it.each(["dawn_step", "atonement_step"] as const)("uses each selected %s shape at a valid offensive landing", skillId => {
    for (const variant of ["circle", "cross"] as const) {
      const caster = prefer(companion(), skillId, { variant });
      const target = enemy("front", 13);
      const state = setup(caster, target);
      expect(getSkillTarget(state, caster, SKILL_DEFINITIONS[skillId])?.id).toBe(target.id);
      const result = cast(state, skillId);
      expect(result.shouldConsumeCooldown).toBe(true);
      expect(result.state.entities.caster.position).not.toEqual(caster.position);
      const area = result.state.skillVisualEvents?.find(event => event.area)?.area;
      expect(area?.castTransform.origin).toEqual(result.state.entities.caster.position);
      expect(statuses(result.state, "disarmed")).toHaveLength(1);
    }
  });

  it("keeps defensive Atonement healing at departure and excludes the caster", () => {
    const caster = prefer({ ...companion(), health: 250 }, "atonement_step", { variant: "cross", mobilityMode: "defensive" });
    const threat = { ...enemy("front", 11), state: "attack" as const, currentTargetId: "caster" };
    const ally = { ...companion("ally"), position: { x: 10, y: 11.5 }, health: 1 };
    const state = setup(caster, threat, ally);
    expect(getSkillTarget(state, caster, SKILL_DEFINITIONS.atonement_step)?.id).toBe("front");
    const result = cast(state, "atonement_step");
    expect(result.shouldConsumeCooldown).toBe(true);
    expect((result.state.entities.ally as Companion).health).toBeGreaterThan(1);
    expect((result.state.entities.caster as Companion).health).toBeLessThan(250);
    expect(result.state.skillVisualEvents?.find(event => event.area)?.area?.castTransform.origin).toEqual(caster.position);
    expect(statuses(result.state, "disarmed")).toHaveLength(0);
  });

  it("rejects mobility with no recipient before consuming cooldowns", () => {
    const caster = prefer(companion(), "atonement_step", { mobilityMode: "defensive" });
    const threat = { ...enemy("front", 11), state: "attack" as const, currentTargetId: "caster" };
    expect(getSkillTarget(setup(caster, threat), caster, SKILL_DEFINITIONS.atonement_step)).toBeUndefined();
    expect(cast(setup(caster, threat), "atonement_step").shouldConsumeCooldown).toBe(false);
  });
  it.each(["sweeping_strike", "maul_sweep", "shield_shockwave"] as const)("requires attack context and recipients for %s", id => {
    const caster = companion();
    expect(getSkillTarget(setup(caster), caster, SKILL_DEFINITIONS[id])).toBeUndefined();
    const front = enemy("front", 11);
    expect(getSkillTarget(setup(caster, front), caster, SKILL_DEFINITIONS[id])?.id).toBe(caster.id);
    const idle = { ...caster, state: "idle" as const };
    expect(getSkillTarget(setup(idle, front), idle, SKILL_DEFINITIONS[id])).toBeUndefined();
  });

  it("uses uniform Sweeping Strike damage and the full-circle tradeoff", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const caster = companion();
    const front = enemy("front", 11);
    const flank = enemy("flank", 11, 11);
    const behind = enemy("behind", 9);
    const forward = cast(setup(caster, front, flank, behind), "sweeping_strike", "caster");
    expect((forward.state.entities.front as Enemy).health).toBe((forward.state.entities.flank as Enemy).health);
    expect((forward.state.entities.behind as Enemy).health).toBe(1000);
    const circle = prefer(caster, "sweeping_strike", { variant: "circle" });
    const full = cast(setup(circle, front, flank, behind), "sweeping_strike", "caster");
    expect((full.state.entities.behind as Enemy).health).toBeLessThan(1000);
    // Combat rounds final damage; the variant coefficient itself stays unrounded.
    expect(Math.abs((1000 - (full.state.entities.front as Enemy).health) - (1000 - (forward.state.entities.front as Enemy).health) * 0.7)).toBeLessThanOrEqual(1);
    expect(full.state.skillVisualEvents?.at(-1)?.area?.primitives[0].type).toBe("circle");
  });

  it("locks Maul's direction, origin and variant across its 200ms channel", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const caster = companion();
    let state = cast(setup(caster, enemy("front", 11), enemy("behind", 9)), "maul_sweep", "caster").state;
    const area = state.companionAoeChannelsByCasterId!.caster.area;
    state = updateCompanionSkillPreference(state, "caster", "maul_sweep", { variant: "circle" });
    state = { ...state, entities: { ...state.entities, caster: { ...state.entities.caster, position: { x: 30, y: 30 } } } };
    expect(updateCompanionAoeChannelSystem(state, 1199).companionAoeChannelsByCasterId!.caster.area).toBe(area);
    state = updateCompanionAoeChannelSystem(state, 1200);
    expect((state.entities.front as Enemy).health).toBeLessThan(1000);
    expect((state.entities.behind as Enemy).health).toBe(1000);
    expect(statuses(state, "disarmed")).toHaveLength(1);
    expect(updateCompanionAoeChannelSystem(state, 1300)).toBe(state);
  });
  it("applies rank scaling once before the unrounded variant multiplier", () => {
    const base = companion();
    const caster = prefer({ ...base, classId: "beast", skillProgression: { ...base.skillProgression, ranksBySkillId: { maul_sweep: 3 }, legacyEnabledSkillIds: [] } }, "maul_sweep", { variant: "circle" });
    const state = cast(setup(caster, enemy("front", 11)), "maul_sweep", "caster").state;
    expect(state.companionAoeChannelsByCasterId?.caster.powerMultiplier).toBeCloseTo(1.15 * getSkillRankMultiplier(3) * 0.7, 12);
  });

  it("allows Arrow line reach and respects explicit target constraints", () => {
    const caster = companion();
    const far = enemy("front", 16);
    expect(getSkillTarget(setup(caster, far), caster, SKILL_DEFINITIONS.arrow_burst)).toBeUndefined();
    const line = prefer(caster, "arrow_burst", { variant: "line" });
    expect(getSkillTarget(setup(line, far), line, SKILL_DEFINITIONS.arrow_burst)?.id).toBe("front");
    const near = enemy("near", 12);
    const constrained = setup(caster, far, near);
    expect(getSkillTarget(constrained, caster, SKILL_DEFINITIONS.arrow_burst, { forcedEnemyTargetId: "front" })).toBeUndefined();
  });

  it("scores the chosen Arrow shape, absolute high HP and proportional low HP", () => {
    let caster = prefer(companion(), "arrow_burst", { variant: "line" });
    const a = { ...enemy("front", 13), health: 300, maxHealth: 1000 };
    const b = { ...enemy("north", 10, 13), health: 250, maxHealth: 2000 };
    const c = enemy("cluster", 10, 15);
    expect(getSkillTarget(setup(caster, a, b, c), caster, SKILL_DEFINITIONS.arrow_burst)?.id).toBe("north");
    caster = prefer(caster, "arrow_burst", { targetMode: "highest_health" });
    expect(getSkillTarget(setup(caster, a, b), caster, SKILL_DEFINITIONS.arrow_burst)?.id).toBe("front");
    caster = prefer(caster, "arrow_burst", { targetMode: "low_health" });
    expect(getSkillTarget(setup(caster, a, b), caster, SKILL_DEFINITIONS.arrow_burst)?.id).toBe("north");
  });

  it("concentrates Renewal healing without healing square-corner outsiders", () => {
    const base = companion();
    const caster = { ...base, health: 1000, naturalStats: { ...base.naturalStats, wisdom: 100 } };
    const ally = { ...companion("ally"), position: { x: 12, y: 10 }, health: 1 };
    const edge = { ...companion("edge"), position: { x: 16.5, y: 10 }, health: 1 };
    const normal = cast(setup(caster, ally, edge), "circle_of_renewal", "ally");
    const focused = cast(setup(prefer(caster, "circle_of_renewal", { variant: "concentrated" }), ally, edge), "circle_of_renewal", "ally");
    expect((normal.state.entities.edge as Companion).health).toBeGreaterThan(1);
    expect((focused.state.entities.edge as Companion).health).toBe(1);
    expect((focused.state.entities.ally as Companion).health).toBeGreaterThan((normal.state.entities.ally as Companion).health);
    const high = prefer(caster, "circle_of_renewal", { targetMode: "highest_health" });
    expect(getSkillTarget(setup(high, ally, { ...edge, position: { x: 13, y: 10 }, health: 200 }), high, SKILL_DEFINITIONS.circle_of_renewal)?.id).toBe("edge");
  });
});

describe("Shockwave completion sequencing", () => {
  function impact() {
    const caster = prefer(companion(), "shield_shockwave", { variant: "cone" });
    const state = cast(setup(caster, enemy("front", 11)), "shield_shockwave", "caster").state;
    return updateCompanionAoeChannelSystem(state, 1200);
  }
  it("stuns at impact, then taunts for three seconds at actual landing", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    let state = impact();
    expect(statuses(state, "incapacitated")[0]).toMatchObject({ expiresAt: 2200 });
    expect(statuses(state, "taunted")).toHaveLength(0);
    expect(state.forcedMovementsByEntityId!.front.endsAt).toBe(1325);
    state = updateForcedMovements(state, new Set(), 1325);
    expect(state.entities.front.position.x).toBeCloseTo(13);
    expect(statuses(state, "taunted")[0]).toMatchObject({ expiresAt: 4325 });
    expect(updateForcedMovements(state, new Set(), 1400)).toBe(state);
  });
  it("evasion avoids cone damage, stun and push", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const caster = prefer(companion(), "shield_shockwave", { variant: "cone" });
    const target = { ...enemy("front", 11), evasion: 100 };
    const state = updateCompanionAoeChannelSystem(cast(setup(caster, target), "shield_shockwave", "caster").state, 1200);
    expect((state.entities.front as Enemy).health).toBe(1000);
    expect(statuses(state, "incapacitated")).toHaveLength(0);
    expect(state.forcedMovementsByEntityId?.front).toBeUndefined();
  });
  it("starts completion immediately if terrain completely blocks displacement", () => {
    let state = setup(companion(), enemy("front", 11));
    state = { ...state, map: { ...state.map!, walls: [{ x: 12, y: 10 }] } };
    state = startForcedMovement(state, "front", "caster", { x: 1, y: 0 }, 2, 125, 1000, { type: "taunted", durationMs: 3000, sourceKey: "shield_shockwave" });
    expect(state.forcedMovementsByEntityId?.front).toBeUndefined();
    expect(statuses(state, "taunted")[0]?.expiresAt).toBe(4000);
  });
  it("taunts at an earlier dynamic stop, not the original scheduled endpoint", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    let state = impact();
    state = { ...state, map: { ...state.map!, walls: [{ x: 12, y: 10 }] } };
    state = updateForcedMovements(state, new Set(), 1250);
    expect(state.forcedMovementsByEntityId?.front).toBeUndefined();
    expect(statuses(state, "taunted")[0]?.expiresAt).toBe(4250);
  });
  it("reserves separate landings for simultaneous forced movements", () => {
    let state = setup(companion(), enemy("front", 11), enemy("other", 11, 11));
    state = startForcedMovement(state, "front", "caster", { x: 1, y: 0.25 }, 2, 125, 1000);
    state = startForcedMovement(state, "other", "caster", { x: 1, y: -0.25 }, 2, 125, 1000);
    state = updateForcedMovements(state, new Set(), 1200);
    const a = state.entities.front.position;
    const b = state.entities.other.position;
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(0.7);
  });
  it("cancels deferred taunt on source death, cleanup or explicit movement cancellation", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const initial = impact();
    const state = { ...initial, entities: { ...initial.entities, caster: { ...initial.entities.caster as Companion, health: 0, state: "dead" as const } } };
    const finished = updateForcedMovements(state, new Set(), 1325);
    expect(finished.entities.front.position.x).toBeCloseTo(13);
    expect(statuses(finished, "taunted")).toHaveLength(0);
    expect(statuses(updateForcedMovements(cancelForcedMovement(initial, "front"), new Set(), 1400), "taunted")).toHaveLength(0);
    expect(clearMapTransitionRuntimeState(initial).forcedMovementsByEntityId).toEqual({});
  });
});
