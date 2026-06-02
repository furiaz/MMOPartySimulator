import { HUB_MAP_ID } from "./debugMap";
import { appendDebugTelemetryEvent } from "./debugTelemetry";
import { isLivingCompanion, isLivingEnemy } from "./entityGuards";
import {
  addEquipmentStatModifiers,
  addPrimaryStatModifiers,
} from "./equipmentTypes";
import {
  addItemToInventoryState,
  countInventoryItem,
  removeItemFromInventoryState,
} from "./inventory";
import { getItemDefinition } from "./items";
import { getPartyMembers } from "./partySystem";
import { recordEquippedItemObjectivesForQuests } from "./questSystem";
import { addCombatFeedback, updateEntity, type GameState } from "./state";
import type {
  Companion,
  CompanionConsumableBuffs,
  CompanionConsumableBehavior,
  CompanionConsumables,
  CompanionPrimaryStatModifiers,
  ConsumableBuffState,
  ConsumableItemId,
  ConsumableKind,
  ConsumableUseSource,
  ConsumableUseState,
  Enemy,
  EquipmentStatModifiers,
  ItemDefinition,
  ItemId,
} from "./types";

export const DEFAULT_AUTO_FLASK_HP_THRESHOLD_PERCENT = 30;
export const HUB_DEPARTURE_FOOD_WARNING_DURATION_MS = 5000;
export const FLASK_RECHARGE_KILLS_PER_CHARGE = 20;

export const PROTOTYPE_FLASK_ITEM_IDS = [
  "minor_recovery_flask",
  "soldiers_recovery_flask",
] as const satisfies readonly ConsumableItemId[];

export const PROTOTYPE_FOOD_ITEM_IDS = [
  "hearty_trail_rations",
  "skirmisher_rations",
] as const satisfies readonly ConsumableItemId[];

export const PROTOTYPE_CONSUMABLE_ITEM_IDS = [
  ...PROTOTYPE_FLASK_ITEM_IDS,
  ...PROTOTYPE_FOOD_ITEM_IDS,
] as const satisfies readonly ConsumableItemId[];

export type ConsumableMutationStatus =
  | "success"
  | "failed_companion_not_found"
  | "failed_item_not_found"
  | "failed_item_not_consumable"
  | "failed_item_not_in_inventory"
  | "failed_wrong_kind"
  | "failed_level_requirement"
  | "failed_inventory_full"
  | "failed_slot_empty";

export type ConsumableMutationResult = {
  status: ConsumableMutationStatus;
  companionId: string;
  itemId?: ItemId | null;
};

export type ConsumableBehaviorUpdate = Partial<CompanionConsumableBehavior>;

export type CompanionFlaskDisplayState = {
  itemId: ConsumableItemId;
  displayName: string;
  charges: number;
  maxCharges: number;
  usesLeft: number;
  cooldownRemainingMs: number;
  cooldownMs: number;
  cooldownPercent: number;
};

export function createEmptyCompanionConsumables(): CompanionConsumables {
  return {
    flask: null,
    foodItemId: null,
  };
}

export function createEmptyCompanionConsumableBuffs(): CompanionConsumableBuffs {
  return {
    flask: null,
    food: null,
  };
}

export function createDefaultCompanionConsumableBehavior(): CompanionConsumableBehavior {
  return {
    autoFlaskEnabled: true,
    autoFlaskHpThresholdPercent: DEFAULT_AUTO_FLASK_HP_THRESHOLD_PERCENT,
  };
}

export function updateCompanionConsumableBehavior(
  state: GameState,
  companionId: string,
  update: ConsumableBehaviorUpdate,
): GameState {
  const companion = state.entities[companionId];

  if (companion?.kind !== "companion") {
    return state;
  }

  return updateEntity(state, {
    ...companion,
    consumableBehavior: {
      ...companion.consumableBehavior,
      ...update,
      autoFlaskHpThresholdPercent: clampHpThresholdPercent(
        update.autoFlaskHpThresholdPercent ??
          companion.consumableBehavior.autoFlaskHpThresholdPercent,
      ),
    },
  });
}

