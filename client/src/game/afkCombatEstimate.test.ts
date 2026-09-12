import { describe, expect, it } from "vitest";
import { estimateAfkCombatForParty, estimateCurrentPartyAfkCombat } from "./afkCombatEstimate";
import {
  MAP_ONE_ID,
  createDebugMap,
} from "./debugMap";
import { createCompanion, createEnemy } from "./entities";
import { createTestGameState } from "./testState";
import type { GameState } from "./state";
import type { Companion, EnemyTypeId, GameEntity } from "./types";

describe("afk combat estimate", () => {
  it("estimates nonzero combat gains for a matched party in a wild subzone", () => {
    const state = createWildState([
      createCompanionAtLevel("leader", "defender", 1),
      createCompanionAtLevel("fighter", "fighter", 1),
    ]);

    const estimate = estimateCurrentPartyAfkCombat(state);

    expect(estimate.available).toBe(true);
    if (!estimate.available) {
      return;
    }

    expect(estimate.partyDamagePerMinute).toBeGreaterThan(0);
    expect(estimate.killsPerHour).toBeGreaterThan(0);
    expect(estimate.experiencePerMinute).toBeGreaterThan(0);
    expect(estimate.accessEfficiencyPercent).toBeGreaterThan(0);
    expect(estimate.downtimeSecondsPerKill).toBeGreaterThan(0);
    expect(estimate.enemies.map((enemy) => enemy.enemyTypeId)).toContain("green_slime");
  });

  it("uses the live two-second global cooldown for basic attacks", () => {
    const state = createWildState([
      withoutSkills(createCompanionAtLevel("leader", "defender", 1)),
      withoutSkills(createCompanionAtLevel("fighter", "fighter", 1)),
    ]);

    const estimate = estimateCurrentPartyAfkCombat(state);

    expect(estimate.available).toBe(true);
    if (!estimate.available) {
      return;
    }

    expect(estimate.partyDamagePerMinute).toBe(195);
  });

  it("caps an overpowered party at the subzone spawn rate", () => {
    const state = createWildState([
      createCompanionAtLevel("leader", "fighter", 60, 250),
      createCompanionAtLevel("fighter", "fighter", 60, 250),
    ]);

    const estimate = estimateCurrentPartyAfkCombat(state);

    expect(estimate.available).toBe(true);
    if (!estimate.available) {
      return;
    }

    expect(estimate.partyKillPotentialPerMinute).toBeGreaterThan(
      estimate.subzoneSpawnCapPerMinute,
    );
    expect(estimate.killsPerHour).toBeLessThanOrEqual(
      Math.floor(estimate.subzoneSpawnCapPerMinute * 60),
    );
  });

  it("applies movement and retarget downtime before final kills", () => {
    const state = createWildState([
      createCompanionAtLevel("leader", "defender", 1),
      createCompanionAtLevel("fighter", "fighter", 1),
    ]);

    const estimate = estimateCurrentPartyAfkCombat(state);

    expect(estimate.available).toBe(true);
    if (!estimate.available) {
      return;
    }

    expect(estimate.accessEfficiencyPercent).toBeLessThan(100);
    expect(estimate.killsPerHour).toBeLessThan(
      Math.floor(estimate.partyKillPotentialPerMinute * 60),
    );
  });

  it("warns and grants no gains when a party is far too weak to survive", () => {
    const map = createDebugMap(MAP_ONE_ID);
    const subzone = map.subzones?.find((candidate) => candidate.id === "shore-fringe");
    if (!subzone) {
      throw new Error("Expected shore-fringe subzone.");
    }
    const weakCompanion = {
      ...createCompanionAtLevel("leader", "none", 1),
      naturalStats: {
        strength: 0,
        dexterity: 0,
        constitution: 0,
        intelligence: 0,
        wisdom: 0,
      },
    };
    const state = createWildState([weakCompanion], [
      createEnemy("enemy-1", { x: 14, y: 20 }, "aggressive", {
        enemyTypeId: "green_slime",
        subzoneId: subzone.id,
        maxHealth: 500,
        attack: 200,
        defense: 80,
      }),
    ]);

    const estimate = estimateCurrentPartyAfkCombat(state);

    expect(estimate.available).toBe(true);
    if (!estimate.available) {
      return;
    }

    expect(estimate.rating).toBe("Overmatched");
    expect(estimate.killsPerHour).toBe(0);
    expect(estimate.experiencePerMinute).toBe(0);
    expect(estimate.warnings).toContain("low_damage");
    expect(estimate.warnings).toContain("low_survivability");
  });

  it("counts defensive and support tools toward survivability", () => {
    const fighterOnlyState = createWildState([
      createCompanionAtLevel("leader", "fighter", 3, 8, "blade"),
    ]);
    const supportedState = createWildState([
      createCompanionAtLevel("leader", "defender", 3, 8, "aegis"),
      createCompanionAtLevel("support", "support", 3, 8, "lightbearer"),
    ]);

    const fighterOnly = estimateCurrentPartyAfkCombat(fighterOnlyState);
    const supported = estimateCurrentPartyAfkCombat(supportedState);

    expect(fighterOnly.available).toBe(true);
    expect(supported.available).toBe(true);
    if (!fighterOnly.available || !supported.available) {
      return;
    }

    expect(supported.survivabilityPercent).toBeGreaterThan(
      fighterOnly.survivabilityPercent,
    );
  });

  it("lets Gatherer-role companions improve natural resource estimates without improving combat damage", () => {
    const fighterState = createWildState([
      createCompanionAtLevel("leader", "fighter", 3),
    ]);
    const gathererState = createWildState([
      createCompanionAtLevel("leader", "gatherer", 3),
    ]);

    const fighter = estimateCurrentPartyAfkCombat(fighterState);
    const gatherer = estimateCurrentPartyAfkCombat(gathererState);

    expect(fighter.available).toBe(true);
    expect(gatherer.available).toBe(true);
    if (!fighter.available || !gatherer.available) {
      return;
    }

    expect(gatherer.resourceEstimatePerMinute).toBeGreaterThan(
      fighter.resourceEstimatePerMinute,
    );
    expect(gatherer.partyDamagePerMinute).toBeLessThan(fighter.partyDamagePerMinute);
  });

  it("falls back safely when enemy details are incomplete", () => {
    const map = createDebugMap(MAP_ONE_ID);
    const subzone = map.subzones?.find((candidate) => candidate.id === "shore-fringe");
    if (!subzone) {
      throw new Error("Expected shore-fringe subzone.");
    }
    const state = createWildState([
      createCompanionAtLevel("leader", "fighter", 1),
    ], []);

    const estimate = estimateAfkCombatForParty({
      state,
      map,
      subzone: {
        ...subzone,
        enemyTypeIds: ["missing_enemy" as EnemyTypeId],
      },
      companions: [state.entities.leader as Companion],
    });

    expect(estimate.available).toBe(true);
    if (!estimate.available) {
      return;
    }

    expect(estimate.enemies[0].maxHealth).toBeGreaterThan(0);
    expect(estimate.warnings).toContain("enemy_data_incomplete");
  });

  it("uses auto attacks and skill damage in damage per minute", () => {
    const beginnerState = createWildState([
      createCompanionAtLevel("leader", "fighter", 3, 10, "beginner"),
    ]);
    const bladeState = createWildState([
      createCompanionAtLevel("leader", "fighter", 3, 10, "blade"),
    ]);

    const beginner = estimateCurrentPartyAfkCombat(beginnerState);
    const blade = estimateCurrentPartyAfkCombat(bladeState);

    expect(beginner.available).toBe(true);
    expect(blade.available).toBe(true);
    if (!beginner.available || !blade.available) {
      return;
    }

    expect(beginner.partyDamagePerMinute).toBeGreaterThan(0);
    expect(blade.partyDamagePerMinute).toBeGreaterThan(
      beginner.partyDamagePerMinute,
    );
  });

  it("shows estimated drops per hour for Atlas display", () => {
    const state = createWildState([
      createCompanionAtLevel("leader", "fighter", 3),
    ]);

    const estimate = estimateCurrentPartyAfkCombat(state);

    expect(estimate.available).toBe(true);
    if (!estimate.available) {
      return;
    }

    expect(estimate.estimatedDropsPerHour.length).toBeGreaterThan(0);
    expect(
      estimate.estimatedDropsPerHour.some((drop) => drop.itemId === "slime_gel_t1"),
    ).toBe(true);
  });

  it("exposes reward multiplier sources for Atlas tooltips", () => {
    const state = createWildState([
      createCompanionAtLevel("leader", "fighter", 3),
    ]);

    const estimate = estimateCurrentPartyAfkCombat(state);

    expect(estimate.available).toBe(true);
    if (!estimate.available) {
      return;
    }

    expect(estimate.combatExperienceMultiplierSources.map((source) => source.label))
      .toEqual(["Survivability", "Level gap"]);
    expect(estimate.combatDropMultiplierSources.map((source) => source.label))
      .toEqual(["Survivability"]);
  });
});

