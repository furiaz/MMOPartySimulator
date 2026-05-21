import { describe, expect, it } from "vitest";
import {
  addHubDepartureFoodWarningIfNeeded,
  assignFoodToCompanion,
  equipFlaskToCompanion,
  FLASK_RECHARGE_KILLS_PER_CHARGE,
  getHubDepartureFoodWarningCompanionIds,
  startPartyConsumableUse,
  updateCompanionConsumableBehavior,
  updateConsumableBehaviorSystem,
  updateConsumableSystem,
  updateFlaskRechargeFromEnemyKills,
} from "./consumables";
import { createCompanion, createEnemy } from "./entities";
import { updateHealingFountainSystem } from "./healingFountainSystem";
import { getCompanionDerivedStats } from "./stats";
import { syncPartyDerivedMaxHealth } from "./healthSystem";
import { addItemToInventoryState, countInventoryItem } from "./inventory";
import { updateEntity, type GameState } from "./state";
import { createTestGameState } from "./testState";
import type { Companion, ConsumableItemId, Enemy } from "./types";

function createConsumableState(
  itemIds: ConsumableItemId[],
  characterLevel = 5,
  maxHealth = 100,
): { state: GameState; companion: Companion } {
  const baseCompanion = {
    ...createCompanion(
      "companion-1",
      { x: 0, y: 0 },
      "companion-1",
      "fighter",
      0,
    ),
    characterLevel,
  };
  const companion = {
    ...baseCompanion,
    health: 10,
    maxHealth,
    state: "idle" as const,
  };
  const state = itemIds.reduce(
    (nextState, itemId) =>
      addItemToInventoryState(nextState, itemId, 1, "debug").state,
    createTestGameState({
      currentMapId: "hub",
      entities: { [companion.id]: companion },
      partyLeaderId: companion.id,
      followTrailsByEntityId: { [companion.id]: [] },
    }),
  );

  return { state, companion };
}

function setEquippedFlaskCharges(
  state: GameState,
  companionId: string,
  charges: number,
): GameState {
  const companion = state.entities[companionId] as Companion;

  return updateEntity(state, {
    ...companion,
    consumables: {
      ...companion.consumables,
      flask: companion.consumables.flask
        ? {
            ...companion.consumables.flask,
            charges,
          }
        : null,
    },
  });
}

function createDeadEnemy(id: string, defeatedAtMs?: number): Enemy {
  return {
    ...createEnemy(id, { x: 5, y: 5 }),
    state: "dead",
    health: 0,
    defeatedAtMs,
  };
}

function addDeadEnemies(state: GameState, count: number): GameState {
  const enemies = Object.fromEntries(
    Array.from({ length: count }, (_, index) => {
      const id = `enemy-${index + 1}`;

      return [id, createDeadEnemy(id, 1000 + index)];
    }),
  );

  return {
    ...state,
    currentMapId: "map-1",
    entities: {
      ...state.entities,
      ...enemies,
    },
  };
}

