import { describe, expect, it } from "vitest";
import { createCompanion, createEnemy } from "./entities";
import { updateRoleSystem } from "./roleSystem";
import { createTestGameState } from "./testState";

describe("role system Party Manager target ownership", () => {
  it.each(["fighter", "support", "defender"] as const)(
    "does not let a %s inherit leader.currentTargetId without Party Manager attack intent",
    (role) => {
      const leader = {
        ...createCompanion("leader", { x: 0, y: 0 }, "leader", "fighter"),
        state: "attack" as const,
        currentTargetId: "enemy",
      };
      const partyMember = createCompanion("member", { x: 1, y: 0 }, leader.id, role);
      const enemy = createEnemy("enemy", { x: 2, y: 0 }, "aggressive");
      const state = createTestGameState({
        entities: {
          [leader.id]: leader,
          [partyMember.id]: partyMember,
          [enemy.id]: enemy,
        },
        partyLeaderId: leader.id,
        leaderIntent: null,
        partyIntent: null,
      });

      const nextState = updateRoleSystem(state);

      expect(nextState.entities[partyMember.id]).not.toMatchObject({
        state: "attack",
        currentTargetId: enemy.id,
      });
    },
  );
});
