import { describe, expect, it } from "vitest";
import { createCompanion, createDebugMap, createEnemy } from "./index";
import {
  hubCompanionStartPositions,
  HUB_MAP_ID,
  MAP_ONE_ID,
  MAP_TWO_ID,
  npcIds,
} from "./debugMap";
import { addItemToInventoryState } from "./inventory";
import { createInitialQuestStates } from "./questSystem";
import { addEntity, type GameState } from "./state";
import { createTestGameState } from "./testState";
import { updateGame } from "./updateGame";
import type { ActiveTeleport, GameEntity } from "./types";
import { getCurrencyBalance, setCurrencyBalanceForDebug } from "./wallet";
import {
  resolveWorldWipeRecoveryChoice,
  updateWorldWipeRecovery,
  type RescueHubDefinition,
} from "./worldWipeRecovery";

describe("world wipe recovery", () => {
  it("does not trigger in the hub", () => {
    const state = createHubState([createDeadCompanion("leader")], {
      partyLeaderId: "leader",
    });

    const nextState = updateGame(state, { nowMs: 1000 });

    expect(nextState.currentMapId).toBe(HUB_MAP_ID);
    expect(nextState.worldWipeRecovery).toBeUndefined();
    expect(nextState.entities.leader).toMatchObject({
      state: "dead",
      health: 0,
    });
  });

  it("rescues a map-1 full wipe to the hub", () => {
    const state = setCurrencyBalanceForDebug(
      createMapOneState([createDeadCompanion("leader")], {
        partyLeaderId: "leader",
      }),
      "crowns",
      100,
    ).state;

    const nextState = updateGame(state, { nowMs: 1000 });

    expect(nextState.currentMapId).toBe(HUB_MAP_ID);
    expect(nextState.worldWipeRecovery).toMatchObject({
      status: "rescued",
      chargedFee: 15,
      selectedChoice: {
        hubDisplayName: "Harbor Union Bastion",
        hopDistance: 1,
        rescueActorId: "hub-dog",
        rescueLine: "Careful now!",
      },
    });
    expect(getCurrencyBalance(nextState.wallet, "crowns")).toBe(85);
    expect(nextState.entities.leader).toMatchObject({
      state: "follow",
      position: hubCompanionStartPositions[0],
    });
    expect(nextState.entities.leader).toMatchObject({
      health: nextState.entities.leader?.kind === "companion"
        ? nextState.entities.leader.maxHealth
        : undefined,
    });
  });

  it("charges a higher route-hop fee from map-2", () => {
    const state = setCurrencyBalanceForDebug(
      createMapTwoState([createDeadCompanion("leader")], {
        partyLeaderId: "leader",
      }),
      "crowns",
      100,
    ).state;

    const nextState = updateGame(state, { nowMs: 1000 });

    expect(nextState.worldWipeRecovery).toMatchObject({
      status: "rescued",
      chargedFee: 25,
      selectedChoice: {
        hopDistance: 2,
      },
    });
    expect(getCurrencyBalance(nextState.wallet, "crowns")).toBe(75);
  });

  it("does not trigger when any party member is still alive", () => {
    const state = createMapOneState(
      [
        createDeadCompanion("leader"),
        createCompanion("living-companion", { x: 4, y: 4 }, "leader"),
      ],
      {
        partyLeaderId: "leader",
      },
    );

    const nextState = updateGame(state, { nowMs: 1000 });

    expect(nextState.currentMapId).toBe(MAP_ONE_ID);
    expect(nextState.worldWipeRecovery).toBeUndefined();
  });

  it("charges only once for a recovered wipe", () => {
    const state = setCurrencyBalanceForDebug(
      createMapOneState([createDeadCompanion("leader")], {
        partyLeaderId: "leader",
      }),
      "crowns",
      100,
    ).state;

    const recoveredState = updateGame(state, { nowMs: 1000 });
    const nextState = updateGame(recoveredState, { nowMs: 1100 });

    expect(getCurrencyBalance(nextState.wallet, "crowns")).toBe(85);
    expect(nextState.worldWipeRecovery).toMatchObject({
      status: "rescued",
      chargedFee: 15,
    });
  });

  it("charges available Crowns and still rescues when the full fee is unaffordable", () => {
    const state = setCurrencyBalanceForDebug(
      createMapOneState([createDeadCompanion("leader")], {
        partyLeaderId: "leader",
      }),
      "crowns",
      7,
    ).state;

    const nextState = updateGame(state, { nowMs: 1000 });

    expect(nextState.currentMapId).toBe(HUB_MAP_ID);
    expect(nextState.worldWipeRecovery).toMatchObject({
      status: "rescued",
      chargedFee: 7,
    });
    expect(getCurrencyBalance(nextState.wallet, "crowns")).toBe(0);
  });

  it("clears wild-map chaos while preserving party progress and inventory", () => {
    const leader = {
      ...createDeadCompanion("leader"),
      characterLevel: 12,
      characterXp: 34,
      role: "fighter" as const,
      commandPriority: "direct" as const,
      currentTargetId: "enemy",
      defendPosition: { x: 5, y: 5 },
    };
    const stateWithItem = addItemToInventoryState(
      createMapOneState(
        [leader, createEnemy("enemy", { x: 6, y: 6 })],
        {
          partyLeaderId: "leader",
          activeTeleport: {
            id: "map-1-to-hub",
            position: { x: 5, y: 41 },
            range: 10,
            sourceMapId: MAP_ONE_ID,
            targetMapId: HUB_MAP_ID,
            triggeredBy: "player",
          } satisfies ActiveTeleport,
          leaderIntent: {
            type: "attack",
            targetId: "enemy",
            targetPosition: null,
          },
          globalPoiIntent: { type: "idle", reason: "test" },
          localPoiTarget: {
            poiId: "enemy",
            category: "combat",
            mapId: MAP_ONE_ID,
            position: { x: 6, y: 6 },
            targetEntityId: "enemy",
            reason: "test",
          },
          combatFeedbackEvents: [
            {
              id: "feedback",
              type: "damage",
              entityId: "leader",
              text: "1",
              createdAt: 0,
              expiresAt: 10000,
            },
          ],
          skillVisualEvents: [
            {
              id: "skill",
              type: "slash",
              sourceId: "leader",
              createdAt: 0,
              expiresAt: 10000,
            },
          ],
          dropVisualEvents: [
            {
              id: "drop",
              enemyId: "enemy",
              itemId: "wolf_pelt",
              quantity: 1,
              position: { x: 6, y: 6 },
              createdAt: 0,
              expiresAt: 10000,
              tableId: "test",
              dropChance: 1,
            },
          ],
          moveIntentsByEntityId: {
            leader: { x: 10, y: 10 },
          },
          movementPathsByEntityId: {
            leader: {
              targetKey: "10,10",
              waypoints: [{ x: 10, y: 10 }],
            },
          },
        },
      ),
      "training_sword",
      1,
      "debug",
    ).state;

    const nextState = updateGame(stateWithItem, { nowMs: 1000 });
    const rescuedLeader = nextState.entities.leader;

    expect(nextState.currentMapId).toBe(HUB_MAP_ID);
    expect(nextState.entities.enemy).toBeUndefined();
    expect(nextState.inventory).toEqual(stateWithItem.inventory);
    expect(rescuedLeader).toMatchObject({
      kind: "companion",
      characterLevel: 12,
      characterXp: 34,
      role: "fighter",
      state: "follow",
      commandPriority: "autonomous",
      currentTargetId: null,
      defendPosition: null,
    });
    expect(nextState.activeTeleport).toBeNull();
    expect(nextState.leaderIntent).toBeNull();
    expect(nextState.globalPoiIntent).toBeNull();
    expect(nextState.localPoiTarget).toBeNull();
    expect(nextState.combatFeedbackEvents).toEqual([]);
    expect(nextState.skillVisualEvents).toEqual([]);
    expect(nextState.dropVisualEvents).toEqual([]);
    expect(nextState.moveIntentsByEntityId).toEqual({});
    expect(nextState.movementPathsByEntityId).toEqual({});
  });

  it("creates a pending choice when closest unlocked rescue hubs tie", () => {
    const state = createMapOneState([createDeadCompanion("leader")], {
      partyLeaderId: "leader",
    });

    const nextState = updateWorldWipeRecovery(state, 1000, {
      rescueHubs: createTieRescueHubs(),
    });

    expect(nextState.currentMapId).toBe(MAP_ONE_ID);
    expect(nextState.worldWipeRecovery).toMatchObject({
      status: "pending_choice",
      choices: [
        expect.objectContaining({ hubId: "first-hub", fee: 15 }),
        expect.objectContaining({ hubId: "second-hub", fee: 15 }),
      ],
    });
  });

  it("resolves a selected rescue hub choice", () => {
    const state = setCurrencyBalanceForDebug(
      createMapOneState([createDeadCompanion("leader")], {
        partyLeaderId: "leader",
      }),
      "crowns",
      30,
    ).state;
    const pendingState = updateWorldWipeRecovery(state, 1000, {
      rescueHubs: createTieRescueHubs(),
    });

    const nextState = resolveWorldWipeRecoveryChoice(
      pendingState,
      "second-hub",
      1200,
    );

    expect(nextState.currentMapId).toBe(HUB_MAP_ID);
    expect(nextState.worldWipeRecovery).toMatchObject({
      status: "rescued",
      chargedFee: 15,
      selectedChoice: {
        hubId: "second-hub",
        hubDisplayName: "Second Test Hub",
      },
    });
    expect(getCurrencyBalance(nextState.wallet, "crowns")).toBe(15);
    expect(nextState.entities.leader).toMatchObject({
      position: { x: 9, y: 20 },
    });
    expect(nextState.entities.leader).toMatchObject({
      health: nextState.entities.leader?.kind === "companion"
        ? nextState.entities.leader.maxHealth
        : undefined,
    });
  });
});

