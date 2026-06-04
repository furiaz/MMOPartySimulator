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

  it("keeps direct player attack intent locked on the selected target", () => {
    const leader = createCompanion("leader", { x: 0, y: 0 }, "leader", "fighter");
    const selectedTarget = {
      ...createEnemy("selected-target", { x: 2, y: 0 }, "aggressive"),
      state: "attack" as const,
      currentTargetId: leader.id,
    };
    const closerThreat = {
      ...createEnemy("closer-threat", { x: 1, y: 0 }, "aggressive"),
      state: "attack" as const,
      currentTargetId: leader.id,
    };
    const state = createTestGameState({
      entities: {
        [leader.id]: leader,
        [selectedTarget.id]: selectedTarget,
        [closerThreat.id]: closerThreat,
      },
      partyLeaderId: leader.id,
      leaderIntent: {
        type: "attack",
        targetId: selectedTarget.id,
        targetPosition: selectedTarget.position,
        source: "player",
      },
    });

    const plan = resolvePartyActivityPlan(state, leader);

    expect(plan.phase).toBe("combat");
    expect(plan.target?.id).toBe(selectedTarget.id);
    expect(plan.targetPosition).toEqual(selectedTarget.position);
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

  it("keeps the current AI combat threat when another nearby threat is slightly closer", () => {
    const leader = createCompanion("leader", { x: 0, y: 0 }, "leader", "fighter");
    const currentThreat = {
      ...createEnemy("current-threat", { x: 2, y: 0 }, "aggressive"),
      state: "attack" as const,
      currentTargetId: leader.id,
    };
    const closerThreat = {
      ...createEnemy("closer-threat", { x: 1, y: 0 }, "aggressive"),
      state: "attack" as const,
      currentTargetId: leader.id,
    };
    const state = createTestGameState({
      entities: {
        [leader.id]: leader,
        [currentThreat.id]: currentThreat,
        [closerThreat.id]: closerThreat,
      },
      partyLeaderId: leader.id,
      leaderIntent: {
        type: "attack",
        targetId: currentThreat.id,
        targetPosition: currentThreat.position,
        source: "ai",
      },
    });

    const plan = resolvePartyActivityPlan(state, leader);

    expect(plan.phase).toBe("combat");
    expect(plan.target?.id).toBe(currentThreat.id);
  });

  it("switches AI combat commitment when the current threat is dead", () => {
    const leader = createCompanion("leader", { x: 0, y: 0 }, "leader", "fighter");
    const deadThreat = {
      ...createEnemy("dead-threat", { x: 1, y: 0 }, "aggressive"),
      state: "dead" as const,
      health: 0,
      currentTargetId: leader.id,
    };
    const liveThreat = {
      ...createEnemy("live-threat", { x: 2, y: 0 }, "aggressive"),
      state: "attack" as const,
      currentTargetId: leader.id,
    };
    const state = createTestGameState({
      entities: {
        [leader.id]: leader,
        [deadThreat.id]: deadThreat,
        [liveThreat.id]: liveThreat,
      },
      partyLeaderId: leader.id,
      leaderIntent: {
        type: "attack",
        targetId: deadThreat.id,
        targetPosition: deadThreat.position,
        source: "ai",
      },
    });

    const plan = resolvePartyActivityPlan(state, leader);

    expect(plan.phase).toBe("combat");
    expect(plan.target?.id).toBe(liveThreat.id);
  });

  it("switches AI combat commitment when the current threat leaves combat range", () => {
    const leader = createCompanion("leader", { x: 0, y: 0 }, "leader", "fighter");
    const distantThreat = {
      ...createEnemy("distant-threat", { x: 5, y: 0 }, "aggressive"),
      state: "attack" as const,
      currentTargetId: leader.id,
    };
    const closeThreat = {
      ...createEnemy("close-threat", { x: 2, y: 0 }, "aggressive"),
      state: "attack" as const,
      currentTargetId: leader.id,
    };
    const state = createTestGameState({
      entities: {
        [leader.id]: leader,
        [distantThreat.id]: distantThreat,
        [closeThreat.id]: closeThreat,
      },
      partyLeaderId: leader.id,
      leaderIntent: {
        type: "attack",
        targetId: distantThreat.id,
        targetPosition: distantThreat.position,
        source: "ai",
      },
    });

    const plan = resolvePartyActivityPlan(state, leader);

    expect(plan.phase).toBe("combat");
    expect(plan.target?.id).toBe(closeThreat.id);
  });

  it("lets a movement blocker override the current AI combat commitment", () => {
    const leader = createCompanion("leader", { x: 0, y: 0 }, "leader", "fighter");
    const currentThreat = {
      ...createEnemy("current-threat", { x: 2, y: 0 }, "aggressive"),
      state: "attack" as const,
      currentTargetId: leader.id,
    };
    const blocker = createEnemy("blocker", { x: 1, y: 0 }, "passive");
    const state = createTestGameState({
      entities: {
        [leader.id]: leader,
        [currentThreat.id]: currentThreat,
        [blocker.id]: blocker,
      },
      partyLeaderId: leader.id,
      leaderIntent: {
        type: "attack",
        targetId: currentThreat.id,
        targetPosition: currentThreat.position,
        source: "ai",
      },
      movementFailuresByEntityId: {
        [leader.id]: {
          blockerId: blocker.id,
          blockerKind: "enemy",
          intendedPosition: blocker.position,
        },
      },
    });

    const plan = resolvePartyActivityPlan(state, leader);

    expect(plan.phase).toBe("combat");
    expect(plan.target?.id).toBe(blocker.id);
  });

  it("lets a direct companion's personal attacker override AI combat commitment", () => {
    const leader = createCompanion("leader", { x: 0, y: 0 }, "leader", "fighter");
    const directCompanion = {
      ...createCompanion("direct", { x: 0, y: 1 }, leader.id, "support"),
      commandPriority: "direct" as const,
    };
    const currentThreat = {
      ...createEnemy("current-threat", { x: 2, y: 0 }, "aggressive"),
      state: "attack" as const,
      currentTargetId: leader.id,
    };
    const personalAttacker = {
      ...createEnemy("personal-attacker", { x: 0, y: 2 }, "aggressive"),
      state: "attack" as const,
      currentTargetId: directCompanion.id,
    };
    const state = createTestGameState({
      entities: {
        [leader.id]: leader,
        [directCompanion.id]: directCompanion,
        [currentThreat.id]: currentThreat,
        [personalAttacker.id]: personalAttacker,
      },
      partyLeaderId: leader.id,
      leaderIntent: {
        type: "attack",
        targetId: currentThreat.id,
        targetPosition: currentThreat.position,
        source: "ai",
      },
    });

    const plan = resolvePartyActivityPlan(state, leader);

    expect(plan.phase).toBe("combat");
    expect(plan.target?.id).toBe(personalAttacker.id);
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

  it("preserves non-Gatherer-role collectors during AI travel and combat retasks", () => {
    const leader = createCompanion("leader", { x: 0, y: 0 }, "leader", "fighter");
    const resource = createResource("resource", { x: 2, y: 0 });
    const collector = {
      ...createCompanion("collector", { x: 1, y: 0 }, leader.id, "defender"),
      state: "gather" as const,
      currentTargetId: resource.id,
    };
    const state = createTestGameState({
      entities: {
        [leader.id]: leader,
        [collector.id]: collector,
        [resource.id]: resource,
      },
      partyLeaderId: leader.id,
    });

    expect(canAssignPartyTravelTarget(state, collector, leader.id, false)).toBe(
      false,
    );
    expect(canAssignPartyCombatTarget(state, collector, false)).toBe(false);
    expect(isRequiredForTravelCohesion(state, collector, leader)).toBe(false);
    expect(canAssignPartyTravelTarget(state, collector, leader.id, true)).toBe(true);
    expect(canAssignPartyCombatTarget(state, collector, true)).toBe(true);
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
