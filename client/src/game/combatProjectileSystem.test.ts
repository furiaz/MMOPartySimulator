import { afterEach, describe, expect, it, vi } from "vitest";
import { createCompanion, createEnemy } from "./entities";
import { addEntity, updateEntity } from "./state";
import { createTestGameState } from "./testState";
import {
  launchBasicCombatProjectile,
  updateCombatProjectileSystem,
  type CombatProjectileLaunchProfile,
} from "./combatProjectileSystem";
import type { Companion, CompanionPrimaryStats, Enemy, GameEntity } from "./types";

const testProfile: CombatProjectileLaunchProfile = {
  damageType: "physical",
  powerMultiplier: 1,
  visualProfileId: "hunter_arrow",
  speed: 12,
  impactRadius: 0.3,
};

const magicProfile: CombatProjectileLaunchProfile = {
  damageType: "magic",
  powerMultiplier: 1,
  visualProfileId: "elementalist_arcane_bolt",
  speed: 12,
  impactRadius: 0.3,
};

describe("combat projectile system", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("follows the live target position while traveling", () => {
    const attacker = createAttackingCompanion("attacker", { x: 0, y: 0 });
    const target = createEnemy("target", { x: 4, y: 0 }, undefined, {
      defense: 0,
      evasion: 0,
      maxHealth: 20,
    });
    const launchedState = launchBasicCombatProjectile(
      createState([attacker, target]),
      attacker,
      target,
      testProfile,
      1000,
    );
    const movedTarget = {
      ...target,
      position: { x: 0, y: 4 },
    };

    const nextState = updateCombatProjectileSystem(
      updateEntity(launchedState, movedTarget),
      1100,
      100,
    );
    const projectile = nextState.combatProjectiles?.[0];

    expect(projectile?.position.x).toBeCloseTo(0);
    expect(projectile?.position.y).toBeCloseTo(1.2);
    expect(projectile?.targetFallbackPosition).toEqual(movedTarget.position);
    expect((nextState.entities[target.id] as Enemy).health).toBe(target.health);
  });

  it("applies damage only when the projectile reaches its stored target", () => {
    const attacker = createAttackingCompanion("attacker", { x: 0, y: 0 });
    const target = createEnemy("target", { x: 1, y: 0 }, undefined, {
      defense: 0,
      evasion: 0,
      maxHealth: 20,
    });
    const launchedState = launchBasicCombatProjectile(
      createState([attacker, target]),
      attacker,
      target,
      testProfile,
      1000,
    );

    vi.spyOn(Math, "random").mockReturnValue(0.99);

    const nextState = updateCombatProjectileSystem(launchedState, 1100, 100);
    const nextTarget = nextState.entities[target.id] as Enemy;

    expect(nextState.combatProjectiles).toEqual([]);
    expect(nextTarget.health).toBeLessThan(target.health);
  });

  it("applies magic projectile damage from companion magic power", () => {
    const attacker = withStats(
      createAttackingCompanion("attacker", { x: 0, y: 0 }, "elementalist"),
      { strength: 1, dexterity: 1, constitution: 1, intelligence: 50, wisdom: 1 },
    );
    const target = createEnemy("target", { x: 1, y: 0 }, undefined, {
      defense: 999,
      evasion: 0,
      magicDefense: 0,
      maxHealth: 100,
    });
    const launchedState = launchBasicCombatProjectile(
      createState([attacker, target]),
      attacker,
      target,
      magicProfile,
      1000,
    );

    const nextState = updateCombatProjectileSystem(launchedState, 1100, 100);
    const nextTarget = nextState.entities[target.id] as Enemy;

    expect(nextState.combatProjectiles).toEqual([]);
    expect(nextTarget.health).toBe(40);
    expect(nextState.combatFeedbackEvents.at(-1)).toMatchObject({
      damageType: "magic",
      sourceEntityId: attacker.id,
      targetEntityId: target.id,
    });
  });

  it("expires without damage when the target is dead", () => {
    const attacker = createAttackingCompanion("attacker", { x: 0, y: 0 });
    const target = {
      ...createEnemy("target", { x: 1, y: 0 }, undefined, {
        defense: 0,
        evasion: 0,
        maxHealth: 20,
      }),
      health: 0,
      state: "dead" as const,
    };
    const launchedState = launchBasicCombatProjectile(
      createState([attacker, target]),
      attacker,
      target,
      testProfile,
      1000,
    );

    const nextState = updateCombatProjectileSystem(launchedState, 1100, 100);

    expect(nextState.combatProjectiles).toEqual([]);
    expect((nextState.entities[target.id] as Enemy).health).toBe(0);
  });

  it("expires without damage when the target is missing", () => {
    const attacker = createAttackingCompanion("attacker", { x: 0, y: 0 });
    const target = createEnemy("target", { x: 1, y: 0 }, undefined, {
      defense: 0,
      evasion: 0,
      maxHealth: 20,
    });
    const launchedState = launchBasicCombatProjectile(
      createState([attacker, target]),
      attacker,
      target,
      testProfile,
      1000,
    );

    const nextState = updateCombatProjectileSystem(
      {
        ...launchedState,
        entities: {
          [attacker.id]: attacker,
        },
      },
      1100,
      100,
    );

    expect(nextState.combatProjectiles).toEqual([]);
  });

  it("does not hit other entities standing on the projectile path", () => {
    const attacker = createAttackingCompanion("attacker", { x: 0, y: 0 });
    const target = createEnemy("target", { x: 1, y: 0 }, undefined, {
      defense: 0,
      evasion: 0,
      maxHealth: 20,
    });
    const bystander = createEnemy("bystander", { x: 0.5, y: 0 }, undefined, {
      defense: 0,
      evasion: 0,
      maxHealth: 20,
    });
    const launchedState = launchBasicCombatProjectile(
      createState([attacker, target, bystander]),
      attacker,
      target,
      testProfile,
      1000,
    );

    const nextState = updateCombatProjectileSystem(launchedState, 1100, 100);

    expect((nextState.entities[target.id] as Enemy).health).toBeLessThan(
      target.health,
    );
    expect((nextState.entities[bystander.id] as Enemy).health).toBe(
      bystander.health,
    );
  });
});

function createState(entities: GameEntity[]) {
  return entities.reduce(
    addEntity,
    createTestGameState({
      partyLeaderId: "attacker",
    }),
  );
}

function createAttackingCompanion(
  id: string,
  position: { x: number; y: number },
  classId: Companion["classId"] = "hunter",
) {
  return {
    ...createCompanion(id, position, id, "fighter", 0, classId),
    state: "attack" as const,
    currentTargetId: "target",
  };
}

function withStats(companion: Companion, naturalStats: CompanionPrimaryStats): Companion {
  return {
    ...companion,
    naturalStats,
  };
}
