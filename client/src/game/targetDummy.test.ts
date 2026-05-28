import { describe, expect, it } from "vitest";
import { createCompanion, createTargetDummy } from "./entities";
import {
  aoeTargetDummyId,
  aoeTargetDummyPosition,
  createDebugMap,
  HUB_MAP_ID,
  hubNpcStartData,
  targetDummyPosition,
} from "./debugMap";
import { updateEnemyAISystem } from "./enemyAISystem";
import { addEntity, setLeaderIntent } from "./state";
import { findEnemyTarget } from "./skillTargeting";
import { createTestGameState } from "./testState";
import { updateGame } from "./updateGame";
import type { Enemy } from "./types";

describe("hub target dummy", () => {
  it("creates a passive 100 HP target dummy with no rewards", () => {
    const dummy = createTargetDummy("dummy", targetDummyPosition);

    expect(dummy).toMatchObject({
      kind: "enemy",
      health: 100,
      maxHealth: 100,
      aggressionMode: "passive",
      isTargetDummy: true,
      xpReward: 0,
      currentTargetId: null,
      state: "idle",
    });
    expect(dummy.archetypeId).toBeUndefined();
    expect(dummy.enemyTypeId).toBeUndefined();
  });

  it("does not select target dummies as automatic POIs", () => {
    const leader = {
      ...createCompanion("leader", { x: 30, y: 15 }, "leader", "fighter"),
      state: "idle" as const,
      currentTargetId: null,
    };
    const dummy = createTargetDummy("dummy", targetDummyPosition);
    const state = [leader, dummy].reduce(
      addEntity,
      createTestGameState({
        autoModeEnabled: true,
        currentMapId: HUB_MAP_ID,
        map: createDebugMap(HUB_MAP_ID),
        partyLeaderId: leader.id,
      }),
    );

    const nextState = updateGame(state, { nowMs: 1000, deltaMs: 100 });

    expect(nextState.localPoiTarget?.targetEntityId).not.toBe(dummy.id);
    expect(nextState.leaderIntent?.targetId).not.toBe(dummy.id);
  });

  it("does not select the AoE target dummy as an automatic POI", () => {
    const leader = {
      ...createCompanion("leader", { x: 55, y: 10 }, "leader", "fighter"),
      state: "idle" as const,
      currentTargetId: null,
    };
    const dummy = createTargetDummy(aoeTargetDummyId, aoeTargetDummyPosition);
    const state = [leader, dummy].reduce(
      addEntity,
      createTestGameState({
        autoModeEnabled: true,
        currentMapId: HUB_MAP_ID,
        map: createDebugMap(HUB_MAP_ID),
        partyLeaderId: leader.id,
      }),
    );

    const nextState = updateGame(state, { nowMs: 1000, deltaMs: 100 });

    expect(nextState.localPoiTarget?.targetEntityId).not.toBe(dummy.id);
    expect(nextState.leaderIntent?.targetId).not.toBe(dummy.id);
  });

  it("ignores target dummies for ambient skill targeting", () => {
    const leader = createCompanion(
      "leader",
      { x: targetDummyPosition.x - 1, y: targetDummyPosition.y },
      "leader",
      "fighter",
    );
    const dummy = createTargetDummy("dummy", targetDummyPosition);
    const state = [leader, dummy].reduce(
      addEntity,
      createTestGameState({
        currentMapId: HUB_MAP_ID,
        map: createDebugMap(HUB_MAP_ID),
        partyLeaderId: leader.id,
      }),
    );

    expect(findEnemyTarget(state, leader, 5)).toBeUndefined();
  });

  it("keeps target dummies stationary instead of roaming", () => {
    const dummy = {
      ...createTargetDummy("dummy", targetDummyPosition),
      position: { x: targetDummyPosition.x + 1, y: targetDummyPosition.y },
      state: "attack" as const,
      currentTargetId: "leader",
      roamTargetPosition: { x: targetDummyPosition.x + 2, y: targetDummyPosition.y },
      nextRoamAt: 1,
      roamMoveUntil: 6000,
    };
    const state = addEntity(
      createTestGameState({
        currentMapId: HUB_MAP_ID,
        map: createDebugMap(HUB_MAP_ID),
      }),
      dummy,
    );

    const nextState = updateEnemyAISystem(state, {
      nowMs: 5000,
      deltaMs: 100,
      deltaSeconds: 0.1,
      frameNumber: 1,
    });
    const nextDummy = nextState.entities[dummy.id] as Enemy;

    expect(nextDummy.position).toEqual(targetDummyPosition);
    expect(nextDummy.state).toBe("idle");
    expect(nextDummy.currentTargetId).toBeNull();
    expect(nextDummy.roamTargetPosition).toBeNull();
    expect(nextDummy.nextRoamAt).toBeUndefined();
    expect(nextDummy.roamMoveUntil).toBeUndefined();
  });

  it("allows player-selected target dummies for party targeting", () => {
    const leader = createCompanion(
      "leader",
      { x: targetDummyPosition.x - 1, y: targetDummyPosition.y },
      "leader",
      "fighter",
    );
    const dummy = createTargetDummy("dummy", targetDummyPosition);
    const state = setLeaderIntent(
      [leader, dummy].reduce(
        addEntity,
        createTestGameState({
          currentMapId: HUB_MAP_ID,
          map: createDebugMap(HUB_MAP_ID),
          partyLeaderId: leader.id,
        }),
      ),
      {
        type: "attack",
        targetId: dummy.id,
        targetPosition: dummy.position,
        source: "player",
      },
    );

    expect(findEnemyTarget(state, leader, 5)?.id).toBe(dummy.id);
  });

  it("does not spawn the old Test Hunter hub NPC", () => {
    expect(hubNpcStartData.map((npc) => npc.displayName)).not.toContain("Test Hunter");
    expect(hubNpcStartData.map((npc) => npc.npcRole)).not.toContain("test_hunter");
  });
});
