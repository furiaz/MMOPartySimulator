import { describe, expect, it } from "vitest";
import {
  HUB_MAP_ID,
  aoeTargetDummyId,
  companionIds,
  hubCompanionStartPositions,
  hubNpcStartData,
  targetDummyId,
} from "./debugMap";
import { createInitialGameState } from "./createInitialGameState";
import type { Companion } from "./types";

describe("createInitialGameState", () => {
  it("starts on the hub map with the expected leader and second companion", () => {
    const state = createInitialGameState();
    const leader = state.entities[companionIds[0]] as Companion;
    const secondCompanion = state.entities[companionIds[1]] as Companion;

    expect(state.currentMapId).toBe(HUB_MAP_ID);
    expect(state.map?.id).toBe(HUB_MAP_ID);
    expect(state.partyLeaderId).toBe(leader.id);
    expect(leader).toMatchObject({
      kind: "companion",
      role: "defender",
      partyOrder: 0,
      followTargetId: companionIds[0],
      state: "idle",
      currentTargetId: null,
      position: hubCompanionStartPositions[0],
    });
    expect(secondCompanion).toMatchObject({
      kind: "companion",
      role: "fighter",
      partyOrder: 1,
      followTargetId: companionIds[0],
      state: "idle",
      currentTargetId: null,
      position: hubCompanionStartPositions[1],
    });
  });

  it("creates hub NPCs and both target dummies", () => {
    const state = createInitialGameState();

    for (const npc of hubNpcStartData) {
      expect(state.entities[npc.id]).toMatchObject({
        kind: "npc",
        displayName: npc.displayName,
        npcRole: npc.npcRole,
        position: npc.position,
      });
    }

    expect(state.entities[targetDummyId]).toMatchObject({
      kind: "enemy",
      isTargetDummy: true,
      combatBodyRadius: 0.7,
    });
    expect(state.entities[aoeTargetDummyId]).toMatchObject({
      kind: "enemy",
      isTargetDummy: true,
      combatBodyRadius: 0.7,
    });
  });

  it("initializes runtime, intent, quest, inventory, and explored tile defaults", () => {
    const state = createInitialGameState();
    const leader = state.entities[companionIds[0]] as Companion;

    expect(state.activeTeleport).toBeNull();
    expect(state.teleportStatesById).toEqual({});
    expect(state.autoModeEnabled).toBe(false);
    expect(state.worldTravelTargetMapId).toBeNull();
    expect(state.poiPreferences).toEqual({
      stayInMap: false,
      searchScope: "free_travel",
    });
    expect(state.partyIntent).toBeNull();
    expect(state.leaderIntent).toBeNull();
    expect(state.globalPoiIntent).toBeNull();
    expect(state.localPoiTarget).toBeNull();
    expect(state.lastPoiDecision).toBeUndefined();
    expect(Object.keys(state.followTrailsByEntityId).sort()).toEqual(
      Object.keys(state.entities).sort(),
    );
    expect(Object.values(state.followTrailsByEntityId).every(
      (trail) => trail.length === 0,
    )).toBe(true);
    expect(state.combatFeedbackEvents).toEqual([]);
    expect(state.skillMarksByEnemyId).toEqual({});
    expect(state.skillSelfBuffsByCompanionId).toEqual({});
    expect(state.skillBindsByEnemyId).toEqual({});
    expect(state.skillShieldBlocksById).toEqual({});
    expect(state.skillCooldownsByCompanionId).toEqual({});
    expect(state.skillVisualEvents).toEqual([]);
    expect(state.dropVisualEvents).toEqual([]);
    expect(state.exploredTiles).toEqual({
      [`${leader.position.x},${leader.position.y}`]: true,
    });
    expect(Object.keys(state.quests).length).toBeGreaterThan(0);
    expect(state.inventory.slots).toEqual([
      { itemId: "training_sword", quantity: 1 },
    ]);
    expect(state.wallet.balancesByCurrencyId).toEqual({ crowns: 0 });
  });

  it("returns independent state objects across calls", () => {
    const first = createInitialGameState();
    const second = createInitialGameState();

    expect(first).not.toBe(second);
    expect(first.entities).not.toBe(second.entities);
    expect(first.inventory).not.toBe(second.inventory);
    expect(first.wallet).not.toBe(second.wallet);
    expect(first.quests).not.toBe(second.quests);
    expect(first.entities[companionIds[0]]).not.toBe(
      second.entities[companionIds[0]],
    );
  });
});
