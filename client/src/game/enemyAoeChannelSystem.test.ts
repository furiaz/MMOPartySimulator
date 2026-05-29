import { describe, expect, it } from "vitest";
import { createCompanion, createEnemy, createTargetDummy } from "./entities";
import {
  AOE_DUMMY_STOMP_CHANNEL_MS,
  AOE_DUMMY_STOMP_COOLDOWN_MS,
  AOE_DUMMY_STOMP_RADIUS,
  AOE_DUMMY_STOMP_WINDUP_MS,
  updateEnemyAoeChannelSystem,
} from "./enemyAoeChannelSystem";
import {
  HUB_MAP_ID,
  aoeTargetDummyId,
  aoeTargetDummyPosition,
  createDebugMap,
} from "./debugMap";
import { addEntity, setLeaderIntent, updateEntity, type GameState } from "./state";
import { createTestGameState } from "./testState";
import type { EnemyAoeChannelState, GameEntity } from "./types";

describe("enemy AoE channel system", () => {
  it("starts the AoE dummy channel only when player or party engaged", () => {
    const leader = createCompanion("leader", { x: 54, y: 8 }, "leader", "fighter");
    const dummy = createTargetDummy(aoeTargetDummyId, aoeTargetDummyPosition);
    const idleState = createState([leader, dummy]);

    expect(
      updateEnemyAoeChannelSystem(idleState, 1000).enemyAoeChannelsByCasterId,
    ).toBeUndefined();

    const engagedState = setLeaderIntent(idleState, {
      type: "attack",
      targetId: dummy.id,
      targetPosition: dummy.position,
      source: "player",
    });
    const nextState = updateEnemyAoeChannelSystem(engagedState, 1000);
    const channel = nextState.enemyAoeChannelsByCasterId?.[dummy.id];

    expect(channel).toMatchObject({
      casterId: dummy.id,
      phase: "channeling",
      shape: {
        type: "circle",
        center: dummy.position,
        radius: AOE_DUMMY_STOMP_RADIUS,
      },
    });
  });

  it("lets engaged Heavy Slimes cast the same stomp channel", () => {
    const leader = createCompanion("leader", { x: 9, y: 8 }, "leader", "fighter");
    const heavySlime = createEnemy("heavy-slime", { x: 10, y: 8 }, undefined, {
      enemyTypeId: "slimeward_heavy_slime",
    });
    const engagedState = setLeaderIntent(createState([leader, heavySlime]), {
      type: "attack",
      targetId: heavySlime.id,
      targetPosition: heavySlime.position,
      source: "player",
    });

    const nextState = updateEnemyAoeChannelSystem(engagedState, 1000);
    const channel = nextState.enemyAoeChannelsByCasterId?.[heavySlime.id];

    expect(channel).toMatchObject({
      abilityId: "aoe_dummy_stomp",
      casterId: heavySlime.id,
      shape: {
        type: "circle",
        center: heavySlime.position,
        radius: AOE_DUMMY_STOMP_RADIUS,
      },
    });
  });

  it("damages only living companions inside the locked AoE at impact time", () => {
    const leader = createCompanion("leader", { x: 54, y: 8 }, "leader", "fighter");
    const entering = createCompanion("entering", { x: 60, y: 8 }, "leader");
    const leaving = createCompanion("leaving", { x: 55.5, y: 8 }, "leader");
    const dead = {
      ...createCompanion("dead", { x: 55, y: 8.5 }, "leader"),
      state: "dead" as const,
      health: 0,
    };
    const dummy = createTargetDummy(aoeTargetDummyId, aoeTargetDummyPosition);
    let state = setLeaderIntent(
      createState([leader, entering, leaving, dead, dummy]),
      {
        type: "attack",
        targetId: dummy.id,
        targetPosition: dummy.position,
        source: "player",
      },
    );

    state = updateEnemyAoeChannelSystem(state, 1000);
    const channel = state.enemyAoeChannelsByCasterId?.[dummy.id];
    expect(channel?.shape.center).toEqual(dummy.position);

    state = updateEntity(state, {
      ...entering,
      position: { x: 55, y: 9 },
    });
    state = updateEntity(state, {
      ...leaving,
      position: { x: 60, y: 8 },
    });

    const beforeImpact = updateEnemyAoeChannelSystem(
      state,
      1000 + AOE_DUMMY_STOMP_CHANNEL_MS + AOE_DUMMY_STOMP_WINDUP_MS - 1,
    );
    expect(getHealth(beforeImpact, entering.id)).toBe(entering.health);

    const afterImpact = updateEnemyAoeChannelSystem(
      beforeImpact,
      1000 + AOE_DUMMY_STOMP_CHANNEL_MS + AOE_DUMMY_STOMP_WINDUP_MS,
    );

    expect(getHealth(afterImpact, leader.id)).toBe(leader.health - 1);
    expect(getHealth(afterImpact, entering.id)).toBe(entering.health - 1);
    expect(getHealth(afterImpact, leaving.id)).toBe(leaving.health);
    expect(getHealth(afterImpact, dead.id)).toBe(0);
    expect(afterImpact.enemyAoeChannelsByCasterId?.[dummy.id]).toBeUndefined();
    expect(afterImpact.enemyAoeCooldownsByCasterId?.[dummy.id]?.expiresAt).toBe(
      1000 +
        AOE_DUMMY_STOMP_CHANNEL_MS +
        AOE_DUMMY_STOMP_WINDUP_MS +
        AOE_DUMMY_STOMP_COOLDOWN_MS,
    );
  });

  it("cancels and starts cooldown when the caster is bound", () => {
    const leader = createCompanion("leader", { x: 54, y: 8 }, "leader", "fighter");
    const dummy = createTargetDummy(aoeTargetDummyId, aoeTargetDummyPosition);
    let state = setLeaderIntent(createState([leader, dummy]), {
      type: "attack",
      targetId: dummy.id,
      targetPosition: dummy.position,
      source: "player",
    });

    state = updateEnemyAoeChannelSystem(state, 1000);
    state = {
      ...state,
      skillBindsByEnemyId: {
        [dummy.id]: {
          sourceId: leader.id,
          targetId: dummy.id,
          expiresAt: 5000,
        },
      },
    };

    const nextState = updateEnemyAoeChannelSystem(state, 1100);

    expect(nextState.enemyAoeChannelsByCasterId?.[dummy.id]).toBeUndefined();
    expect(nextState.enemyAoeCooldownsByCasterId?.[dummy.id]?.expiresAt).toBe(
      1100 + AOE_DUMMY_STOMP_COOLDOWN_MS,
    );
  });

  it("cancels and starts cooldown when LOS to the locked AoE center is blocked", () => {
    const caster = createEnemy("enemy", { x: 29, y: 12 });
    const channel = createChannel(caster, { x: 31, y: 12 }, 1000);
    const state = createState([caster], {
      enemyAoeChannelsByCasterId: {
        [caster.id]: channel,
      },
      map: createDebugMap(HUB_MAP_ID),
      currentMapId: HUB_MAP_ID,
    });

    const nextState = updateEnemyAoeChannelSystem(state, 1100);

    expect(nextState.enemyAoeChannelsByCasterId?.[caster.id]).toBeUndefined();
    expect(nextState.enemyAoeCooldownsByCasterId?.[caster.id]?.expiresAt).toBe(
      1100 + AOE_DUMMY_STOMP_COOLDOWN_MS,
    );
  });
});

