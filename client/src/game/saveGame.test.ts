import { describe, expect, it } from "vitest";
import {
  createDebugMap,
  HUB_TWO_MAP_ID,
  MAP_ONE_ID,
  SLIMEWARD_FLOOR_ONE_ID,
} from "./debugMap";
import { createDebugTelemetryState } from "./debugTelemetry";
import { createCompanion, createResource } from "./entities";
import { addItemToInventoryState } from "./inventory";
import {
  applyOfflineFarmingProgress,
  createSavedGame,
  MAX_OFFLINE_FARMING_MS,
  restoreGameStateFromSave,
  sanitizeGameStateForSave,
  validateSavedGame,
} from "./saveGame";
import type { GameState } from "./state";
import { createTestGameState } from "./testState";
import type { Companion, GameEntity, PartyMemberRole } from "./types";

const NOW_MS = 1_000_000;

describe("save game serialization", () => {
  it("validates v1 saves and rejects malformed saves", () => {
    const state = createWildState("fighter");
    const save = createSavedGame(state, NOW_MS);

    expect(validateSavedGame(save).ok).toBe(true);
    expect(validateSavedGame({ ...save, saveVersion: 999 }).ok).toBe(false);
    expect(validateSavedGame({ ...save, state: { ...save.state, entities: null } }).ok).toBe(false);
  });

  it("restores deterministic map data and clears transient runtime state", () => {
    const state = createWildState("fighter");
    const save = createSavedGame(
      {
        ...state,
        activeTeleport: {
          id: "test",
          position: { x: 1, y: 1 },
          range: 2,
          sourceMapId: MAP_ONE_ID,
          targetMapId: "map-2",
          triggeredBy: "player",
        },
        combatFeedbackEvents: [
          {
            id: "feedback",
            type: "damage",
            entityId: "companion-1",
            text: "1",
            createdAt: NOW_MS,
            expiresAt: NOW_MS + 1000,
          },
        ],
        movementPathsByEntityId: {
          "companion-1": {
            targetKey: "1,1",
            waypoints: [{ x: 1, y: 1 }],
          },
        },
        companionAoeChannelsByCasterId: {
          "companion-1": {
            id: "shockwave",
            abilityId: "shield_shockwave",
            casterId: "companion-1",
            shape: {
              type: "circle",
              center: { x: 14, y: 29 },
              radius: 2,
            },
            visualIntent: "partyOffensive",
            damageType: "physical",
            powerMultiplier: 0.5,
            bindDurationMs: 1000,
            startedAt: NOW_MS,
            channelEndsAt: NOW_MS + 200,
          },
        },
        debugTelemetry: {
          ...createDebugTelemetryState(),
          isRecording: true,
          startedAt: NOW_MS,
        },
      },
      NOW_MS,
    );

    const restored = restoreGameStateFromSave(save);

    expect(save.offlineFarmingBlockedReason).toContain("active travel");
    expect(restored.ok).toBe(true);
    if (!restored.ok) {
      return;
    }

    expect(restored.state.map?.id).toBe(MAP_ONE_ID);
    expect(restored.state.activeTeleport).toBeNull();
    expect(restored.state.combatFeedbackEvents).toEqual([]);
    expect(restored.state.movementPathsByEntityId).toEqual({});
    expect(restored.state.companionAoeChannelsByCasterId).toEqual({});
    expect(restored.state.debugTelemetry).toBeUndefined();
  });

  it("keeps persistent party, inventory, wallet, quests, map, and resources", () => {
    let state = createWildState("fighter");
    state = addItemToInventoryState(state, "softwood", 2, "debug").state;

    const save = createSavedGame(state, NOW_MS);

    expect(save.state.currentMapId).toBe(MAP_ONE_ID);
    expect(save.state.entities["companion-1"]).toMatchObject({
      kind: "companion",
      role: "defender",
      characterLevel: 1,
    });
    expect(save.state.inventory.slots.some((slot) => slot.itemId === "softwood")).toBe(true);
    expect(save.state.wallet).toEqual(state.wallet);
    expect(save.state.quests).toEqual(state.quests);
    expect(
      Object.values(save.state.entities).some(
        (entity) => entity.kind === "resource" && entity.resourceType === "wood",
      ),
    ).toBe(true);
  });

  it("restores Forward Bastion saves with deterministic map data", () => {
    const state = sanitizeGameStateForSave({
      ...createTestGameState(),
      currentMapId: HUB_TWO_MAP_ID,
      map: createDebugMap(HUB_TWO_MAP_ID),
    });
    const save = createSavedGame(state, NOW_MS);

    const restored = restoreGameStateFromSave(save);

    expect(restored.ok).toBe(true);
    if (!restored.ok) {
      return;
    }

    expect(restored.state.currentMapId).toBe(HUB_TWO_MAP_ID);
    expect(restored.state.map?.id).toBe(HUB_TWO_MAP_ID);
    expect(restored.state.map?.displayName).toBe("Forward Bastion");
  });
});

