import { describe, expect, it } from "vitest";
import { createCompanion, createEnemy, createTargetDummy } from "./entities";
import {
  AOE_DUMMY_PATTERN_NAMES,
  AOE_DUMMY_STOMP_CHANNEL_MS,
  AOE_DUMMY_STOMP_COOLDOWN_MS,
  AOE_DUMMY_PATTERN_GAP_MS,
  AOE_DUMMY_STOMP_RADIUS,
  AOE_DUMMY_STOMP_WINDUP_MS,
  updateEnemyAoeChannelSystem,
} from "./enemyAoeChannelSystem";
import {
  createAoeCastTransform,
  isPositionInsideAoe,
  resolveAoePattern,
} from "./aoePatterns";
import {
  HUB_MAP_ID,
  aoeTargetDummyId,
  aoeTargetDummyPosition,
  createDebugMap,
} from "./debugMap";
import { addEntity, updateEntity, type GameState } from "./state";
import { setLeaderIntent } from "./partyIntentState";
import { createTestGameState } from "./testState";
import type { EnemyAoeChannelState, GameEntity } from "./types";

describe("enemy AoE channel system", () => {
  it("starts the AoE dummy channel only when player or party engaged", () => {
    const leader = createCompanion("leader", atDummy(-1, 0), "leader", "fighter");
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
      area: {
        castTransform: {
          origin: dummy.position,
          direction: { x: -1, y: 0 },
        },
        primitives: [{
          type: "circle",
          center: dummy.position,
          radius: AOE_DUMMY_STOMP_RADIUS,
        }],
      },
      patternName: "Circle",
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
      area: {
        primitives: [{
          type: "circle",
          center: heavySlime.position,
          radius: AOE_DUMMY_STOMP_RADIUS,
        }],
      },
    });
  });

  it("damages only living companions inside the locked AoE at impact time", () => {
    const leader = createCompanion("leader", atDummy(-1, 0), "leader", "fighter");
    const entering = createCompanion("entering", atDummy(5, 0), "leader");
    const leaving = createCompanion("leaving", atDummy(0.5, 0), "leader");
    const dead = {
      ...createCompanion("dead", atDummy(0, 0.5), "leader"),
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
    expect(channel?.area.castTransform.origin).toEqual(dummy.position);

    state = updateEntity(state, {
      ...entering,
      position: atDummy(0, 1),
    });
    state = updateEntity(state, {
      ...leaving,
      position: atDummy(5, 0),
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
        AOE_DUMMY_PATTERN_GAP_MS,
    );
  });

  it("skips companions with active fake death when enemy AoE resolves", () => {
    const hunter = createCompanion("hunter", atDummy(0, 0), "leader", "fighter");
    const ally = createCompanion("ally", atDummy(0, 1), "leader", "fighter");
    const dummy = createTargetDummy(aoeTargetDummyId, aoeTargetDummyPosition);
    let state = setLeaderIntent(
      createState([hunter, ally, dummy], {
        statusEffectsById: {
          "hunter-fakeDeath-fake_death": {
            id: "hunter-fakeDeath-fake_death",
            type: "fakeDeath",
            targetId: hunter.id,
            sourceId: hunter.id,
            sourceKey: "fake_death",
            appliedAt: 1000,
            expiresAt: 4000,
          },
        },
      }),
      {
        type: "attack",
        targetId: dummy.id,
        targetPosition: dummy.position,
        source: "player",
      },
    );

    state = updateEnemyAoeChannelSystem(state, 1000);
    const afterImpact = updateEnemyAoeChannelSystem(
      state,
      1000 + AOE_DUMMY_STOMP_CHANNEL_MS + AOE_DUMMY_STOMP_WINDUP_MS,
    );

    expect(getHealth(afterImpact, hunter.id)).toBe(hunter.health);
    expect(getHealth(afterImpact, ally.id)).toBe(ally.health - 1);
  });

  it("cancels and starts cooldown when the caster is bound", () => {
    const leader = createCompanion("leader", atDummy(-1, 0), "leader", "fighter");
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
      1100 + AOE_DUMMY_PATTERN_GAP_MS,
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

  it("cycles all nine dummy patterns in order with a locked aim", () => {
    const leader = createCompanion("leader", atDummy(3, 0), "leader", "fighter");
    const dummy = createTargetDummy(aoeTargetDummyId, aoeTargetDummyPosition);
    let state = setLeaderIntent(createState([leader, dummy]), {
      type: "attack",
      targetId: dummy.id,
      targetPosition: dummy.position,
      source: "player",
    });
    let castStartedAt = 1000;

    for (const patternName of AOE_DUMMY_PATTERN_NAMES) {
      state = updateEnemyAoeChannelSystem(state, castStartedAt, () => 1);
      const channel = state.enemyAoeChannelsByCasterId?.[dummy.id];

      expect(channel?.patternName).toBe(patternName);
      expect(channel?.area.castTransform).toEqual({
        origin: aoeTargetDummyPosition,
        direction: { x: 1, y: 0 },
      });
      expect(
        state.combatFeedbackEvents.some((event) => event.text === patternName),
      ).toBe(true);

      state = updateEnemyAoeChannelSystem(
        state,
        castStartedAt + AOE_DUMMY_STOMP_CHANNEL_MS + AOE_DUMMY_STOMP_WINDUP_MS,
        () => 1,
      );
      castStartedAt +=
        AOE_DUMMY_STOMP_CHANNEL_MS +
        AOE_DUMMY_STOMP_WINDUP_MS +
        AOE_DUMMY_PATTERN_GAP_MS;
    }

    expect(state.aoeDummyPatternSequenceIndex).toBe(0);
  });

  it("aims at the most recently commanded living attacker", () => {
    const leader = createCompanion("leader", atDummy(-2, 0), "leader", "fighter");
    const older = createCompanion("older", atDummy(0, 2), "older", "fighter");
    const newer = createCompanion("newer", atDummy(0, -2), "newer", "fighter");
    const dummy = createTargetDummy(aoeTargetDummyId, aoeTargetDummyPosition);
    const state = createState([leader, older, newer, dummy], {
      aoeDummyPatternSequenceIndex: 3,
      directCompanionCommandsById: {
        [older.id]: {
          type: "attack",
          companionId: older.id,
          targetId: dummy.id,
          targetPosition: dummy.position,
          issuedAt: 100,
        },
        [newer.id]: {
          type: "attack",
          companionId: newer.id,
          targetId: dummy.id,
          targetPosition: dummy.position,
          issuedAt: 200,
        },
      },
    });

    const nextState = updateEnemyAoeChannelSystem(state, 1000);

    expect(nextState.enemyAoeChannelsByCasterId?.[dummy.id]?.area.castTransform)
      .toEqual({
        origin: dummy.position,
        direction: { x: 0, y: -1 },
      });
  });

  it("keeps the 0.75-second gap between dummy casts", () => {
    const leader = createCompanion("leader", atDummy(-1, 0), "leader", "fighter");
    const dummy = createTargetDummy(aoeTargetDummyId, aoeTargetDummyPosition);
    let state = setLeaderIntent(createState([leader, dummy]), {
      type: "attack",
      targetId: dummy.id,
      targetPosition: dummy.position,
      source: "player",
    });

    state = updateEnemyAoeChannelSystem(state, 1000, () => 1);
    const impactAt = 1000 + AOE_DUMMY_STOMP_CHANNEL_MS + AOE_DUMMY_STOMP_WINDUP_MS;
    state = updateEnemyAoeChannelSystem(state, impactAt, () => 1);

    const beforeGapEnds = updateEnemyAoeChannelSystem(
      state,
      impactAt + AOE_DUMMY_PATTERN_GAP_MS - 1,
      () => 1,
    );
    expect(beforeGapEnds.enemyAoeChannelsByCasterId?.[dummy.id]).toBeUndefined();

    const afterGapEnds = updateEnemyAoeChannelSystem(
      beforeGapEnds,
      impactAt + AOE_DUMMY_PATTERN_GAP_MS,
      () => 1,
    );
    expect(afterGapEnds.enemyAoeChannelsByCasterId?.[dummy.id]?.patternName)
      .toBe("Ring");
  });

  it("uses the approved larger ring bands and two-unit concentric safe lane", () => {
    const leader = createCompanion("leader", atDummy(5, 0), "leader", "fighter");
    const dummy = createTargetDummy(aoeTargetDummyId, aoeTargetDummyPosition);
    const attackIntent = {
      type: "attack" as const,
      targetId: dummy.id,
      targetPosition: dummy.position,
      source: "player" as const,
    };
    const ringState = updateEnemyAoeChannelSystem(
      setLeaderIntent(
        createState([leader, dummy], { aoeDummyPatternSequenceIndex: 1 }),
        attackIntent,
      ),
      1000,
      () => 1,
    );
    const ringArea = ringState.enemyAoeChannelsByCasterId?.[dummy.id]?.area;

    expect(ringArea?.primitives).toEqual([{
      type: "ring",
      center: aoeTargetDummyPosition,
      innerRadius: 2,
      outerRadius: 3.5,
    }]);

    const concentricState = updateEnemyAoeChannelSystem(
      setLeaderIntent(
        createState([leader, dummy], { aoeDummyPatternSequenceIndex: 2 }),
        attackIntent,
      ),
      1000,
      () => 1,
    );
    const concentricArea =
      concentricState.enemyAoeChannelsByCasterId?.[dummy.id]?.area;

    expect(concentricArea?.primitives).toEqual([
      {
        type: "ring",
        center: aoeTargetDummyPosition,
        innerRadius: 0.75,
        outerRadius: 1.75,
      },
      {
        type: "ring",
        center: aoeTargetDummyPosition,
        innerRadius: 3.75,
        outerRadius: 4.75,
      },
    ]);
    expect(concentricArea && isPositionInsideAoe(concentricArea, atDummy(2.75, 0)))
      .toBe(false);
  });

  it("applies one damage when combined pattern primitives overlap", () => {
    const leader = createCompanion("leader", atDummy(1, 0), "leader", "fighter");
    const dummy = createTargetDummy(aoeTargetDummyId, aoeTargetDummyPosition);
    let state = setLeaderIntent(
      createState([leader, dummy], { aoeDummyPatternSequenceIndex: 8 }),
      {
        type: "attack",
        targetId: dummy.id,
        targetPosition: dummy.position,
        source: "player",
      },
    );

    state = updateEnemyAoeChannelSystem(state, 1000, () => 1);
    expect(state.enemyAoeChannelsByCasterId?.[dummy.id]?.patternName).toBe(
      "Combined",
    );

    state = updateEnemyAoeChannelSystem(
      state,
      1000 + AOE_DUMMY_STOMP_CHANNEL_MS + AOE_DUMMY_STOMP_WINDUP_MS,
      () => 1,
    );

    expect(getHealth(state, leader.id)).toBe(leader.health - 1);
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
    area: resolveAoePattern(
      { type: "circle", radius: AOE_DUMMY_STOMP_RADIUS },
      createAoeCastTransform(center, center),
    ),
    phase: "channeling",
    startedAt: now,
    channelEndsAt: now + AOE_DUMMY_STOMP_CHANNEL_MS,
    windupEndsAt: now + AOE_DUMMY_STOMP_CHANNEL_MS + AOE_DUMMY_STOMP_WINDUP_MS,
    cooldownMs: AOE_DUMMY_STOMP_COOLDOWN_MS,
  };
}

function atDummy(xOffset: number, yOffset: number) {
  return {
    x: aoeTargetDummyPosition.x + xOffset,
    y: aoeTargetDummyPosition.y + yOffset,
  };
}

function getHealth(state: GameState, entityId: string): number | undefined {
  const entity = state.entities[entityId];

  return entity && "health" in entity ? entity.health : undefined;
}
