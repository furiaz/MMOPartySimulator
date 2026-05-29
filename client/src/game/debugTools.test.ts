import { describe, expect, it } from "vitest";

import { createCompanion, createEnemy } from "./entities";
import { createDebugMap } from "./debugMap";
import {
  debugAddTestCrowns,
  debugApplyCompanionInfiniteHealth,
  debugForceSuperiorEnemyInCurrentSubzone,
  debugLevelUpAllCompanions,
  debugToggleCompanionInfiniteHealth,
} from "./debugTools";
import { isSuperiorEnemy } from "./enemyVariants";
import { MAX_CHARACTER_LEVEL } from "./leveling";
import { startDebugTelemetryRecording } from "./debugTelemetry";
import { createTestGameState } from "./testState";
import { getCurrencyBalance } from "./wallet";

describe("debugForceSuperiorEnemyInCurrentSubzone", () => {
  it("turns the closest normal enemy in the leader subzone into a Superior enemy", () => {
    const leader = createCompanion(
      "companion-1",
      { x: 10, y: 10 },
      "companion-1",
    );
    const closestEnemy = createEnemy("enemy-close", { x: 12, y: 10 }, "passive", {
      enemyTypeId: "slime",
      subzoneId: "shore-fringe",
    });
    const fartherEnemy = createEnemy("enemy-far", { x: 30, y: 10 }, "passive", {
      enemyTypeId: "slime",
      subzoneId: "shore-fringe",
    });
    const otherSubzoneEnemy = createEnemy(
      "enemy-other-subzone",
      { x: 60, y: 10 },
      "passive",
      {
        enemyTypeId: "cave_bat",
        subzoneId: "mossy-glade",
      },
    );
    const state = startDebugTelemetryRecording(
      createTestGameState({
        currentMapId: "map-1",
        map: createDebugMap("map-1"),
        partyLeaderId: leader.id,
        entities: {
          [leader.id]: leader,
          [closestEnemy.id]: closestEnemy,
          [fartherEnemy.id]: fartherEnemy,
          [otherSubzoneEnemy.id]: otherSubzoneEnemy,
        },
      }),
    );

    const nextState = debugForceSuperiorEnemyInCurrentSubzone(state);
    const transformedEnemy = nextState.entities[closestEnemy.id];
    const untouchedEnemy = nextState.entities[fartherEnemy.id];
    const untouchedOtherSubzoneEnemy = nextState.entities[otherSubzoneEnemy.id];

    expect(transformedEnemy?.kind).toBe("enemy");
    expect(transformedEnemy?.kind === "enemy" && isSuperiorEnemy(transformedEnemy)).toBe(true);
    expect(transformedEnemy?.kind === "enemy" ? transformedEnemy.maxHealth : 0).toBe(20);
    expect(transformedEnemy?.kind === "enemy" ? transformedEnemy.health : 0).toBe(20);
    expect(untouchedEnemy?.kind === "enemy" && isSuperiorEnemy(untouchedEnemy)).toBe(false);
    expect(
      untouchedOtherSubzoneEnemy?.kind === "enemy" &&
        isSuperiorEnemy(untouchedOtherSubzoneEnemy),
    ).toBe(false);
    expect(nextState.debugTelemetry?.events.at(-1)).toMatchObject({
      type: "superior_enemy_spawned",
      entityId: closestEnemy.id,
      enemyVariant: "superior",
      reason: "debug_force",
    });
  });

  it("does not create a second Superior enemy in the leader subzone", () => {
    const leader = createCompanion(
      "companion-1",
      { x: 10, y: 10 },
      "companion-1",
    );
    const existingSuperior = createEnemy(
      "enemy-superior",
      { x: 12, y: 10 },
      "passive",
      {
        enemyTypeId: "slime",
        subzoneId: "shore-fringe",
        variant: "superior",
      },
    );
    const normalEnemy = createEnemy("enemy-normal", { x: 14, y: 10 }, "passive", {
      enemyTypeId: "slime",
      subzoneId: "shore-fringe",
    });
    const state = createTestGameState({
      currentMapId: "map-1",
      map: createDebugMap("map-1"),
      partyLeaderId: leader.id,
      entities: {
        [leader.id]: leader,
        [existingSuperior.id]: existingSuperior,
        [normalEnemy.id]: normalEnemy,
      },
    });

    const nextState = debugForceSuperiorEnemyInCurrentSubzone(state);

    expect(nextState.entities[normalEnemy.id]).toEqual(normalEnemy);
  });

  it("does nothing in the hub", () => {
    const leader = createCompanion(
      "companion-1",
      { x: 10, y: 10 },
      "companion-1",
    );
    const enemy = createEnemy("enemy-normal", { x: 12, y: 10 }, "passive", {
      enemyTypeId: "slime",
      subzoneId: "shore-fringe",
    });
    const state = createTestGameState({
      currentMapId: "hub",
      map: createDebugMap("hub"),
      partyLeaderId: leader.id,
      entities: {
        [leader.id]: leader,
        [enemy.id]: enemy,
      },
    });

    expect(debugForceSuperiorEnemyInCurrentSubzone(state)).toBe(state);
  });
});

describe("companion debug test tools", () => {
  it("levels up every eligible companion once", () => {
    const leader = createCompanion(
      "companion-1",
      { x: 10, y: 10 },
      "companion-1",
    );
    const maxLevelCompanion = {
      ...createCompanion("companion-2", { x: 11, y: 10 }, leader.id),
      characterLevel: MAX_CHARACTER_LEVEL,
      characterXp: 0,
    };
    const enemy = createEnemy("enemy", { x: 12, y: 10 });
    const state = createTestGameState({
      partyLeaderId: leader.id,
      entities: {
        [leader.id]: leader,
        [maxLevelCompanion.id]: maxLevelCompanion,
        [enemy.id]: enemy,
      },
    });

    const nextState = debugLevelUpAllCompanions(state);
    const leveledCompanion = nextState.entities[leader.id];
    const unchangedMaxLevelCompanion = nextState.entities[maxLevelCompanion.id];

    expect(leveledCompanion?.kind === "companion" && leveledCompanion.characterLevel).toBe(2);
    expect(
      unchangedMaxLevelCompanion?.kind === "companion" &&
        unchangedMaxLevelCompanion.characterLevel,
    ).toBe(MAX_CHARACTER_LEVEL);
    expect(nextState.entities[enemy.id]).toEqual(enemy);
  });

  it("toggles and applies companion infinite health", () => {
    const deadCompanion = {
      ...createCompanion("companion-1", { x: 10, y: 10 }, "companion-1"),
      state: "dead" as const,
      health: 0,
    };
    const state = createTestGameState({
      partyLeaderId: deadCompanion.id,
      entities: {
        [deadCompanion.id]: deadCompanion,
      },
    });

    const toggledState = debugToggleCompanionInfiniteHealth(state);
    const nextState = debugApplyCompanionInfiniteHealth(toggledState);
    const restoredCompanion = nextState.entities[deadCompanion.id];

    expect(toggledState.debugOptions?.companionInfiniteHealthEnabled).toBe(true);
    expect(restoredCompanion?.kind === "companion" && restoredCompanion.health).toBe(
      deadCompanion.maxHealth,
    );
    expect(restoredCompanion?.state).toBe("idle");
  });

  it("adds 100 Crowns through the debug wallet helper", () => {
    const state = createTestGameState();

    const nextState = debugAddTestCrowns(state);

    expect(getCurrencyBalance(nextState.wallet, "crowns")).toBe(100);
    expect(nextState.wallet.visibleUntil).toBeGreaterThan(Date.now() - 1);
  });
});