export function isConsumableItemDefinition(
  itemDefinition: ItemDefinition,
): itemDefinition is ItemDefinition & {
  id: ConsumableItemId;
  consumableKind: ConsumableKind;
} {
  return itemDefinition.category === "consumable" && Boolean(itemDefinition.consumableKind);
}

export function isFlaskItemDefinition(
  itemDefinition: ItemDefinition,
): itemDefinition is ItemDefinition & {
  id: ConsumableItemId;
  consumableKind: "flask";
} {
  return isConsumableItemDefinition(itemDefinition) && itemDefinition.consumableKind === "flask";
}

export function isFoodItemDefinition(
  itemDefinition: ItemDefinition,
): itemDefinition is ItemDefinition & {
  id: ConsumableItemId;
  consumableKind: "food";
} {
  return isConsumableItemDefinition(itemDefinition) && itemDefinition.consumableKind === "food";
}

export function equipFlaskToCompanion(
  state: GameState,
  companionId: string,
  itemId: ItemId,
): { state: GameState; result: ConsumableMutationResult } {
  const companion = state.entities[companionId];
  const itemDefinition = getItemDefinition(itemId);

  if (companion?.kind !== "companion") {
    return { state, result: { status: "failed_companion_not_found", companionId, itemId } };
  }

  if (!itemDefinition) {
    return { state, result: { status: "failed_item_not_found", companionId, itemId } };
  }

  if (!isFlaskItemDefinition(itemDefinition)) {
    return { state, result: { status: "failed_wrong_kind", companionId, itemId } };
  }

  if (!meetsLevelRequirement(companion, itemDefinition)) {
    return { state, result: { status: "failed_level_requirement", companionId, itemId } };
  }

  if (countInventoryItem(state.inventory, itemDefinition.id) <= 0) {
    return { state, result: { status: "failed_item_not_in_inventory", companionId, itemId } };
  }

  let nextState = state;
  const currentFlask = companion.consumables.flask;
  const slotsNeededForReturn = currentFlask ? 1 : 0;
  const availableSlotsAfterRemovingNewItem = nextState.inventory.capacity - nextState.inventory.slots.length + 1;

  if (slotsNeededForReturn > availableSlotsAfterRemovingNewItem) {
    return { state, result: { status: "failed_inventory_full", companionId, itemId } };
  }

  nextState = removeItemFromInventoryState(
    nextState,
    itemDefinition.id,
    1,
    "consumable",
  ).state;

  if (currentFlask) {
    nextState = addItemToInventoryState(
      nextState,
      currentFlask.itemId,
      1,
      "consumable",
    ).state;
  }

  const refreshedCompanion = nextState.entities[companionId];

  if (refreshedCompanion?.kind !== "companion") {
    return { state, result: { status: "failed_companion_not_found", companionId, itemId } };
  }

  nextState = updateEntity(nextState, {
    ...refreshedCompanion,
    consumables: {
      ...refreshedCompanion.consumables,
      flask: {
        itemId: itemDefinition.id,
        charges: 0,
        lastUsedAt: null,
      },
    },
  });
  nextState = recordEquippedItemObjectivesForQuests(nextState, "flask_equipped");

  return {
    state: nextState,
    result: { status: "success", companionId, itemId },
  };
}

export function unequipFlaskFromCompanion(
  state: GameState,
  companionId: string,
): { state: GameState; result: ConsumableMutationResult } {
  const companion = state.entities[companionId];

  if (companion?.kind !== "companion") {
    return { state, result: { status: "failed_companion_not_found", companionId } };
  }

  const equippedFlask = companion.consumables.flask;

  if (!equippedFlask) {
    return { state, result: { status: "failed_slot_empty", companionId } };
  }

  const returnResult = addItemToInventoryState(
    state,
    equippedFlask.itemId,
    1,
    "consumable",
  );

  if (returnResult.result.addedQuantity < 1) {
    return {
      state,
      result: {
        status: "failed_inventory_full",
        companionId,
        itemId: equippedFlask.itemId,
      },
    };
  }

  const refreshedCompanion = returnResult.state.entities[companionId];

  if (refreshedCompanion?.kind !== "companion") {
    return { state, result: { status: "failed_companion_not_found", companionId } };
  }

  return {
    state: updateEntity(returnResult.state, {
      ...refreshedCompanion,
      consumables: {
        ...refreshedCompanion.consumables,
        flask: null,
      },
    }),
    result: {
      status: "success",
      companionId,
      itemId: equippedFlask.itemId,
    },
  };
}