describe("offline farming", () => {
  it("caps offline progress at thirty minutes", () => {
    const state = createWildState("fighter");
    const result = applyOfflineFarmingProgress(
      state,
      NOW_MS - MAX_OFFLINE_FARMING_MS * 10,
      NOW_MS,
    );

    expect(result.summary.creditedMs).toBe(MAX_OFFLINE_FARMING_MS);
    expect(result.summary.enemyKills).toBe(255);
  });

  it("skips hub, dungeon, transition, recovery, chest, invalid, and defeated states", () => {
    const hub = createTestGameState();
    expect(getSkipReason(hub)).toContain("wild zones");

    const dungeon = {
      ...hub,
      currentMapId: SLIMEWARD_FLOOR_ONE_ID,
      map: createDebugMap(SLIMEWARD_FLOOR_ONE_ID),
    };
    expect(getSkipReason(dungeon)).toContain("wild zones");

    const transition = {
      ...createWildState("fighter"),
      activeTeleport: {
        id: "test",
        position: { x: 1, y: 1 },
        range: 2,
        sourceMapId: MAP_ONE_ID,
        targetMapId: "map-2" as const,
        triggeredBy: "player" as const,
      },
    };
    expect(getSkipReason(transition)).toContain("paused");

    const recovery = {
      ...createWildState("fighter"),
      resurrectionChannelsByHelperId: {
        "companion-1": { helperId: "companion-1", targetId: "companion-2" },
      },
    };
    expect(getSkipReason(recovery)).toContain("paused");

    const chest = {
      ...createWildState("fighter"),
      slimewardDungeon: {
        chest: {
          id: "chest",
          exitTeleportId: "exit",
          status: "opened" as const,
          position: { x: 1, y: 1 },
          isUiOpen: true,
          rolledLoot: [],
          collectedLoot: [],
          pendingLoot: [],
          inventoryFull: false,
        },
      },
    };
    expect(getSkipReason(chest)).toContain("paused");

    const defeated = {
      ...createWildState("fighter"),
      entities: Object.fromEntries(
        (Object.entries(createWildState("fighter").entities) as [string, GameEntity][]).map(([id, entity]) => [
          id,
          entity.kind === "companion" ? { ...entity, state: "dead" } : entity,
        ]),
      ),
    } as GameState;
    expect(getSkipReason(defeated)).toContain("leader");
  });

  it("uses roles so Defender plus Fighter earns more kills and Defender plus Gatherer earns more resources", () => {
    const fighterResult = applyOfflineFarmingProgress(
      createWildState("fighter"),
      NOW_MS - MAX_OFFLINE_FARMING_MS,
      NOW_MS,
    );
    const gathererResult = applyOfflineFarmingProgress(
      createWildState("gatherer"),
      NOW_MS - MAX_OFFLINE_FARMING_MS,
      NOW_MS,
    );

    expect(fighterResult.summary.enemyKills).toBeGreaterThan(
      gathererResult.summary.enemyKills,
    );
    expect(totalResources(fighterResult.summary.resourcesAdded)).toBeLessThan(
      totalResources(gathererResult.summary.resourcesAdded),
    );
  });

  it("stops offline resource gains when inventory is full without blocking XP", () => {
    let state = createWildState("gatherer");

    for (let index = 0; index < state.inventory.capacity; index += 1) {
      state = addItemToInventoryState(state, "training_sword", 1, "debug").state;
    }

    const result = applyOfflineFarmingProgress(
      state,
      NOW_MS - MAX_OFFLINE_FARMING_MS,
      NOW_MS,
    );

    expect(result.summary.enemyKills).toBeGreaterThan(0);
    expect(result.summary.xpGranted).toBeGreaterThan(0);
    expect(result.summary.resourcesAdded).toEqual([]);
  });
});

function createWildState(secondRole: PartyMemberRole): GameState {
  const map = createDebugMap(MAP_ONE_ID);
  const leader: Companion = {
    ...createCompanion("companion-1", { x: 14, y: 29 }, "companion-1", "defender", 0),
    state: "idle",
    currentTargetId: null,
  };
  const second: Companion = {
    ...createCompanion("companion-2", { x: 16, y: 29 }, "companion-1", secondRole, 1),
    state: "follow",
    currentTargetId: "companion-1",
  };
  const baseState = createTestGameState();
  const resourceEntities = Object.fromEntries(
    map.subzones
      ?.flatMap((subzone) => subzone.resourceLocations ?? [])
      .map((resourceLocation) => [
        resourceLocation.id,
        createResource(resourceLocation.id, resourceLocation.position, {
          resourceType: resourceLocation.resourceType,
          tier: resourceLocation.tier ?? 1,
        }),
      ]) ?? [],
  );

  return sanitizeGameStateForSave({
    ...baseState,
    entities: {
      "companion-1": leader,
      "companion-2": second,
      ...resourceEntities,
    },
    currentMapId: MAP_ONE_ID,
    map,
    partyLeaderId: leader.id,
  });
}

function getSkipReason(state: GameState): string {
  return applyOfflineFarmingProgress(state, NOW_MS - MAX_OFFLINE_FARMING_MS, NOW_MS)
    .summary.skippedReason ?? "";
}

function totalResources(resources: { quantity: number }[]): number {
  return resources.reduce((total, resource) => total + resource.quantity, 0);
}
