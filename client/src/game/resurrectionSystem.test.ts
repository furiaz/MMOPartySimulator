import { describe, expect, it } from "vitest";
import { createCompanion, createEnemy } from "./entities";
import { issueCompanionCommand } from "./commands";
import { startDebugTelemetryRecording } from "./debugTelemetry";
import { updateAttackSystem } from "./attackSystem";
import { updateSkillSystem } from "./skillSystem";
import {
  RESURRECTION_REQUIRED_MS,
  clearResurrectionRecoveryAssignmentForCompanion,
  isCompanionAssignedToResurrectionRecovery,
  updateResurrectionSystem,
} from "./resurrectionSystem";
import { addEntity } from "./state";
import { setPartyIntent } from "./partyIntentState";
import { createTestGameState } from "./testState";
import type { GameState } from "./state";
import type { Companion, GameEntity } from "./types";

describe("resurrection system", () => {
  it("does not start resurrection without Manager recovery intent", () => {
    const helper = createCompanion("helper", { x: 0, y: 0 }, "helper");
    const deadCompanion = createDeadCompanion("dead", { x: 1, y: 0 }, helper.id);
    const state = createState([helper, deadCompanion], helper.id, {
      recoveryTargetId: null,
    });

    const nextState = updateResurrectionSystem(state, new Set(), 1_000, 1_000);

    expect(nextState.entities[deadCompanion.id]).toMatchObject({
      state: "dead",
      health: 0,
    });
    expect(nextState.resurrectionProgressByCompanionId?.[deadCompanion.id]).toBeUndefined();
    expect(nextState.resurrectionChannelsByHelperId?.[helper.id]).toBeUndefined();
  });

  it("uses the Manager recovery target instead of choosing the nearest dead companion", () => {
    const helper = createCompanion("helper", { x: 0, y: 0 }, "helper");
    const nearbyDeadCompanion = createDeadCompanion("near-dead", { x: 1, y: 0 }, helper.id);
    const managerTarget = createDeadCompanion("manager-target", { x: 4, y: 0 }, helper.id);
    const state = createState(
      [helper, nearbyDeadCompanion, managerTarget],
      helper.id,
      { recoveryTargetId: managerTarget.id },
    );

    const nextState = updateResurrectionSystem(state, new Set(), 1_000, 1_000);

    expect(nextState.resurrectionChannelsByHelperId?.[helper.id]).toMatchObject({
      targetId: managerTarget.id,
    });
    expect(
      nextState.resurrectionProgressByCompanionId?.[nearbyDeadCompanion.id],
    ).toBeUndefined();
  });

  it("revives a dead companion at 1 HP after one helper channels for 10 seconds", () => {
    const helper = createCompanion("helper", { x: 0, y: 0 }, "helper");
    const deadCompanion = createDeadCompanion("dead", { x: 1, y: 0 }, helper.id);
    const state = createState([helper, deadCompanion], helper.id);

    const nextState = updateResurrectionSystem(
      state,
      new Set(),
      10_000,
      RESURRECTION_REQUIRED_MS,
    );

    expect(nextState.entities[deadCompanion.id]).toMatchObject({
      state: "follow",
      health: 1,
      commandPriority: "autonomous",
      currentTargetId: helper.id,
    });
    expect(nextState.resurrectionProgressByCompanionId?.[deadCompanion.id]).toBeUndefined();
    expect(nextState.resurrectionChannelsByHelperId?.[helper.id]).toBeUndefined();
  });

  it("lets multiple helpers speed up target-owned resurrection progress with diminishing returns", () => {
    const helperOne = createCompanion("helper-1", { x: 0, y: 0 }, "helper-1");
    const helperTwo = createCompanion("helper-2", { x: 0, y: 1 }, "helper-1");
    const deadCompanion = createDeadCompanion("dead", { x: 1, y: 0 }, helperOne.id);
    const state = createState([helperOne, helperTwo, deadCompanion], helperOne.id);

    const nextState = updateResurrectionSystem(
      state,
      new Set(),
      7_000,
      7_000,
    );

    expect(nextState.entities[deadCompanion.id]).toMatchObject({
      state: "follow",
      health: 1,
    });
  });

  it("keeps resurrection progress when a helper is directly ordered away", () => {
    const helper = createCompanion("helper", { x: 0, y: 0 }, "helper");
    const deadCompanion = createDeadCompanion("dead", { x: 1, y: 0 }, helper.id);
    const state = createState([helper, deadCompanion], helper.id);
    const progressedState = updateResurrectionSystem(state, new Set(), 9_000, 9_000);

    const orderedState = issueCompanionCommand(progressedState, {
      type: "idle",
      companionId: helper.id,
    });

    expect(orderedState.resurrectionChannelsByHelperId?.[helper.id]).toBeUndefined();
    expect(
      orderedState.resurrectionProgressByCompanionId?.[deadCompanion.id]?.progressMs,
    ).toBe(9_000);
  });

  it("removes only the directly commanded helper assignment", () => {
    const helperOne = createCompanion("helper-1", { x: 0, y: 0 }, "helper-1");
    const helperTwo = createCompanion("helper-2", { x: 0, y: 1 }, "helper-1");
    const deadCompanion = createDeadCompanion("dead", { x: 1, y: 0 }, helperOne.id);
    const state = updateResurrectionSystem(
      createState([helperOne, helperTwo, deadCompanion], helperOne.id),
      new Set(),
      1_000,
      1_000,
    );

    const nextState = clearResurrectionRecoveryAssignmentForCompanion(
      state,
      helperOne.id,
      2_000,
      "direct_command",
    );

    expect(nextState.resurrectionChannelsByHelperId?.[helperOne.id]).toBeUndefined();
    expect(nextState.resurrectionChannelsByHelperId?.[helperTwo.id]).toMatchObject({
      targetId: deadCompanion.id,
    });
  });

  it("keeps existing resurrection participants assigned when combat starts", () => {
    const helper = createCompanion("helper", { x: 0, y: 0 }, "helper");
    const fighter = {
      ...createCompanion("fighter", { x: 5, y: 5 }, helper.id),
      state: "attack" as const,
      currentTargetId: "enemy",
    };
    const deadCompanion = createDeadCompanion("dead", { x: 1, y: 0 }, helper.id);
    const enemy = {
      ...createEnemy("enemy", { x: 5, y: 6 }, "aggressive"),
      state: "attack" as const,
      currentTargetId: fighter.id,
    };
    const channelingState = updateResurrectionSystem(
      createState([helper, fighter, deadCompanion], helper.id),
      new Set(),
      1_000,
      1_000,
    );
    const helperOnlyAssignedState = clearResurrectionRecoveryAssignmentForCompanion(
      channelingState,
      fighter.id,
      1_500,
      "direct_command",
    );

    const combatState = addEntity(helperOnlyAssignedState, enemy);
    const nextState = updateResurrectionSystem(combatState, new Set(), 2_000, 1_000);

    expect(isCompanionAssignedToResurrectionRecovery(nextState, helper.id)).toBe(true);
    expect(
      nextState.resurrectionProgressByCompanionId?.[deadCompanion.id]?.progressMs,
    ).toBe(3_000);
    expect(nextState.resurrectionChannelsByHelperId?.[fighter.id]).toMatchObject({
      targetId: deadCompanion.id,
    });
  });

  it("does not treat dead companions as harmful attack targets", () => {
    const deadCompanion = createDeadCompanion("dead", { x: 0, y: 0 }, "dead");
    const enemy = {
      ...createEnemy("enemy", { x: 0, y: 0 }, "aggressive"),
      state: "attack" as const,
      currentTargetId: deadCompanion.id,
      lastAttackAt: -1_000,
    };
    const state = createState([deadCompanion, enemy], deadCompanion.id);

    const nextState = updateAttackSystem(state, new Set(), 2_000);

    expect(nextState.entities[deadCompanion.id]).toMatchObject({
      state: "dead",
      health: 0,
    });
    expect(nextState.entities[enemy.id]).toMatchObject({
      state: "idle",
      currentTargetId: null,
    });
  });

  it("lets a recovery participant attack an active enemy already in range", () => {
    const helper = createCompanion("helper", { x: 2, y: 0 }, "helper");
    const deadCompanion = createDeadCompanion("dead", { x: 0, y: 0 }, helper.id);
    const enemy = {
      ...createEnemy("enemy", { x: 3, y: 0 }, "aggressive"),
      state: "attack" as const,
      currentTargetId: helper.id,
    };
    const recoveryState = updateResurrectionSystem(
      createState([helper, deadCompanion, enemy], helper.id),
      new Set(),
      1_000,
      100,
    );

    const nextState = updateAttackSystem(recoveryState, new Set(), 3_000);

    expect(nextState.entities[helper.id]).toMatchObject({
      position: helper.position,
    });
    const damagedEnemy = nextState.entities[enemy.id];

    expect(damagedEnemy?.kind).toBe("enemy");
    expect(damagedEnemy?.kind === "enemy" ? damagedEnemy.health : enemy.health)
      .toBeLessThan(enemy.health);
  });

  it("moves a recovery participant toward an active ranged threat inside the resurrection area", () => {
    const helper = createCompanion("helper", { x: -1, y: 0 }, "helper");
    const deadCompanion = createDeadCompanion("dead", { x: 0, y: 0 }, helper.id);
    const enemy = {
      ...createEnemy("enemy", { x: 4, y: 0 }, "aggressive"),
      state: "attack" as const,
      currentTargetId: helper.id,
    };
    const movedEntityIds = new Set<string>();
    const recoveryState = updateResurrectionSystem(
      createState([helper, deadCompanion, enemy], helper.id),
      movedEntityIds,
      1_000,
      100,
    );

    const nextState = updateAttackSystem(recoveryState, movedEntityIds, 3_000);

    expect(recoveryState.entities[helper.id]).toMatchObject({
      state: "attack",
      currentTargetId: enemy.id,
    });
    expect(nextState.entities[helper.id].position).not.toEqual(helper.position);
  });

  it("keeps a recovery participant from chasing an enemy out of range", () => {
    const helper = {
      ...createCompanion("helper", { x: 2, y: 0 }, "helper"),
      state: "attack" as const,
      currentTargetId: "enemy",
    };
    const deadCompanion = createDeadCompanion("dead", { x: 0, y: 0 }, helper.id);
    const enemy = createEnemy("enemy", { x: 8, y: 0 }, "aggressive");
    const state: GameState = {
      ...createState([helper, deadCompanion, enemy], helper.id),
      resurrectionChannelsByHelperId: {
        [helper.id]: {
          helperId: helper.id,
          targetId: deadCompanion.id,
        },
      },
    };

    const nextState = updateAttackSystem(state, new Set(), 3_000);

    expect(nextState.entities[helper.id]).toMatchObject({
      position: helper.position,
      state: "attack",
      currentTargetId: enemy.id,
    });
  });

  it("returns a recovery participant to resurrection positioning after the in-area threat is invalid", () => {
    const helper = {
      ...createCompanion("helper", { x: -1, y: 0 }, "helper"),
      state: "attack" as const,
      currentTargetId: "enemy",
    };
    const deadCompanion = createDeadCompanion("dead", { x: 0, y: 0 }, helper.id);
    const enemy = {
      ...createEnemy("enemy", { x: 4, y: 0 }, "aggressive"),
      state: "dead" as const,
      health: 0,
      currentTargetId: helper.id,
    };
    const state: GameState = {
      ...createState([helper, deadCompanion, enemy], helper.id),
      resurrectionChannelsByHelperId: {
        [helper.id]: {
          helperId: helper.id,
          targetId: deadCompanion.id,
        },
      },
    };

    const nextState = updateResurrectionSystem(state, new Set(), 2_000, 100);

    expect(nextState.entities[helper.id]).toMatchObject({
      state: "follow",
      currentTargetId: deadCompanion.id,
    });
  });

  it("keeps a recovery participant from casting ranged offensive skills out of attack range", () => {
    const helper = {
      ...createCompanion(
        "helper",
        { x: 2, y: 0 },
        "dead",
        "fighter",
        1,
        "elementalist",
      ),
      state: "attack" as const,
      currentTargetId: "enemy",
    };
    const deadCompanion = createDeadCompanion("dead", { x: 0, y: 0 }, helper.id);
    const enemy = createEnemy("enemy", { x: 6, y: 0 }, "aggressive");
    const state: GameState = {
      ...createState([helper, deadCompanion, enemy], helper.id),
      resurrectionChannelsByHelperId: {
        [helper.id]: {
          helperId: helper.id,
          targetId: deadCompanion.id,
        },
      },
    };

    const nextState = updateSkillSystem(state, 20_000);
    const untouchedEnemy = nextState.entities[enemy.id];

    expect(untouchedEnemy?.kind).toBe("enemy");
    expect(untouchedEnemy?.kind === "enemy" ? untouchedEnemy.health : 0).toBe(
      enemy.health,
    );
  });

  it("records resurrection telemetry when debug recording is enabled", () => {
    const helper = createCompanion("helper", { x: 0, y: 0 }, "helper");
    const deadCompanion = createDeadCompanion("dead", { x: 1, y: 0 }, helper.id);
    const state = startDebugTelemetryRecording(
      createState([helper, deadCompanion], helper.id),
    );

    const startedState = updateResurrectionSystem(state, new Set(), 1_000, 1_000);
    const canceledState = clearResurrectionRecoveryAssignmentForCompanion(
      startedState,
      helper.id,
      2_000,
      "direct_command",
    );

    expect(canceledState.debugTelemetry?.events.map((event) => event.type)).toEqual(
      expect.arrayContaining([
        "resurrection_target_selected",
        "resurrection_participant_assigned",
        "resurrection_area_progressed",
        "resurrection_participant_removed",
      ]),
    );
    expect(canceledState.debugTelemetry?.events.at(-1)).toMatchObject({
      type: "resurrection_participant_removed",
      entityId: helper.id,
      targetId: deadCompanion.id,
      cancelReason: "direct_command",
    });
  });
});

function createDeadCompanion(
  id: string,
  position: { x: number; y: number },
  followTargetId: string,
): Companion {
  return {
    ...createCompanion(id, position, followTargetId),
    state: "dead",
    health: 0,
  };
}

type CreateStateOptions = {
  recoveryTargetId?: string | null;
};

function createState(
  entities: GameEntity[],
  partyLeaderId: string,
  options: CreateStateOptions = {},
): GameState {
  const state = entities.reduce(addEntity, createTestGameState({ partyLeaderId }));
  const recoveryTargetId =
    options.recoveryTargetId === undefined
      ? entities.find((entity) => entity.kind === "companion" && entity.state === "dead")
          ?.id ?? null
      : options.recoveryTargetId;

  if (!recoveryTargetId) {
    return state;
  }

  return setPartyIntent(state, {
    mode: "resurrect",
    source: "ai",
    executionIntent: null,
    globalPoiIntent: null,
    localPoiTarget: null,
    worldTravelTargetMapId: state.worldTravelTargetMapId,
    queuedIntent: null,
    recoveryIntent: {
      action: "resurrect",
      deadCompanionId: recoveryTargetId,
      threatEnemyIds: [],
    },
  });
}