export function assignFoodToCompanion(
  state: GameState,
  companionId: string,
  itemId: ItemId | null,
): { state: GameState; result: ConsumableMutationResult } {
  const companion = state.entities[companionId];

  if (companion?.kind !== "companion") {
    return { state, result: { status: "failed_companion_not_found", companionId, itemId } };
  }

  if (!itemId) {
    return {
      state: updateEntity(state, {
        ...companion,
        consumables: {
          ...companion.consumables,
          foodItemId: null,
        },
      }),
      result: { status: "success", companionId, itemId },
    };
  }

  const itemDefinition = getItemDefinition(itemId);

  if (!itemDefinition) {
    return { state, result: { status: "failed_item_not_found", companionId, itemId } };
  }

  if (!isFoodItemDefinition(itemDefinition)) {
    return { state, result: { status: "failed_wrong_kind", companionId, itemId } };
  }

  if (!meetsLevelRequirement(companion, itemDefinition)) {
    return { state, result: { status: "failed_level_requirement", companionId, itemId } };
  }

  return {
    state: updateEntity(state, {
      ...companion,
      consumables: {
        ...companion.consumables,
        foodItemId: itemDefinition.id,
      },
    }),
    result: { status: "success", companionId, itemId },
  };
}

export function startPartyConsumableUse(
  state: GameState,
  kind: ConsumableKind,
  now: number,
  source: ConsumableUseSource = "manual",
): GameState {
  return getPartyMembers(state).reduce(
    (nextState, companion) =>
      startCompanionConsumableUse(nextState, companion.id, kind, now, source),
    state,
  );
}

export function startCompanionConsumableUse(
  state: GameState,
  companionId: string,
  kind: ConsumableKind,
  now: number,
  source: ConsumableUseSource = "manual",
): GameState {
  const companion = state.entities[companionId];

  if (companion?.kind !== "companion" || !isLivingCompanion(companion)) {
    return state;
  }

  if (state.consumableUsesByCompanionId?.[companionId]) {
    return state;
  }

  const itemDefinition = getConsumableForUse(state, companion, kind);

  if (!itemDefinition) {
    return state;
  }

  if (!canStartConsumableUse(state, companion, itemDefinition, now)) {
    return state;
  }

  const useDurationMs = Math.max(0, itemDefinition.useDurationMs ?? 0);

  return {
    ...state,
    consumableUsesByCompanionId: {
      ...(state.consumableUsesByCompanionId ?? {}),
      [companionId]: {
        companionId,
        itemId: itemDefinition.id,
        kind,
        source,
        startedAt: now,
        completesAt: now + useDurationMs,
        durationMs: useDurationMs,
        healthAtStart: companion.health,
      },
    },
  };
}

export function updateConsumableSystem(
  state: GameState,
  now: number,
): GameState {
  const activeUses = Object.values(state.consumableUsesByCompanionId ?? {});

  if (activeUses.length === 0) {
    return state;
  }

  let nextState = state;

  for (const use of activeUses) {
    const companion = nextState.entities[use.companionId];
    const itemDefinition = getItemDefinition(use.itemId);

    if (
      companion?.kind !== "companion" ||
      !isLivingCompanion(companion) ||
      !isConsumableItemDefinition(itemDefinition) ||
      itemDefinition.consumableKind !== use.kind
    ) {
      nextState = removeConsumableUse(nextState, use.companionId);
      continue;
    }

    if (!isConsumableUseStillValid(nextState, companion, itemDefinition, use, now)) {
      nextState = removeConsumableUse(nextState, use.companionId);
      continue;
    }

    if (now < use.completesAt) {
      continue;
    }

    nextState = completeConsumableUse(nextState, companion, itemDefinition, use, now);
  }

  return nextState;
}

