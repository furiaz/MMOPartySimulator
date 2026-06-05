import { describe, expect, it } from "vitest";
import {
  assignCurrentRoleBonuses,
  createCompanion,
  createPendingRoleBonusState,
  getActiveRoleBonusRole,
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
});
