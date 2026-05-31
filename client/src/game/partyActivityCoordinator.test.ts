import { describe, expect, it } from "vitest";
import {
  canAssignPartyCombatTarget,
  canAssignPartyGatherTarget,
  canAssignPartyTravelTarget,
  canAssignSelfDefenseTarget,
  canUseAutonomousRoleBehavior,
  isRequiredForTravelCohesion,
  resolvePartyActivityPlan,
} from "./partyActivityCoordinator";
import { createCompanion, createEnemy, createResource } from "./entities";
import { createTestGameState } from "./testState";

describe("party activity coordinator", () => {
  it("keeps direct player party intent from being overridden by nearby AI threats", () => {
    const leader = createCompanion("leader", { x: 0, y: 0 }, "leader", "fighter");
    const closeThreat = {
      ...createEnemy("close-threat", { x: 1, y: 0 }, "aggressive"),
      state: "attack" as const,
      currentTargetId: leader.id,
    };
    const state = createTestGameState({
      entities: {
        [leader.id]: leader,
        [closeThreat.id]: closeThreat,
      },
      partyLeaderId: leader.id,
      leaderIntent: {
        type: "move",
        targetId: null,
        targetPosition: { x: 10, y: 0 },
        source: "player",
      },
    });

    const plan = resolvePartyActivityPlan(state, leader);

    expect(plan).toEqual({
      phase: "traveling",
      target: null,
      targetPosition: { x: 10, y: 0 },
    });
  });

  it("lets AI travel intent be interrupted by close active party threats", () => {
    const leader = createCompanion("leader", { x: 0, y: 0 }, "leader", "fighter");
    const closeThreat = {
      ...createEnemy("close-threat", { x: 1, y: 0 }, "aggressive"),
      state: "attack" as const,
      currentTargetId: leader.id,
    };
    const state = createTestGameState({
      entities: {
        [leader.id]: leader,
        [closeThreat.id]: closeThreat,
      },
      partyLeaderId: leader.id,
      leaderIntent: {
        type: "move",
        targetId: null,
        targetPosition: { x: 10, y: 0 },
        source: "ai",
      },
    });

    const plan = resolvePartyActivityPlan(state, leader);

    expect(plan.phase).toBe("combat");
    expect(plan.target?.id).toBe(closeThreat.id);
    expect(plan.targetPosition).toEqual(closeThreat.position);
  });

  it("keeps direct-commanded companions out of autonomous travel combat and gather assignment", () => {
    const leader = createCompanion("leader", { x: 0, y: 0 }, "leader", "fighter");
    const directCompanion = {
      ...createCompanion("direct", { x: 1, y: 0 }, leader.id, "support"),
      commandPriority: "direct" as const,
    };
    const state = createTestGameState({
      entities: {
        [leader.id]: leader,
        [directCompanion.id]: directCompanion,
      },
      partyLeaderId: leader.id,
    });

    expect(
      canAssignPartyTravelTarget(state, directCompanion, leader.id, true),
    ).toBe(false);
    expect(canAssignPartyCombatTarget(state, directCompanion, true)).toBe(false);
    expect(canAssignPartyGatherTarget(state, directCompanion, true)).toBe(false);
  });

  it("lets direct-commanded companions join self-defense only when personally threatened", () => {
    const leader = createCompanion("leader", { x: 0, y: 0 }, "leader", "fighter");
    const directCompanion = {
      ...createCompanion("direct", { x: 1, y: 0 }, leader.id, "support"),
      commandPriority: "direct" as const,
    };
    const leaderThreat = {
      ...createEnemy("leader-threat", { x: 2, y: 0 }, "aggressive"),
      state: "attack" as const,
      currentTargetId: leader.id,
    };
    const personalThreat = {
      ...createEnemy("personal-threat", { x: 1, y: 1 }, "aggressive"),
      state: "attack" as const,
      currentTargetId: directCompanion.id,
    };
    const state = createTestGameState({
      entities: {
        [leader.id]: leader,
        [directCompanion.id]: directCompanion,
        [leaderThreat.id]: leaderThreat,
        [personalThreat.id]: personalThreat,
      },
      partyLeaderId: leader.id,
    });

    expect(canAssignSelfDefenseTarget(state, directCompanion, leaderThreat)).toBe(
      false,
    );
    expect(canAssignSelfDefenseTarget(state, directCompanion, personalThreat)).toBe(
      true,
    );
  });

  it("excludes resurrection participants from autonomous coordination", () => {
    const leader = createCompanion("leader", { x: 0, y: 0 }, "leader", "fighter");
    const helper = createCompanion("helper", { x: 1, y: 0 }, leader.id, "support");
    const deadCompanion = {
      ...createCompanion("dead", { x: 2, y: 0 }, leader.id, "fighter"),
      state: "dead" as const,
      health: 0,
    };
    const enemy = createEnemy("enemy", { x: 1, y: 1 });
    const state = createTestGameState({
      entities: {
        [leader.id]: leader,
        [helper.id]: helper,
        [deadCompanion.id]: deadCompanion,
        [enemy.id]: enemy,
      },
      partyLeaderId: leader.id,
      resurrectionChannelsByHelperId: {
        [helper.id]: {
          helperId: helper.id,
          targetId: deadCompanion.id,
        },
      },
    });

    expect(canAssignPartyTravelTarget(state, helper, leader.id, false)).toBe(false);
    expect(canAssignPartyCombatTarget(state, helper, false)).toBe(false);
    expect(canAssignPartyGatherTarget(state, helper, false)).toBe(false);
    expect(canAssignSelfDefenseTarget(state, helper, enemy)).toBe(false);
    expect(isRequiredForTravelCohesion(state, helper, leader)).toBe(false);
    expect(canUseAutonomousRoleBehavior(state, helper)).toBe(false);
  });

  it("preserves busy Gatherer-role companions during AI retasks but lets player intent reclaim them", () => {
    const leader = createCompanion("leader", { x: 0, y: 0 }, "leader", "fighter");
    const resource = createResource("resource", { x: 2, y: 0 });
    const gatherer = {
      ...createCompanion("gatherer", { x: 1, y: 0 }, leader.id, "gatherer"),
      state: "gather" as const,
      currentTargetId: resource.id,
    };
    const state = createTestGameState({
      entities: {
        [leader.id]: leader,
        [gatherer.id]: gatherer,
        [resource.id]: resource,
      },
      partyLeaderId: leader.id,
    });

    expect(canAssignPartyTravelTarget(state, gatherer, leader.id, false)).toBe(
      false,
    );
    expect(canAssignPartyCombatTarget(state, gatherer, false)).toBe(false);
    expect(canAssignPartyTravelTarget(state, gatherer, leader.id, true)).toBe(true);
    expect(canAssignPartyCombatTarget(state, gatherer, true)).toBe(true);
  });

  it("ignores direct-command grace and personal threat responders for travel cohesion", () => {
    const leader = createCompanion("leader", { x: 0, y: 0 }, "leader", "fighter");
    const graceFollower = createCompanion(
      "grace-follower",
      { x: -1, y: 0 },
      leader.id,
      "support",
    );
    const threatenedFollower = {
      ...createCompanion("threatened", { x: -2, y: 0 }, leader.id, "fighter"),
      state: "attack" as const,
      currentTargetId: "threat",
    };
    const threat = {
      ...createEnemy("threat", { x: -2, y: 1 }, "aggressive"),
      state: "attack" as const,
      currentTargetId: threatenedFollower.id,
    };
    const state = createTestGameState({
      entities: {
        [leader.id]: leader,
        [graceFollower.id]: graceFollower,
        [threatenedFollower.id]: threatenedFollower,
        [threat.id]: threat,
      },
      partyLeaderId: leader.id,
      simulationTimeMs: 1_000,
      directCommandGraceUntilByCompanionId: {
        [graceFollower.id]: 2_000,
      },
    });

    expect(isRequiredForTravelCohesion(state, graceFollower, leader)).toBe(false);
    expect(isRequiredForTravelCohesion(state, threatenedFollower, leader)).toBe(
      false,
    );
  });
});