export function updateConsumableBehaviorSystem(
  state: GameState,
  now: number,
): GameState {
  let nextState = state;

  for (const companion of getPartyMembers(nextState)) {
    const currentCompanion = nextState.entities[companion.id];

    if (currentCompanion?.kind !== "companion") {
      continue;
    }

    if (shouldAutoUseFlask(nextState, currentCompanion, now)) {
      nextState = startCompanionConsumableUse(
        nextState,
        currentCompanion.id,
        "flask",
        now,
        "ai",
      );
    }
  }

  if (!isPartySafeForFood(nextState)) {
    return nextState;
  }

  for (const companion of getPartyMembers(nextState)) {
    const currentCompanion = nextState.entities[companion.id];

    if (
      currentCompanion?.kind !== "companion" ||
      isFoodBuffActive(currentCompanion, now)
    ) {
      continue;
    }

    nextState = startCompanionConsumableUse(
      nextState,
      currentCompanion.id,
      "food",
      now,
      "ai",
    );
  }

  return nextState;
}

export function clearExpiredHubDepartureFoodWarning(
  state: GameState,
  now: number,
): GameState {
  if (
    !state.hubDepartureFoodWarning ||
    state.hubDepartureFoodWarning.expiresAt > now
  ) {
    return state;
  }

  return {
    ...state,
    hubDepartureFoodWarning: null,
  };
}

export function refillEquippedFlasksFromHubFountain(
  state: GameState,
  fountainId: string,
): GameState {
  let nextState = state;

  for (const entity of Object.values(nextState.entities)) {
    if (entity.kind !== "companion") {
      continue;
    }

    const flask = entity.consumables.flask;

    if (!flask) {
      continue;
    }

    const itemDefinition = getItemDefinition(flask.itemId);

    if (!isFlaskItemDefinition(itemDefinition) || !itemDefinition.maxCharges) {
      continue;
    }

    const nextCharges = itemDefinition.maxCharges;

    if (flask.charges >= nextCharges) {
      continue;
    }

    nextState = updateEntity(nextState, {
      ...entity,
      consumables: {
        ...entity.consumables,
        flask: {
          ...flask,
          charges: nextCharges,
        },
      },
    });
    nextState = appendDebugTelemetryEvent(nextState, {
      type: "flask_fountain_refilled",
      entityId: entity.id,
      itemId: flask.itemId,
      itemDisplayName: itemDefinition.displayName,
      flaskChargesBefore: flask.charges,
      flaskChargesAfter: nextCharges,
      flaskMaxCharges: itemDefinition.maxCharges,
      flaskRechargeSource: "hub_fountain",
      reason: fountainId,
    });
  }

  return nextState;
}

export function updateFlaskRechargeFromEnemyKills(
  state: GameState,
  now: number,
): GameState {
  let nextState = removeStaleFlaskRechargeCountedEnemyDefeats(state);

  for (const entity of Object.values(nextState.entities)) {
    if (entity.kind !== "enemy" || entity.state !== "dead" || entity.health > 0) {
      continue;
    }

    const currentEnemy = nextState.entities[entity.id];

    if (currentEnemy?.kind !== "enemy") {
      continue;
    }

    const defeatMarker = currentEnemy.defeatedAtMs ?? now;

    if (nextState.flaskRechargeCountedEnemyDefeats?.[currentEnemy.id] === defeatMarker) {
      continue;
    }

    nextState = ensureEnemyDefeatMarker(nextState, currentEnemy, defeatMarker);
    nextState = countEnemyDefeatForFlaskRecharge(nextState, currentEnemy, defeatMarker);
  }

  return nextState;
}

export function addHubDepartureFoodWarningIfNeeded(
  state: GameState,
  now: number,
): GameState {
  const companionIds = getHubDepartureFoodWarningCompanionIds(state, now);

  if (companionIds.length === 0) {
    return state;
  }

  return {
    ...state,
    hubDepartureFoodWarning: {
      companionIds,
      createdAt: now,
      expiresAt: now + HUB_DEPARTURE_FOOD_WARNING_DURATION_MS,
    },
  };
}

export function getHubDepartureFoodWarningCompanionIds(
  state: GameState,
  now = Date.now(),
): string[] {
  if (state.currentMapId !== HUB_MAP_ID) {
    return [];
  }

  return getPartyMembers(state)
    .filter((companion) => {
      const foodItemId = companion.consumables.foodItemId;

      if (!foodItemId || isFoodBuffActive(companion, now)) {
        return false;
      }

      return countInventoryItem(state.inventory, foodItemId) > 0;
    })
    .map((companion) => companion.id);
}

