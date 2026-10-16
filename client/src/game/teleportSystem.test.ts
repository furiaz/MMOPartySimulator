import { describe, expect, it } from "vitest";
import {
  createCompanion,
  createDebugMap,
  createPendingRoleBonusState,
} from "./index";
import {
  companionIds,
  HUB_MAP_ID,
  HUB_TWO_MAP_ID,
  HUB_TWO_TO_MAP_FOUR_TELEPORTER_ID,
  MAP_FOUR_ID,
  MAP_FOUR_TO_HUB_TWO_TELEPORTER_ID,
  MAP_ONE_ID,
  MAP_SEVEN_ID,
  MAP_SIX_ID,
  MAP_SIX_TO_MAP_SEVEN_TELEPORTER_ID,
  SLIMEWARD_CAMP_ID,
  SLIMEWARD_FLOOR_ONE_ID,
  SLIMEWARD_FLOOR_ONE_TO_CAMP_TELEPORTER_ID,
  SLIMEWARD_FLOOR_TWO_EXIT_TELEPORTER_ID,
  SLIMEWARD_FLOOR_TWO_ID,
  slimewardCampDungeonEntranceArrivalPositions,
} from "./debugMap";
import {
  createInitialGuildRecruitState,
  recruitGuildCandidate,
} from "./guildRecruit";
import type { GameState } from "./state";
import { createTestGameState } from "./testState";
import { updateTeleportSystem } from "./teleportSystem";
import type { ActiveTeleport } from "./types";