function createState(
  entities: GameEntity[],
  overrides: Partial<GameState> = {},
): GameState {
  return entities.reduce(
    addEntity,
    createTestGameState({
      currentMapId: HUB_MAP_ID,
      map: createDebugMap(HUB_MAP_ID),
      partyLeaderId: entities.find((entity) => entity.kind === "companion")?.id ?? "",
      ...overrides,
    }),
  );
}

function createChannel(
  caster: ReturnType<typeof createEnemy>,
  center: { x: number; y: number },
  now: number,
): EnemyAoeChannelState {
  return {
    id: `test:${caster.id}:${now}`,
    abilityId: "aoe_dummy_stomp",
    casterId: caster.id,
    shape: {
      type: "circle",
      center,
      radius: AOE_DUMMY_STOMP_RADIUS,
    },
    phase: "channeling",
    startedAt: now,
    channelEndsAt: now + AOE_DUMMY_STOMP_CHANNEL_MS,
    windupEndsAt: now + AOE_DUMMY_STOMP_CHANNEL_MS + AOE_DUMMY_STOMP_WINDUP_MS,
    cooldownMs: AOE_DUMMY_STOMP_COOLDOWN_MS,
  };
}

function getHealth(state: GameState, entityId: string): number | undefined {
  const entity = state.entities[entityId];

  return entity && "health" in entity ? entity.health : undefined;
}