export function clearExpiredConsumableBuffs(
  state: GameState,
  now: number,
): GameState {
  let nextState = state;

  for (const entity of Object.values(nextState.entities)) {
    if (entity.kind !== "companion") {
      continue;
    }

    const buffs = entity.consumableBuffs;
    const nextBuffs: CompanionConsumableBuffs = {
      flask: buffs.flask && buffs.flask.expiresAt > now ? buffs.flask : null,
      food: buffs.food && buffs.food.expiresAt > now ? buffs.food : null,
    };

    if (nextBuffs.flask === buffs.flask && nextBuffs.food === buffs.food) {
      continue;
    }

    nextState = updateEntity(nextState, {
      ...entity,
      consumableBuffs: nextBuffs,
    });
  }

  return nextState;
}

export function getCompanionConsumablePrimaryStatModifiers(
  companion: Companion,
): CompanionPrimaryStatModifiers {
  const buffs = getActiveConsumableBuffs(companion);

  return buffs.reduce(
    (modifiers, buff) =>
      addPrimaryStatModifiers(modifiers, buff.primaryStatModifiers ?? {}),
    {},
  );
}

export function getCompanionConsumableStatModifiers(
  companion: Companion,
): EquipmentStatModifiers {
  const buffs = getActiveConsumableBuffs(companion);

  return buffs.reduce(
    (modifiers, buff) =>
      addEquipmentStatModifiers(modifiers, buff.statModifiers ?? {}),
    {},
  );
}

export function getConsumableCooldownRemainingMs(
  companion: Companion,
  now: number,
): number {
  const flask = companion.consumables.flask;

  if (!flask?.lastUsedAt) {
    return 0;
  }

  const definition = getItemDefinition(flask.itemId);
  const cooldownMs = definition.cooldownMs ?? 0;

  return Math.max(0, flask.lastUsedAt + cooldownMs - now);
}

export function getCompanionFlaskDisplayState(
  companion: Companion,
  now: number,
): CompanionFlaskDisplayState | null {
  const flask = companion.consumables.flask;

  if (!flask) {
    return null;
  }

  const definition = getItemDefinition(flask.itemId);

  if (!isFlaskItemDefinition(definition)) {
    return null;
  }

  const chargeCost = Math.max(1, definition.chargeCost ?? 1);
  const cooldownMs = Math.max(0, definition.cooldownMs ?? 0);
  const cooldownRemainingMs = getConsumableCooldownRemainingMs(companion, now);

  return {
    itemId: definition.id,
    displayName: definition.displayName,
    charges: flask.charges,
    maxCharges: definition.maxCharges ?? flask.charges,
    usesLeft: Math.floor(flask.charges / chargeCost),
    cooldownRemainingMs,
    cooldownMs,
    cooldownPercent:
      cooldownMs > 0
        ? Math.min(100, Math.max(0, (cooldownRemainingMs / cooldownMs) * 100))
        : 0,
  };
}

function completeConsumableUse(
  state: GameState,
  companion: Companion,
  itemDefinition: ItemDefinition & {
    id: ConsumableItemId;
    consumableKind: ConsumableKind;
  },
  use: ConsumableUseState,
  now: number,
): GameState {
  if (isFlaskItemDefinition(itemDefinition)) {
    return completeFlaskUse(state, companion, itemDefinition, use, now);
  }

  if (isFoodItemDefinition(itemDefinition)) {
    return completeFoodUse(state, companion, itemDefinition, use, now);
  }

  return removeConsumableUse(state, companion.id);
}

function ensureEnemyDefeatMarker(
  state: GameState,
  enemy: Enemy,
  defeatMarker: number,
): GameState {
  if (enemy.defeatedAtMs !== undefined) {
    return state;
  }

  return updateEntity(state, {
    ...enemy,
    defeatedAtMs: defeatMarker,
  });
}