describe("teleport system", () => {
  it("reconstructs the authored Orc Warmaster as a Boss", () => {
    const state = createTeleportReadyState(
      MAP_SIX_ID,
      MAP_SIX_TO_MAP_SEVEN_TELEPORTER_ID,
    );

    const nextState = updateTeleportSystem(state);
    const warmaster = nextState.entities["zone-7-orc-warmaster-01"];

    expect(nextState.currentMapId).toBe(MAP_SEVEN_ID);
    expect(warmaster).toMatchObject({
      kind: "enemy",
      enemyTypeId: "orc_warmaster",
      encounterBand: "boss",
      position: { x: 82, y: 29 },
    });
    expect(
      Object.values(nextState.entities).filter(
        (entity) =>
          entity.kind === "enemy" && entity.enemyTypeId === "orc_warmaster",
      ),
    ).toHaveLength(1);
  });

  it("does not create obsolete hub departure food warnings", () => {
    const nowMs = 12345;
    const state = createHubTeleportReadyState();

    const nextState = updateTeleportSystem(state, new Set(), nowMs);

    expect(nextState.currentMapId).toBe(MAP_ONE_ID);
    expect("hubDepartureFoodWarning" in nextState).toBe(false);
  });

  it("preserves five mixed-id companions in deterministic party order", () => {
    const baseState = createHubTeleportReadyState();
    const teleport = baseState.activeTeleport;

    if (!teleport) {
      throw new Error("Missing active teleport in test state.");
    }

    const companionData = [
      { id: companionIds[3], partyOrder: 3 },
      { id: "guild-recruit-8", partyOrder: 4 },
      { id: companionIds[0], partyOrder: 0 },
      { id: "guild-recruit-2", partyOrder: 2 },
      { id: companionIds[1], partyOrder: 1 },
    ];
    const companions = companionData.map(({ id, partyOrder }) =>
      createCompanion(
        id,
        teleport.position,
        companionIds[0],
        partyOrder === 0 ? "defender" : "fighter",
        partyOrder,
      ),
    );
    const state = {
      ...baseState,
      entities: Object.fromEntries(
        companions.map((companion) => [companion.id, companion]),
      ),
    };

    const nextState = updateTeleportSystem(state, new Set(), 12345);
    const teleportDefinition = baseState.map?.teleports.find(
      (candidate) => candidate.id === teleport.id,
    );
    const orderedCompanions = [...companions].sort(
      (first, second) =>
        first.partyOrder - second.partyOrder || first.id.localeCompare(second.id),
    );
    const arrivalPositions = orderedCompanions.map(
      (companion) => nextState.entities[companion.id]?.position,
    );

    expect(
      companions.every(
        (companion) => nextState.entities[companion.id]?.kind === "companion",
      ),
    ).toBe(true);
    expect(arrivalPositions).toEqual(teleportDefinition?.arrivalPositions);
    expect(
      new Set(arrivalPositions.map((position) => JSON.stringify(position))),
    ).toHaveLength(companions.length);
  });

  it("preserves a production Guild recruit, generated leader, and dead active companion", () => {
    const nowMs = 1_000;
    const baseState = createTeleportReadyState(
      HUB_TWO_MAP_ID,
      HUB_TWO_TO_MAP_FOUR_TELEPORTER_ID,
      {
        highestCharacterLevelEver: 10,
        guildRecruit: createInitialGuildRecruitState(nowMs),
      },
    );
    const recruitment = recruitGuildCandidate(baseState, nowMs);

    expect(recruitment.ok).toBe(true);
    if (!recruitment.ok || !baseState.activeTeleport) {
      return;
    }

    const recruit = recruitment.companion;
    const deadCompanion = {
      ...createCompanion(
        "guild-recruit-dead",
        baseState.activeTeleport.position,
        recruit.id,
        "fighter",
        2,
      ),
      state: "dead" as const,
      health: 0,
    };
    const restingCompanion = createCompanion(
      "guild-recruit-resting",
      { x: 1, y: 1 },
      recruit.id,
      "fighter",
      3,
    );
    const positionedEntities = Object.fromEntries(
      Object.values(recruitment.state.entities).map((entity) => [
        entity.id,
        entity.kind === "companion"
          ? { ...entity, position: baseState.activeTeleport?.position ?? entity.position }
          : entity,
      ]),
    );
    const nextState = updateTeleportSystem(
      {
        ...recruitment.state,
        partyLeaderId: recruit.id,
        entities: {
          ...positionedEntities,
          [deadCompanion.id]: deadCompanion,
        },
        restingCompanionsById: {
          [restingCompanion.id]: restingCompanion,
        },
      },
      new Set(),
      nowMs,
    );

    expect(nextState.currentMapId).toBe(MAP_FOUR_ID);
    expect(nextState.entities[recruit.id]).toMatchObject({
      id: recruit.id,
      characterLevel: recruit.characterLevel,
      characterXp: recruit.characterXp,
      classId: recruit.classId,
      equipment: recruit.equipment,
      currentTargetId: null,
    });
    expect(nextState.partyLeaderId).toBe(recruit.id);
    expect(nextState.entities[deadCompanion.id]).toMatchObject({
      health: 0,
    });
    expect(nextState.entities[restingCompanion.id]).toBeUndefined();
    expect(nextState.restingCompanionsById?.[restingCompanion.id]).toEqual(
      restingCompanion,
    );

    const returnTeleport = nextState.map?.teleports.find(
      (candidate) => candidate.id === MAP_FOUR_TO_HUB_TWO_TELEPORTER_ID,
    );
    if (!returnTeleport) {
      throw new Error("Missing map-4-to-hub-2 teleport in test map.");
    }
    const returnReadyState = {
      ...nextState,
      activeTeleport: {
        id: returnTeleport.id,
        position: returnTeleport.position,
        range: returnTeleport.range,
        sourceMapId: returnTeleport.sourceMapId,
        targetMapId: returnTeleport.targetMapId,
        triggeredBy: "player" as const,
      },
      entities: Object.fromEntries(
        Object.values(nextState.entities).map((entity) => [
          entity.id,
          entity.kind === "companion" && entity.health > 0
            ? { ...entity, position: returnTeleport.position }
            : entity,
        ]),
      ),
    };

    const returnedState = updateTeleportSystem(
      returnReadyState,
      new Set(),
      nowMs + 1,
    );

    expect(returnedState.currentMapId).toBe(HUB_TWO_MAP_ID);
    expect(returnedState.entities[recruit.id]).toMatchObject({
      id: recruit.id,
      characterLevel: recruit.characterLevel,
      equipment: recruit.equipment,
    });
    expect(returnedState.entities[deadCompanion.id]).toMatchObject({ health: 0 });
    expect(returnedState.entities[restingCompanion.id]).toBeUndefined();
  });

  it("clears transient movement runtime after teleport completion", () => {
    const state = createHubTeleportReadyState({
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
          targetKey: "teleport:hub-to-map-1",
          waypoints: [{ x: 12, y: 12 }],
        },
      },
      attackSlotCacheByEntityId: {
        leader: {
          attackRange: 1,
          attackSlot: { x: 11, y: 12 },
          createdAtMs: 100,
          mapKey: HUB_MAP_ID,
          targetId: "enemy",
          targetPosition: { x: 12, y: 12 },
          usesPartyPassThrough: false,
        },
      },
    });

    const nextState = updateTeleportSystem(state, new Set(), 12345);

    expect(nextState.currentMapId).toBe(MAP_ONE_ID);
    expect(nextState.movementFailureMsByEntityId).toEqual({});
    expect(nextState.movementFailuresByEntityId).toEqual({});
    expect(nextState.movementPathRetryAtMsByEntityId).toEqual({});
    expect(nextState.movementPathsByEntityId).toEqual({});
    expect(nextState.attackSlotCacheByEntityId).toEqual({});
  });

  it("immediately assigns current role bonuses after teleport completion", () => {
    const state = createHubTeleportReadyState();
    const companionId = companionIds[0];
    const leader = state.entities[companionId];

    if (leader?.kind !== "companion") {
      throw new Error("Missing companion leader in teleport test state.");
    }

    const nextState = updateTeleportSystem(
      {
        ...state,
        entities: {
          ...state.entities,
          [companionId]: {
            ...leader,
            roleBonus: createPendingRoleBonusState("fighter", 1000),
          },
        },
      },
      new Set(),
      2000,
    );

    expect(nextState.entities[companionId]).toMatchObject({
      roleBonus: {
        activeRole: "fighter",
        pendingRole: null,
        changedAt: null,
        activatesAt: null,
      },
    });
  });

  it.each([
    {
      sourceMapId: SLIMEWARD_FLOOR_ONE_ID,
      teleportId: SLIMEWARD_FLOOR_ONE_TO_CAMP_TELEPORTER_ID,
    },
    {
      sourceMapId: SLIMEWARD_FLOOR_TWO_ID,
      teleportId: SLIMEWARD_FLOOR_TWO_EXIT_TELEPORTER_ID,
    },
  ])(
    "places companions at the Slimeward Camp dungeon entrance after $teleportId",
    ({ sourceMapId, teleportId }) => {
      const state = createTeleportReadyState(sourceMapId, teleportId);

      const nextState = updateTeleportSystem(state, new Set(), 12345);

      expect(nextState.currentMapId).toBe(SLIMEWARD_CAMP_ID);
      expect(nextState.entities[companionIds[0]]?.position).toEqual(
        slimewardCampDungeonEntranceArrivalPositions[0],
      );
    },
  );
});