describe("prototype consumables", () => {
  it("equips a flask from inventory with zero equipped charges", () => {
    const { state, companion } = createConsumableState(["minor_recovery_flask"]);
    const equipped = equipFlaskToCompanion(
      state,
      companion.id,
      "minor_recovery_flask",
    );
    const nextCompanion = equipped.state.entities[companion.id] as Companion;

    expect(equipped.result.status).toBe("success");
    expect(nextCompanion.consumables.flask).toMatchObject({
      itemId: "minor_recovery_flask",
      charges: 0,
    });
    expect(countInventoryItem(equipped.state.inventory, "minor_recovery_flask")).toBe(0);
  });

  it("applies flask healing and charge spend only on completion", () => {
    const { state, companion } = createConsumableState(["minor_recovery_flask"]);
    const equipped = equipFlaskToCompanion(
      state,
      companion.id,
      "minor_recovery_flask",
    ).state;
    const charged = setEquippedFlaskCharges(equipped, companion.id, 1);
    const started = startPartyConsumableUse(charged, "flask", 1000);
    const beforeCompletion = updateConsumableSystem(started, 2500);
    const completed = updateConsumableSystem(beforeCompletion, 3000);
    const beforeCompanion = beforeCompletion.entities[companion.id] as Companion;
    const completedCompanion = completed.entities[companion.id] as Companion;

    expect(beforeCompanion.health).toBe(10);
    expect(beforeCompanion.consumables.flask?.charges).toBe(1);
    expect(completedCompanion.health).toBe(60);
    expect(completedCompanion.consumables.flask?.charges).toBe(0);
  });

  it("does not interrupt flask use when damage is taken", () => {
    const { state, companion } = createConsumableState(["minor_recovery_flask"]);
    const equipped = equipFlaskToCompanion(
      state,
      companion.id,
      "minor_recovery_flask",
    ).state;
    const started = startPartyConsumableUse(
      setEquippedFlaskCharges(equipped, companion.id, 1),
      "flask",
      1000,
    );
    const damagedCompanion = {
      ...(started.entities[companion.id] as Companion),
      health: 5,
    };
    const damaged = updateEntity(started, damagedCompanion);
    const completed = updateConsumableSystem(damaged, 3000);
    const completedCompanion = completed.entities[companion.id] as Companion;

    expect(completedCompanion.health).toBe(55);
    expect(completedCompanion.consumables.flask?.charges).toBe(0);
  });

  it("cancels flask use on death without spending charges", () => {
    const { state, companion } = createConsumableState(["minor_recovery_flask"]);
    const equipped = equipFlaskToCompanion(
      state,
      companion.id,
      "minor_recovery_flask",
    ).state;
    const started = startPartyConsumableUse(
      setEquippedFlaskCharges(equipped, companion.id, 1),
      "flask",
      1000,
    );
    const killed = updateEntity(started, {
      ...(started.entities[companion.id] as Companion),
      state: "dead",
      health: 0,
    });
    const completed = updateConsumableSystem(killed, 3000);
    const completedCompanion = completed.entities[companion.id] as Companion;

    expect(completed.consumableUsesByCompanionId).toBeUndefined();
    expect(completedCompanion.consumables.flask?.charges).toBe(1);
  });

  it("consumes assigned food only on completed hub use", () => {
    const baseCompanion = {
      ...createCompanion(
        "companion-1",
        { x: 0, y: 0 },
        "companion-1",
        "fighter",
        0,
      ),
      characterLevel: 5,
    };
    const baseMaxHealth = getCompanionDerivedStats(baseCompanion).maxHealth;
    const { state, companion } = createConsumableState(
      ["hearty_trail_rations"],
      5,
      baseMaxHealth,
    );
    const assigned = assignFoodToCompanion(
      state,
      companion.id,
      "hearty_trail_rations",
    ).state;
    const started = startPartyConsumableUse(assigned, "food", 1000);
    const beforeCompletion = updateConsumableSystem(started, 5000);
    const completed = updateConsumableSystem(beforeCompletion, 6000);
    const completedCompanion = completed.entities[companion.id] as Companion;

    expect(countInventoryItem(beforeCompletion.inventory, "hearty_trail_rations")).toBe(1);
    expect(countInventoryItem(completed.inventory, "hearty_trail_rations")).toBe(0);
    expect(completedCompanion.consumables.foodItemId).toBe("hearty_trail_rations");
    expect(completedCompanion.consumableBuffs.food?.itemId).toBe("hearty_trail_rations");
  });

  it("interrupts food on damage without consuming inventory or applying buffs", () => {
    const { state, companion } = createConsumableState(["hearty_trail_rations"]);
    const assigned = assignFoodToCompanion(
      state,
      companion.id,
      "hearty_trail_rations",
    ).state;
    const started = startPartyConsumableUse(assigned, "food", 1000);
    const damaged = updateEntity(started, {
      ...(started.entities[companion.id] as Companion),
      health: 9,
    });
    const completed = updateConsumableSystem(damaged, 6000);
    const completedCompanion = completed.entities[companion.id] as Companion;

    expect(countInventoryItem(completed.inventory, "hearty_trail_rations")).toBe(1);
    expect(completedCompanion.consumableBuffs.food).toBeNull();
  });

  it("replaces active flask buffs and includes consumables in stat sync", () => {
    const { state, companion } = createConsumableState([
      "soldiers_recovery_flask",
    ]);
    const equipped = equipFlaskToCompanion(
      state,
      companion.id,
      "soldiers_recovery_flask",
    ).state;
    const charged = setEquippedFlaskCharges(equipped, companion.id, 2);
    const firstUse = updateConsumableSystem(
      startPartyConsumableUse(charged, "flask", 1000),
      3000,
    );
    const firstCompanion = firstUse.entities[companion.id] as Companion;
    const firstBuffExpiresAt = firstCompanion.consumableBuffs.flask?.expiresAt;
    const readyAgain = updateEntity(firstUse, {
      ...firstCompanion,
      health: 10,
      consumables: {
        ...firstCompanion.consumables,
        flask: firstCompanion.consumables.flask
          ? {
              ...firstCompanion.consumables.flask,
              lastUsedAt: 0,
            }
          : null,
      },
    });
    const secondUse = updateConsumableSystem(
      startPartyConsumableUse(readyAgain, "flask", 4000),
      6000,
    );
    const secondCompanion = secondUse.entities[companion.id] as Companion;

    expect(getCompanionDerivedStats(secondCompanion).attack).toBe(
      getCompanionDerivedStats(companion).attack + 1,
    );
    expect(secondCompanion.consumableBuffs.flask?.expiresAt).toBeGreaterThan(
      firstBuffExpiresAt ?? 0,
    );
  });

  it("keeps max-health sync stable when food constitution buffs complete", () => {
    const { state, companion } = createConsumableState(["hearty_trail_rations"]);
    const assigned = assignFoodToCompanion(
      state,
      companion.id,
      "hearty_trail_rations",
    ).state;
    const started = startPartyConsumableUse(assigned, "food", 1000);
    const completed = syncPartyDerivedMaxHealth(
      updateConsumableSystem(started, 6000),
    );
    const completedCompanion = completed.entities[companion.id] as Companion;

    expect(completedCompanion.consumableBuffs.food?.itemId).toBe(
      "hearty_trail_rations",
    );
    expect(completedCompanion.maxHealth).toBeGreaterThan(
      getCompanionDerivedStats(companion).maxHealth,
    );
  });

  it("auto-starts flask use at or below the companion threshold", () => {
    const { state, companion } = createConsumableState(["minor_recovery_flask"]);
    const equipped = equipFlaskToCompanion(
      state,
      companion.id,
      "minor_recovery_flask",
    ).state;
    const charged = setEquippedFlaskCharges(equipped, companion.id, 1);
    const aboveThreshold = updateEntity(charged, {
      ...(charged.entities[companion.id] as Companion),
      health: 31,
      maxHealth: 100,
    });
    const skipped = updateConsumableBehaviorSystem(aboveThreshold, 1000);
    const atThreshold = updateEntity(skipped, {
      ...(skipped.entities[companion.id] as Companion),
      health: 30,
      maxHealth: 100,
    });
    const started = updateConsumableBehaviorSystem(atThreshold, 1100);

    expect(skipped.consumableUsesByCompanionId).toBeUndefined();
    expect(started.consumableUsesByCompanionId?.[companion.id]).toMatchObject({
      kind: "flask",
      source: "ai",
    });
  });

  it("does not auto-start flask use when disabled, unavailable, cooling down, dead, or already using", () => {
    const { state, companion } = createConsumableState(["minor_recovery_flask"]);
    const equipped = equipFlaskToCompanion(
      state,
      companion.id,
      "minor_recovery_flask",
    ).state;
    const disabled = updateCompanionConsumableBehavior(
      setEquippedFlaskCharges(equipped, companion.id, 1),
      companion.id,
      { autoFlaskEnabled: false },
    );
    const noCharge = setEquippedFlaskCharges(equipped, companion.id, 0);
    const coolingDown = updateEntity(
      setEquippedFlaskCharges(equipped, companion.id, 1),
      {
        ...(equipped.entities[companion.id] as Companion),
        health: 10,
        maxHealth: 100,
        consumables: {
          ...(equipped.entities[companion.id] as Companion).consumables,
          flask: {
            itemId: "minor_recovery_flask",
            charges: 1,
            lastUsedAt: 900,
          },
        },
      },
    );
    const dead = updateEntity(setEquippedFlaskCharges(equipped, companion.id, 1), {
      ...(equipped.entities[companion.id] as Companion),
      state: "dead",
      health: 0,
      maxHealth: 100,
    });
    const alreadyUsing = startPartyConsumableUse(
      setEquippedFlaskCharges(equipped, companion.id, 1),
      "flask",
      1000,
    );

    expect(updateConsumableBehaviorSystem(disabled, 1000).consumableUsesByCompanionId).toBeUndefined();
    expect(updateConsumableBehaviorSystem(noCharge, 1000).consumableUsesByCompanionId).toBeUndefined();
    expect(updateConsumableBehaviorSystem(coolingDown, 1000).consumableUsesByCompanionId).toBeUndefined();
    expect(updateConsumableBehaviorSystem(dead, 1000).consumableUsesByCompanionId).toBeUndefined();
    expect(
      Object.values(
        updateConsumableBehaviorSystem(alreadyUsing, 1001).consumableUsesByCompanionId ?? {},
      ),
    ).toHaveLength(1);
  });

  it("lets manual flask shortcuts bypass disabled auto settings", () => {
    const { state, companion } = createConsumableState(["minor_recovery_flask"]);
    const equipped = equipFlaskToCompanion(
      state,
      companion.id,
      "minor_recovery_flask",
    ).state;
    const disabled = updateCompanionConsumableBehavior(
      setEquippedFlaskCharges(equipped, companion.id, 1),
      companion.id,
      { autoFlaskEnabled: false },
    );
    const started = startPartyConsumableUse(disabled, "flask", 1000);

    expect(started.consumableUsesByCompanionId?.[companion.id]).toMatchObject({
      kind: "flask",
      source: "manual",
    });
  });

  it("auto-starts hub food only when safe and no active food buff exists", () => {
    const { state, companion } = createConsumableState(["hearty_trail_rations"]);
    const assigned = assignFoodToCompanion(
      state,
      companion.id,
      "hearty_trail_rations",
    ).state;
    const started = updateConsumableBehaviorSystem(assigned, 1000);
    const wilderness = updateConsumableBehaviorSystem(
      {
        ...assigned,
        currentMapId: "map-1",
      },
      1000,
    );
    const unsafe = updateConsumableBehaviorSystem(
      updateEntity(assigned, {
        ...(assigned.entities[companion.id] as Companion),
        state: "attack",
      }),
      1000,
    );
    const buffed = updateConsumableBehaviorSystem(
      updateEntity(assigned, {
        ...(assigned.entities[companion.id] as Companion),
        consumableBuffs: {
          ...(assigned.entities[companion.id] as Companion).consumableBuffs,
          food: {
            itemId: "hearty_trail_rations",
            kind: "food",
            expiresAt: 10000,
          },
        },
      }),
      1000,
    );

    expect(started.consumableUsesByCompanionId?.[companion.id]).toMatchObject({
      kind: "food",
      source: "ai",
    });
    expect(wilderness.consumableUsesByCompanionId).toBeUndefined();
    expect(unsafe.consumableUsesByCompanionId).toBeUndefined();
    expect(buffed.consumableUsesByCompanionId).toBeUndefined();
  });

  it("creates a non-blocking hub departure food warning only when food is available and buffs are missing", () => {
    const { state, companion } = createConsumableState(["hearty_trail_rations"]);
    const assigned = assignFoodToCompanion(
      state,
      companion.id,
      "hearty_trail_rations",
    ).state;
    const warning = addHubDepartureFoodWarningIfNeeded(assigned, 1000);
    const buffed = updateEntity(assigned, {
      ...(assigned.entities[companion.id] as Companion),
      consumableBuffs: {
        ...(assigned.entities[companion.id] as Companion).consumableBuffs,
        food: {
          itemId: "hearty_trail_rations",
          kind: "food",
          expiresAt: 10000,
        },
      },
    });
    const noInventory = {
      ...assigned,
      inventory: {
        ...assigned.inventory,
        slots: [],
      },
    };

    expect(warning.hubDepartureFoodWarning).toMatchObject({
      companionIds: [companion.id],
      createdAt: 1000,
    });
    expect(getHubDepartureFoodWarningCompanionIds(buffed, 1000)).toEqual([]);
    expect(getHubDepartureFoodWarningCompanionIds(noInventory, 1000)).toEqual([]);
  });

  it("refills equipped flasks to max charges at hub healing fountains", () => {
    const { state, companion } = createConsumableState(["minor_recovery_flask"]);
    const equipped = equipFlaskToCompanion(
      state,
      companion.id,
      "minor_recovery_flask",
    ).state;
    const charged = setEquippedFlaskCharges(equipped, companion.id, 12);
    const atFountain = {
      ...charged,
      currentMapId: "hub" as const,
      map: {
        displayName: "Test Hub",
        debugName: "test-hub",
        columns: 10,
        rows: 10,
        walls: [],
        teleports: [],
        healingFountains: [
          {
            id: "test-fountain",
            position: { x: 0, y: 0 },
            range: 2,
          },
        ],
      },
    };
    const refilled = updateHealingFountainSystem(atFountain);
    const refilledCompanion = refilled.entities[companion.id] as Companion;

    expect(refilledCompanion.consumables.flask?.charges).toBe(100);
  });

  it("grants one flask charge to equipped flasks after 20 counted enemy kills", () => {
    const { state, companion } = createConsumableState(["minor_recovery_flask"]);
    const equipped = equipFlaskToCompanion(
      state,
      companion.id,
      "minor_recovery_flask",
    ).state;
    const charged = setEquippedFlaskCharges(equipped, companion.id, 0);
    const withKills = addDeadEnemies(charged, FLASK_RECHARGE_KILLS_PER_CHARGE);
    const recharged = updateFlaskRechargeFromEnemyKills(withKills, 2000);
    const rechargedCompanion = recharged.entities[companion.id] as Companion;

    expect(rechargedCompanion.consumables.flask?.charges).toBe(1);
    expect(recharged.flaskRechargeEnemyKillCounter).toBe(0);
  });

  it("spends enemy-kill recharge thresholds even when flasks are already capped", () => {
    const { state, companion } = createConsumableState(["minor_recovery_flask"]);
    const equipped = equipFlaskToCompanion(
      state,
      companion.id,
      "minor_recovery_flask",
    ).state;
    const capped = setEquippedFlaskCharges(equipped, companion.id, 100);
    const withKills = addDeadEnemies(capped, FLASK_RECHARGE_KILLS_PER_CHARGE);
    const recharged = updateFlaskRechargeFromEnemyKills(withKills, 2000);
    const rechargedCompanion = recharged.entities[companion.id] as Companion;

    expect(rechargedCompanion.consumables.flask?.charges).toBe(100);
    expect(recharged.flaskRechargeEnemyKillCounter).toBe(0);
  });

  it("counts one enemy death once but allows the same enemy to count after a respawn defeat", () => {
    const { state, companion } = createConsumableState(["minor_recovery_flask"]);
    const equipped = equipFlaskToCompanion(
      state,
      companion.id,
      "minor_recovery_flask",
    ).state;
    const withEnemy = {
      ...equipped,
      currentMapId: "map-1" as const,
      entities: {
        ...equipped.entities,
        "enemy-1": createDeadEnemy("enemy-1"),
      },
    };
    const firstCount = updateFlaskRechargeFromEnemyKills(withEnemy, 1000);
    const secondScan = updateFlaskRechargeFromEnemyKills(firstCount, 2000);
    const markedEnemy = secondScan.entities["enemy-1"] as Enemy;
    const defeatedAgain = updateEntity(secondScan, {
      ...markedEnemy,
      state: "dead",
      health: 0,
      defeatedAtMs: undefined,
    });
    const countedAfterRespawn = updateFlaskRechargeFromEnemyKills(defeatedAgain, 5000);

    expect(firstCount.flaskRechargeEnemyKillCounter).toBe(1);
    expect((firstCount.entities["enemy-1"] as Enemy).defeatedAtMs).toBe(1000);
    expect(secondScan.flaskRechargeEnemyKillCounter).toBe(1);
    expect(countedAfterRespawn.flaskRechargeEnemyKillCounter).toBe(2);
    expect(countedAfterRespawn.flaskRechargeCountedEnemyDefeats?.["enemy-1"]).toBe(5000);
  });
});