function countEnemyDefeatForFlaskRecharge(
  state: GameState,
  enemy: Enemy,
  defeatMarker: number,
): GameState {
  const killCounter = (state.flaskRechargeEnemyKillCounter ?? 0) + 1;
  let nextState: GameState = {
    ...state,
    flaskRechargeEnemyKillCounter: killCounter,
    flaskRechargeCountedEnemyDefeats: {
      ...(state.flaskRechargeCountedEnemyDefeats ?? {}),
      [enemy.id]: defeatMarker,
    },
  };

  nextState = appendDebugTelemetryEvent(nextState, {
    type: "flask_recharge_kill_progress",
    entityId: enemy.id,
    archetypeId: enemy.archetypeId,
    enemyTypeId: enemy.enemyTypeId,
    enemyLevel: enemy.level,
    flaskRechargeKillCounter: killCounter,
    flaskRechargeKillThreshold: FLASK_RECHARGE_KILLS_PER_CHARGE,
    flaskRechargeCountedEnemyDefeatMarker: defeatMarker,
    flaskRechargeSource: "enemy_kills",
  });

  while (
    (nextState.flaskRechargeEnemyKillCounter ?? 0) >=
    FLASK_RECHARGE_KILLS_PER_CHARGE
  ) {
    nextState = {
      ...nextState,
      flaskRechargeEnemyKillCounter:
        (nextState.flaskRechargeEnemyKillCounter ?? 0) -
        FLASK_RECHARGE_KILLS_PER_CHARGE,
    };
    nextState = grantFlaskRechargeCharge(nextState);
  }

  return nextState;
}

function removeStaleFlaskRechargeCountedEnemyDefeats(
  state: GameState,
): GameState {
  const countedDefeats = state.flaskRechargeCountedEnemyDefeats;

  if (!countedDefeats) {
    return state;
  }

  let nextCountedDefeats: Record<string, number> | null = null;

  for (const enemyId of Object.keys(countedDefeats)) {
    if (state.entities[enemyId]?.kind === "enemy") {
      continue;
    }

    nextCountedDefeats ??= { ...countedDefeats };
    delete nextCountedDefeats[enemyId];
  }

  if (!nextCountedDefeats) {
    return state;
  }

  return {
    ...state,
    flaskRechargeCountedEnemyDefeats: nextCountedDefeats,
  };
}

function grantFlaskRechargeCharge(state: GameState): GameState {
  let nextState = state;
  let equippedFlaskCount = 0;
  let cappedFlaskCount = 0;
  let gainedFlaskCount = 0;

  for (const entity of Object.values(nextState.entities)) {
    if (entity.kind !== "companion") {
      continue;
    }

    const flask = entity.consumables.flask;

    if (!flask) {
      continue;
    }

    const itemDefinition = getItemDefinition(flask.itemId);

    if (!isFlaskItemDefinition(itemDefinition) || !itemDefinition.maxCharges) {
      continue;
    }

    equippedFlaskCount += 1;
    const nextCharges = Math.min(itemDefinition.maxCharges, flask.charges + 1);

    if (nextCharges === flask.charges) {
      cappedFlaskCount += 1;
      continue;
    }

    gainedFlaskCount += 1;
    nextState = updateEntity(nextState, {
      ...entity,
      consumables: {
        ...entity.consumables,
        flask: {
          ...flask,
          charges: nextCharges,
        },
      },
    });
    nextState = appendDebugTelemetryEvent(nextState, {
      type: "flask_charge_gained",
      entityId: entity.id,
      itemId: flask.itemId,
      itemDisplayName: itemDefinition.displayName,
      flaskChargesBefore: flask.charges,
      flaskChargesAfter: nextCharges,
      flaskMaxCharges: itemDefinition.maxCharges,
      flaskRechargeKillThreshold: FLASK_RECHARGE_KILLS_PER_CHARGE,
      flaskRechargeSource: "enemy_kills",
    });
  }

  if (equippedFlaskCount === 0 || cappedFlaskCount > 0) {
    nextState = appendDebugTelemetryEvent(nextState, {
      type: "flask_recharge_noop_capped",
      entityId: "party",
      amount: cappedFlaskCount,
      result: gainedFlaskCount > 0 ? "partial" : "no_op",
      reason: equippedFlaskCount === 0 ? "no_equipped_flasks" : "flasks_at_max_charges",
      flaskRechargeKillThreshold: FLASK_RECHARGE_KILLS_PER_CHARGE,
      flaskRechargeSource: "enemy_kills",
    });
  }

  return nextState;
}