function createWildState(
  companions: Companion[],
  enemies: GameEntity[] = [
    createEnemy("enemy-1", { x: 14, y: 20 }, "aggressive", {
      enemyTypeId: "green_slime",
      subzoneId: "shore-fringe",
    }),
    createEnemy("enemy-2", { x: 20, y: 26 }, "aggressive", {
      enemyTypeId: "green_slime",
      subzoneId: "shore-fringe",
    }),
    createEnemy("enemy-3", { x: 24, y: 34 }, "aggressive", {
      enemyTypeId: "green_slime",
      subzoneId: "shore-fringe",
    }),
  ],
): GameState {
  const map = createDebugMap(MAP_ONE_ID);
  const entities = Object.fromEntries(
    [...companions, ...enemies].map((entity) => [entity.id, entity]),
  );

  return createTestGameState({
    currentMapId: MAP_ONE_ID,
    map,
    entities,
    partyLeaderId: companions[0]?.id ?? "",
  });
}

function withoutSkills(companion: Companion): Companion {
  return {
    ...companion,
    classId: "test_no_skills" as Companion["classId"],
    skillProgression: {
      ranksBySkillId: {},
      legacyEnabledSkillIds: [],
    },
  };
}

function createCompanionAtLevel(
  id: string,
  role: Companion["role"],
  level: number,
  statValue = level,
  classId: Companion["classId"] = "beginner",
): Companion {
  return {
    ...createCompanion(id, { x: 14, y: 29 }, id, role, 0, classId),
    characterLevel: level,
    naturalStats: {
      strength: statValue,
      dexterity: statValue,
      constitution: statValue,
      intelligence: statValue,
      wisdom: statValue,
    },
    state: "idle",
    currentTargetId: null,
  };
}