function createDeadCompanion(id: string) {
  return {
    ...createCompanion(id, { x: 3, y: 3 }, id, "fighter", 0),
    state: "dead" as const,
    health: 0,
    currentTargetId: null,
  };
}

function createMapOneState(
  entities: GameEntity[],
  overrides: Partial<GameState>,
): GameState {
  return entities.reduce(
    addEntity,
    createTestGameState({
      currentMapId: MAP_ONE_ID,
      map: createDebugMap(MAP_ONE_ID),
      activeTeleport: null,
      quests: createInitialQuestStates(),
      ...overrides,
    }),
  );
}

function createMapTwoState(
  entities: GameEntity[],
  overrides: Partial<GameState>,
): GameState {
  return entities.reduce(
    addEntity,
    createTestGameState({
      currentMapId: MAP_TWO_ID,
      map: createDebugMap(MAP_TWO_ID),
      activeTeleport: null,
      quests: createInitialQuestStates(),
      ...overrides,
    }),
  );
}

function createHubState(
  entities: GameEntity[],
  overrides: Partial<GameState>,
): GameState {
  return entities.reduce(
    addEntity,
    createTestGameState({
      currentMapId: HUB_MAP_ID,
      map: createDebugMap(HUB_MAP_ID),
      activeTeleport: null,
      quests: createInitialQuestStates(),
      ...overrides,
    }),
  );
}

function createTieRescueHubs(): RescueHubDefinition[] {
  return [
    {
      id: "first-hub",
      mapId: HUB_MAP_ID,
      displayName: "First Test Hub",
      rescueActorId: npcIds[3],
      rescueActorName: "Dog",
      rescueLine: "Careful now!",
      isUnlocked: true,
      arrivalPositions: hubCompanionStartPositions,
    },
    {
      id: "second-hub",
      mapId: HUB_MAP_ID,
      displayName: "Second Test Hub",
      rescueActorId: npcIds[3],
      rescueActorName: "Dog",
      rescueLine: "Careful now!",
      isUnlocked: true,
      arrivalPositions: [
        { x: 9, y: 20 },
        { x: 10, y: 20 },
      ],
    },
  ];
}