function completeFlaskUse(
  state: GameState,
  companion: Companion,
  itemDefinition: ItemDefinition & {
    id: ConsumableItemId;
    consumableKind: "flask";
  },
  use: ConsumableUseState,
  now: number,
): GameState {
  const flask = companion.consumables.flask;
  const chargeCost = itemDefinition.chargeCost ?? 0;

  if (!flask || flask.itemId !== itemDefinition.id || flask.charges < chargeCost) {
    return removeConsumableUse(state, companion.id);
  }

  const healedAmount = Math.max(
    0,
    Math.ceil(companion.maxHealth * (itemDefinition.healPercent ?? 0)),
  );
  const nextHealth = Math.min(companion.maxHealth, companion.health + healedAmount);
  const actualHeal = nextHealth - companion.health;
  const nextCompanion = applyConsumableBuff(
    {
      ...companion,
      health: nextHealth,
      consumables: {
        ...companion.consumables,
        flask: {
          ...flask,
          charges: Math.max(0, flask.charges - chargeCost),
          lastUsedAt: now,
        },
      },
    },
    itemDefinition,
    now,
  );
  let nextState = updateEntity(state, nextCompanion);
  nextState = removeConsumableUse(nextState, use.companionId);

  if (actualHeal > 0) {
    nextState = addCombatFeedback(nextState, {
      type: "heal",
      entityId: companion.id,
      text: `+${actualHeal} HP`,
      now,
    });
  }

  if (itemDefinition.statModifiers || itemDefinition.primaryStatModifiers) {
    nextState = addCombatFeedback(nextState, {
      type: "heal",
      entityId: companion.id,
      text: "Flask Buff",
      now,
    });
  }

  return nextState;
}

function completeFoodUse(
  state: GameState,
  companion: Companion,
  itemDefinition: ItemDefinition & {
    id: ConsumableItemId;
    consumableKind: "food";
  },
  use: ConsumableUseState,
  now: number,
): GameState {
  if (countInventoryItem(state.inventory, itemDefinition.id) <= 0) {
    return removeConsumableUse(state, companion.id);
  }

  const removeResult = removeItemFromInventoryState(
    state,
    itemDefinition.id,
    1,
    "consumable",
  );

  if (removeResult.result.removedQuantity < 1) {
    return removeConsumableUse(state, companion.id);
  }

  const refreshedCompanion = removeResult.state.entities[companion.id];

  if (refreshedCompanion?.kind !== "companion") {
    return removeConsumableUse(removeResult.state, companion.id);
  }

  let nextState = updateEntity(
    removeResult.state,
    applyConsumableBuff(refreshedCompanion, itemDefinition, now),
  );
  nextState = removeConsumableUse(nextState, use.companionId);
  nextState = addCombatFeedback(nextState, {
    type: "heal",
    entityId: companion.id,
    text: "Food Buff",
    now,
  });

  return nextState;
}

function applyConsumableBuff(
  companion: Companion,
  itemDefinition: ItemDefinition & {
    id: ConsumableItemId;
    consumableKind: ConsumableKind;
  },
  now: number,
): Companion {
  if (!itemDefinition.buffDurationMs) {
    return companion;
  }

  const buff: ConsumableBuffState = {
    itemId: itemDefinition.id,
    kind: itemDefinition.consumableKind,
    expiresAt: now + itemDefinition.buffDurationMs,
    primaryStatModifiers: itemDefinition.primaryStatModifiers,
    statModifiers: itemDefinition.statModifiers,
  };

  return {
    ...companion,
    consumableBuffs: {
      ...companion.consumableBuffs,
      [itemDefinition.consumableKind]: buff,
    },
  };
}

function removeConsumableUse(state: GameState, companionId: string): GameState {
  const activeUses = { ...(state.consumableUsesByCompanionId ?? {}) };
  delete activeUses[companionId];

  return {
    ...state,
    consumableUsesByCompanionId:
      Object.keys(activeUses).length > 0 ? activeUses : undefined,
  };
}

