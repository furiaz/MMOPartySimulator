import { describe, expect, it } from "vitest";
import {
  createCompanion,
  createDebugMap,
  createEnemy,
  createPendingRoleBonusState,
} from "./index";
import {
  hubCompanionStartPositions,
  HUB_MAP_ID,
  MAP_ONE_ID,
  MAP_TWO_ID,
  npcIds,
  SLIMEWARD_CAMP_ID,
  SLIMEWARD_FLOOR_TWO_EXIT_TELEPORTER_ID,
  SLIMEWARD_FLOOR_TWO_ID,
  slimewardCampArrivalPositions,
} from "./debugMap";
import { addItemToInventoryState } from "./inventory";
import { createInitialQuestStates } from "./questSystem";
import { addEntity, type GameState } from "./state";
import { isTeleportWorking, setTeleportWorking } from "./teleportState";
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

  it("rescues a Slimeward dungeon full wipe to Slimeward Camp", () => {
    const state = setCurrencyBalanceForDebug(
      setTeleportWorking(
        createSlimewardFloorTwoState([createDeadCompanion("leader")], {
          partyLeaderId: "leader",
          slimewardDungeon: {
            chest: {
              status: "available",
              position: { x: 106, y: 20 },
              exitTeleportId: SLIMEWARD_FLOOR_TWO_EXIT_TELEPORTER_ID,
              rolledLoot: [{ itemId: "slime_gel_t1", quantity: 1 }],
              collectedLoot: [],
              pendingLoot: [{ itemId: "slime_gel_t1", quantity: 1 }],
            },
          },
        }),
        SLIMEWARD_FLOOR_TWO_EXIT_TELEPORTER_ID,
        true,
      ),
      "crowns",
      100,
    ).state;

    const nextState = updateGame(state, { nowMs: 1000 });

    expect(nextState.currentMapId).toBe(SLIMEWARD_CAMP_ID);
    expect(nextState.worldWipeRecovery).toMatchObject({
      status: "rescued",
      chargedFee: 5,
      selectedChoice: {
        hubDisplayName: "Slimeward Camp",
        hopDistance: 0,
        rescueActorId: "slimeward-camp-dog",
      },
    });
    expect(nextState.entities.leader).toMatchObject({
      state: "follow",
      position: slimewardCampArrivalPositions[0],
    });
    expect(nextState.entities["slimeward-camp-dog"]).toMatchObject({
      kind: "npc",
    });
    expect(nextState.slimewardDungeon?.chest).toBeNull();
    expect(
      isTeleportWorking(nextState, SLIMEWARD_FLOOR_TWO_EXIT_TELEPORTER_ID),
    ).toBe(false);
    expect(getCurrencyBalance(nextState.wallet, "crowns")).toBe(95);
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
      roleBonus: createPendingRoleBonusState("fighter", 1000),
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
          interruptedPoiTarget: {
            interruptedByEnemyId: "enemy",
            mapId: MAP_ONE_ID,
            leaderIntent: {
              type: "move",
              targetId: null,
              targetPosition: { x: 10, y: 10 },
            },
            globalPoiIntent: null,
            localPoiTarget: null,
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
          skillCooldownsByCompanionId: {
            leader: {
              kick: {
                companionId: "leader",
                skillId: "kick",
                expiresAt: 10000,
              },
            },
          },
          globalCooldownsByCompanionId: {
            leader: {
              companionId: "leader",
              source: "skill",
              skillId: "kick",
              startedAt: 0,
              expiresAt: 2000,
            },
          },
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
          movementFailureMsByEntityId: {
            leader: 250,
          },
          movementFailuresByEntityId: {
            leader: {
              pathFailureReason: "unreachable",
            },
          },
          movementPathRetryAtMsByEntityId: {
            leader: 2000,
          },
          movementPathsByEntityId: {
            leader: {
              targetKey: "10,10",
              waypoints: [{ x: 10, y: 10 }],
            },
          },
          attackSlotCacheByEntityId: {
            leader: {
              attackRange: 1,
              attackSlot: { x: 5, y: 6 },
              createdAtMs: 500,
              mapKey: MAP_ONE_ID,
              targetId: "enemy",
              targetPosition: { x: 6, y: 6 },
              usesPartyPassThrough: false,
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
      roleBonus: {
        activeRole: "fighter",
        pendingRole: null,
        changedAt: null,
        activatesAt: null,
      },
    });
    expect(nextState.activeTeleport).toBeNull();
    expect(nextState.leaderIntent).toBeNull();
    expect(nextState.globalPoiIntent).toBeNull();
    expect(nextState.localPoiTarget).toBeNull();
    expect(nextState.interruptedPoiTarget).toBeNull();
    expect(nextState.combatFeedbackEvents).toEqual([]);
    expect(nextState.skillVisualEvents).toEqual([]);
    expect(nextState.skillCooldownsByCompanionId).toEqual({});
    expect(nextState.globalCooldownsByCompanionId).toEqual({});
    expect(nextState.dropVisualEvents).toEqual([]);
    expect(nextState.moveIntentsByEntityId).toEqual({});
    expect(nextState.movementFailureMsByEntityId).toEqual({});
    expect(nextState.movementFailuresByEntityId).toEqual({});
    expect(nextState.movementPathRetryAtMsByEntityId).toEqual({});
    expect(nextState.movementPathsByEntityId).toEqual({});
    expect(nextState.attackSlotCacheByEntityId).toEqual({});
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

function createSlimewardFloorTwoState(
  entities: GameEntity[],
  overrides: Partial<GameState>,
): GameState {
  return entities.reduce(
    addEntity,
    createTestGameState({
      currentMapId: SLIMEWARD_FLOOR_TWO_ID,
      map: createDebugMap(SLIMEWARD_FLOOR_TWO_ID),
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
