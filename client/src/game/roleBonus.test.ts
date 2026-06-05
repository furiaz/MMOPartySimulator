import { describe, expect, it } from "vitest";
import {
  assignCurrentRoleBonuses,
  createCompanion,
  createPendingRoleBonusState,
  getActiveRoleBonusRole,
  getCompanionEffectiveGatherSpeed,
  getCompanionRoleBonusModifiers,
  getRoleBonusDisplayState,
  setPartyMemberRole,
  updateGame,
  updateRoleBonusAssignments,
} from "./index";
import { createTestGameState } from "./testState";

describe("role bonus assignment timing", () => {
  it("starts new companions with their current real role bonus active", () => {
    const companion = createCompanion(
      "companion",
      { x: 0, y: 0 },
      "companion",
      "defender",
    );

    expect(companion.roleBonus).toEqual({
      activeRole: "defender",
      pendingRole: null,
      changedAt: null,
      activatesAt: null,
    });
    expect(getActiveRoleBonusRole(companion)).toBe("defender");
  });

  it("gives none-role companions no active or pending role bonus", () => {
    const companion = createCompanion("companion", { x: 0, y: 0 }, "companion");

    expect(companion.role).toBe("none");
    expect(companion.roleBonus).toEqual({
      activeRole: null,
      pendingRole: null,
      changedAt: null,
      activatesAt: null,
    });
  });

  it("changes role immediately and starts a five-second pending bonus", () => {
    const companion = createCompanion(
      "companion",
      { x: 0, y: 0 },
      "companion",
      "defender",
    );
    const state = createTestGameState({
      entities: { companion },
      partyLeaderId: companion.id,
    });

    const nextState = setPartyMemberRole(state, companion.id, "fighter", 1000);
    const nextCompanion = nextState.entities.companion;

    expect(nextCompanion?.kind).toBe("companion");
    if (nextCompanion?.kind !== "companion") {
      return;
    }

    expect(nextCompanion.role).toBe("fighter");
    expect(nextCompanion.roleBonus).toEqual({
      activeRole: null,
      pendingRole: "fighter",
      changedAt: 1000,
      activatesAt: 6000,
    });
  });

  it("activates pending role bonuses after the delay", () => {
    const companion = {
      ...createCompanion("companion", { x: 0, y: 0 }, "companion", "support"),
      roleBonus: createPendingRoleBonusState("support", 1000),
    };
    const state = createTestGameState({
      entities: { companion },
      partyLeaderId: companion.id,
    });

    const beforeDelay = updateRoleBonusAssignments(state, 5999);
    const afterDelay = updateRoleBonusAssignments(state, 6000);

    expect(beforeDelay.entities.companion).toMatchObject({
      roleBonus: {
        activeRole: null,
        pendingRole: "support",
      },
    });
    expect(afterDelay.entities.companion).toMatchObject({
      roleBonus: {
        activeRole: "support",
        pendingRole: null,
        changedAt: null,
        activatesAt: null,
      },
    });
  });

  it("does not restart assignment when selecting the same role", () => {
    const companion = createCompanion(
      "companion",
      { x: 0, y: 0 },
      "companion",
      "support",
    );
    const state = createTestGameState({
      entities: { companion },
      partyLeaderId: companion.id,
    });

    expect(setPartyMemberRole(state, companion.id, "support", 1000)).toBe(state);
  });

  it("resets the timer when switching again during pending assignment", () => {
    const companion = createCompanion(
      "companion",
      { x: 0, y: 0 },
      "companion",
      "defender",
    );
    const state = createTestGameState({
      entities: { companion },
      partyLeaderId: companion.id,
    });

    const pendingFighter = setPartyMemberRole(state, companion.id, "fighter", 1000);
    const pendingGatherer = setPartyMemberRole(
      pendingFighter,
      companion.id,
      "gatherer",
      2500,
    );

    expect(pendingGatherer.entities.companion).toMatchObject({
      role: "gatherer",
      roleBonus: {
        activeRole: null,
        pendingRole: "gatherer",
        changedAt: 2500,
        activatesAt: 7500,
      },
    });
  });

  it("clears bonus state when changing to none", () => {
    const companion = createCompanion(
      "companion",
      { x: 0, y: 0 },
      "companion",
      "fighter",
    );
    const state = createTestGameState({
      entities: { companion },
      partyLeaderId: companion.id,
    });

    const nextState = setPartyMemberRole(state, companion.id, "none", 1000);

    expect(nextState.entities.companion).toMatchObject({
      role: "none",
      roleBonus: {
        activeRole: null,
        pendingRole: null,
        changedAt: null,
        activatesAt: null,
      },
    });
  });

  it("immediately assigns current role bonuses during transition cleanup", () => {
    const companion = {
      ...createCompanion("companion", { x: 0, y: 0 }, "companion", "fighter"),
      roleBonus: createPendingRoleBonusState("fighter", 1000),
    };
    const state = createTestGameState({
      entities: { companion },
      partyLeaderId: companion.id,
    });

    const nextState = assignCurrentRoleBonuses(state);

    expect(nextState.entities.companion).toMatchObject({
      roleBonus: {
        activeRole: "fighter",
        pendingRole: null,
        changedAt: null,
        activatesAt: null,
      },
    });
  });

  it("updates pending role bonuses during the game tick", () => {
    const companion = {
      ...createCompanion("companion", { x: 0, y: 0 }, "companion", "support"),
      roleBonus: createPendingRoleBonusState("support", 1000),
    };
    const state = createTestGameState({
      entities: { companion },
      partyLeaderId: companion.id,
    });

    const nextState = updateGame(state, { nowMs: 6000 });

    expect(nextState.entities.companion).toMatchObject({
      roleBonus: {
        activeRole: "support",
        pendingRole: null,
      },
    });
  });

  it("returns display-ready pending and assigned status", () => {
    const companion = {
      ...createCompanion("companion", { x: 0, y: 0 }, "companion", "support"),
      roleBonus: createPendingRoleBonusState("support", 1000),
    };

    expect(getRoleBonusDisplayState(companion, 2500)).toMatchObject({
      status: "pending",
      label: "Role bonus assigning: 4s",
      pendingRole: "support",
    });
    expect(getRoleBonusDisplayState(companion, 6000)).toMatchObject({
      status: "assigned",
      label: "Role Bonus Assigned",
      activeRole: "support",
    });
  });

  it("returns no value modifiers without an active role bonus", () => {
    const noneRole = createCompanion("none", { x: 0, y: 0 }, "none");
    const pendingRole = {
      ...createCompanion("pending", { x: 0, y: 0 }, "pending", "fighter"),
      roleBonus: createPendingRoleBonusState("fighter", 1000),
    };

    expect(getCompanionRoleBonusModifiers(noneRole)).toEqual({
      statModifiers: {},
      gatherSpeed: 0,
    });
    expect(getCompanionRoleBonusModifiers(pendingRole)).toEqual({
      statModifiers: {},
      gatherSpeed: 0,
    });
  });

  it("returns level-banded flat role bonus modifiers", () => {
    const levelOneDefender = createCompanion(
      "defender",
      { x: 0, y: 0 },
      "defender",
      "defender",
    );
    const levelTenFighter = {
      ...createCompanion("fighter", { x: 0, y: 0 }, "fighter", "fighter"),
      characterLevel: 10,
    };
    const levelTwentySupport = {
      ...createCompanion("support", { x: 0, y: 0 }, "support", "support"),
      characterLevel: 20,
    };

    expect(getCompanionRoleBonusModifiers(levelOneDefender)).toEqual({
      statModifiers: { defense: 10, block: 5 },
      gatherSpeed: 0,
    });
    expect(getCompanionRoleBonusModifiers(levelTenFighter)).toEqual({
      statModifiers: { attack: 20, magicPower: 20 },
      gatherSpeed: 0,
    });
    expect(getCompanionRoleBonusModifiers(levelTwentySupport)).toEqual({
      statModifiers: { healingPower: 20 },
      gatherSpeed: 0,
    });
  });

  it("adds Gatherer role bonus to effective gather speed", () => {
    const gatherer = createCompanion(
      "gatherer",
      { x: 0, y: 0 },
      "gatherer",
      "gatherer",
    );
    const highLevelGatherer = {
      ...gatherer,
      characterLevel: 10,
      roleBonus: {
        ...gatherer.roleBonus,
        activeRole: "gatherer" as const,
      },
    };

    expect(getCompanionEffectiveGatherSpeed(gatherer)).toBeCloseTo(1.1);
    expect(getCompanionEffectiveGatherSpeed(highLevelGatherer)).toBeCloseTo(1.2);
  });
});