function canStartConsumableUse(
  state: GameState,
  companion: Companion,
  itemDefinition: ItemDefinition & {
    id: ConsumableItemId;
    consumableKind: ConsumableKind;
  },
  now: number,
): boolean {
  if (!meetsLevelRequirement(companion, itemDefinition)) {
    return false;
  }

  if (itemDefinition.consumableKind === "flask") {
    const flask = companion.consumables.flask;
    const chargeCost = itemDefinition.chargeCost ?? 0;

    return Boolean(
      flask &&
        flask.itemId === itemDefinition.id &&
        flask.charges >= chargeCost &&
        getConsumableCooldownRemainingMs(companion, now) <= 0,
    );
  }

  return (
    state.currentMapId === HUB_MAP_ID &&
    isPartySafeForFood(state) &&
    companion.consumables.foodItemId === itemDefinition.id &&
    countInventoryItem(state.inventory, itemDefinition.id) > 0
  );
}

function isConsumableUseStillValid(
  state: GameState,
  companion: Companion,
  itemDefinition: ItemDefinition & {
    id: ConsumableItemId;
    consumableKind: ConsumableKind;
  },
  use: ConsumableUseState,
  now: number,
): boolean {
  if (!canStartConsumableUse(state, companion, itemDefinition, now)) {
    return false;
  }

  if (itemDefinition.consumableKind === "food") {
    return companion.health >= use.healthAtStart;
  }

  return true;
}

function getConsumableForUse(
  state: GameState,
  companion: Companion,
  kind: ConsumableKind,
): (ItemDefinition & { id: ConsumableItemId; consumableKind: ConsumableKind }) | null {
  const itemId =
    kind === "flask"
      ? companion.consumables.flask?.itemId
      : companion.consumables.foodItemId;

  if (!itemId) {
    return null;
  }

  const itemDefinition = getItemDefinition(itemId);

  if (!isConsumableItemDefinition(itemDefinition)) {
    return null;
  }

  if (itemDefinition.consumableKind !== kind) {
    return null;
  }

  if (kind === "food" && countInventoryItem(state.inventory, itemDefinition.id) <= 0) {
    return null;
  }

  return itemDefinition;
}

function getActiveConsumableBuffs(companion: Companion): ConsumableBuffState[] {
  return [companion.consumableBuffs.flask, companion.consumableBuffs.food].filter(
    (buff): buff is ConsumableBuffState => Boolean(buff),
  );
}

function isFoodBuffActive(companion: Companion, now: number): boolean {
  return Boolean(
    companion.consumableBuffs.food &&
      companion.consumableBuffs.food.expiresAt > now,
  );
}

function meetsLevelRequirement(
  companion: Companion,
  itemDefinition: ItemDefinition,
): boolean {
  return !itemDefinition.levelRequirement || companion.characterLevel >= itemDefinition.levelRequirement;
}

function isPartyInCombat(state: GameState): boolean {
  return Object.values(state.entities).some(
    (entity) =>
      (isLivingCompanion(entity) || isLivingEnemy(entity)) &&
      entity.state === "attack",
  );
}

function shouldAutoUseFlask(
  state: GameState,
  companion: Companion,
  now: number,
): boolean {
  if (!companion.consumableBehavior.autoFlaskEnabled) {
    return false;
  }

  if (state.consumableUsesByCompanionId?.[companion.id]) {
    return false;
  }

  const threshold = clampHpThresholdPercent(
    companion.consumableBehavior.autoFlaskHpThresholdPercent,
  );
  const maxHealth = Math.max(1, companion.maxHealth);
  const healthPercent = (companion.health / maxHealth) * 100;

  if (healthPercent > threshold) {
    return false;
  }

  const flaskItemId = companion.consumables.flask?.itemId;

  if (!flaskItemId) {
    return false;
  }

  const itemDefinition = getItemDefinition(flaskItemId);

  return (
    isFlaskItemDefinition(itemDefinition) &&
    canStartConsumableUse(state, companion, itemDefinition, now)
  );
}

function isPartySafeForFood(state: GameState): boolean {
  return (
    state.currentMapId === HUB_MAP_ID &&
    !state.activeTeleport &&
    !isPartyInCombat(state) &&
    getPartyMembers(state).every(
      (companion) =>
        isLivingCompanion(companion) &&
        companion.state !== "attack",
    )
  );
}

function clampHpThresholdPercent(value: number): number {
  return Math.min(100, Math.max(1, Math.round(value)));
}