function createHubTeleportReadyState(overrides: Partial<GameState> = {}) {
  const map = createDebugMap(HUB_MAP_ID);
  const teleport = map.teleports.find((candidate) => candidate.id === "hub-to-map-1");
  const companionId = companionIds[0];

  if (!teleport) {
    throw new Error("Missing hub-to-map-1 teleport in test map.");
  }

  const baseLeader = createCompanion(
    companionId,
    teleport.position,
    companionId,
    "fighter",
    0,
  );

  return createTestGameState({
    currentMapId: HUB_MAP_ID,
    map,
    entities: {
      [baseLeader.id]: baseLeader,
    },
    partyLeaderId: baseLeader.id,
    activeTeleport: {
      id: teleport.id,
      position: teleport.position,
      range: teleport.range,
      sourceMapId: teleport.sourceMapId,
      targetMapId: teleport.targetMapId,
      triggeredBy: "player",
    } satisfies ActiveTeleport,
    ...overrides,
  });
}

function createTeleportReadyState(
  sourceMapId: Parameters<typeof createDebugMap>[0],
  teleportId: string,
  overrides: Partial<GameState> = {},
) {
  const map = createDebugMap(sourceMapId);
  const teleport = map.teleports.find((candidate) => candidate.id === teleportId);
  const companionId = companionIds[0];

  if (!teleport) {
    throw new Error(`Missing ${teleportId} teleport in test map.`);
  }

  const leader = createCompanion(
    companionId,
    teleport.position,
    companionId,
    "fighter",
    0,
  );

  return createTestGameState({
    currentMapId: sourceMapId,
    map,
    entities: {
      [leader.id]: leader,
    },
    partyLeaderId: leader.id,
    activeTeleport: {
      id: teleport.id,
      position: teleport.position,
      range: teleport.range,
      sourceMapId: teleport.sourceMapId,
      targetMapId: teleport.targetMapId,
      triggeredBy: "player",
    } satisfies ActiveTeleport,
    ...overrides,
  });
}
