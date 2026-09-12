import { getItemDefinition, isEnemyPartMaterialDefinition } from "./items";
import {
  getInventorySlotAtIndex,
  getInventorySlotIndex,
  getLockedInventorySlotIndices,
  isInventorySlotLocked,
  sanitizePartyInventory,
  toggleInventorySlotLock,
} from "./inventory";
import { getPartyLeader } from "./partySystem";
import type { GameState } from "./state";
import type {
  BankAutoRoutingMode,
  BankSlot,
  BankTransferFailureReason,
  BankTransferResult,
  ItemDefinition,
  ItemId,
  NpcEntity,
  PartyBank,
  PartyInventory,
} from "./types";

export const BANK_CAPACITY = 100;
export const BANK_INTERACTION_RANGE = 4;
export const BANK_MAX_STACK_QUANTITY = Number.MAX_SAFE_INTEGER;

const DEFAULT_AUTO_ROUTING_MODE: BankAutoRoutingMode = "keep_inventory";

export type BankAutoDepositResult = {
  state: GameState;
  movedQuantity: number;
  message: "Items Deposited!" | "Bank is full!" | "No items deposited";
  stoppedBecauseFull: boolean;
};

export function createEmptyPartyBank(capacity = BANK_CAPACITY): PartyBank {
  return {
    capacity,
    slots: [],
    lockedSlotIndices: [],
    autoRoutingMode: DEFAULT_AUTO_ROUTING_MODE,
  };
}

export function sanitizePartyBank(bank: PartyBank | undefined): PartyBank {
  const capacity = Math.max(0, Math.floor(bank?.capacity ?? BANK_CAPACITY));
  const rawSlots = Array.isArray(bank?.slots) ? bank.slots : [];
  const lockedSlotIndices = normalizeSlotIndices(
    bank?.lockedSlotIndices,
    capacity,
  );
  const usedIndices = new Set<number>();
  const slots: BankSlot[] = [];

  for (const [fallbackIndex, rawSlot] of rawSlots.entries()) {
    const itemDefinition = rawSlot ? getItemDefinition(rawSlot.itemId) : null;

    if (!rawSlot || !itemDefinition || rawSlot.quantity <= 0) {
      continue;
    }

    const slotIndex = getFirstUsableSlotIndex(
      getBankSlotIndex(rawSlot, fallbackIndex),
      usedIndices,
      capacity,
    );

    if (slotIndex === null) {
      continue;
    }

    usedIndices.add(slotIndex);
    slots.push({
      itemId: rawSlot.itemId,
      quantity: Math.min(
        BANK_MAX_STACK_QUANTITY,
        Math.max(1, Math.floor(rawSlot.quantity)),
      ),
      slotIndex,
    });
  }

  return {
    capacity,
    slots,
    lockedSlotIndices,
    autoRoutingMode: sanitizeBankAutoRoutingMode(bank?.autoRoutingMode),
  };
}

export function sanitizeBankAutoRoutingMode(
  mode: BankAutoRoutingMode | undefined,
): BankAutoRoutingMode {
  return mode === "deposit_body_parts" || mode === "deposit_all"
    ? mode
    : DEFAULT_AUTO_ROUTING_MODE;
}

export function setBankAutoRoutingMode(
  state: GameState,
  mode: BankAutoRoutingMode,
): GameState {
  return {
    ...state,
    bank: {
      ...getPartyBank(state),
      autoRoutingMode: sanitizeBankAutoRoutingMode(mode),
    },
  };
}

export function getPartyBank(state: GameState): PartyBank {
  return sanitizePartyBank(state.bank);
}

export function isBankChestNpc(entity: unknown): entity is NpcEntity {
  return Boolean(
    entity &&
      typeof entity === "object" &&
      "kind" in entity &&
      entity.kind === "npc" &&
      "npcRole" in entity &&
      entity.npcRole === "bank_chest",
  );
}

export function isPartyLeaderNearBankChest(state: GameState): boolean {
  const leader = getPartyLeader(state);

  if (!leader || leader.state === "dead") {
    return false;
  }

  return Object.values(state.entities).some(
    (entity) =>
      isBankChestNpc(entity) &&
      getDistance(leader.position, entity.position) <= BANK_INTERACTION_RANGE,
  );
}

export function getBankSlotAtIndex(
  bank: PartyBank,
  slotIndex: number,
): BankSlot | null {
  const resolvedSlotIndex = Math.floor(slotIndex);

  if (resolvedSlotIndex < 0 || resolvedSlotIndex >= bank.capacity) {
    return null;
  }

  return (
    bank.slots.find(
      (slot, fallbackIndex) =>
        getBankSlotIndex(slot, fallbackIndex) === resolvedSlotIndex,
    ) ?? null
  );
}

export function getBankSlotsByFixedIndex(
  bank: PartyBank,
): Array<{ index: number; slot: BankSlot | null; locked: boolean }> {
  const sanitizedBank = sanitizePartyBank(bank);
  const lockedSlotIndices = new Set(sanitizedBank.lockedSlotIndices);

  return Array.from({ length: sanitizedBank.capacity }, (_, index) => ({
    index,
    slot: getBankSlotAtIndex(sanitizedBank, index),
    locked: lockedSlotIndices.has(index),
  }));
}

export function toggleBankSlotLock(state: GameState, slotIndex: number): GameState {
  const bank = getPartyBank(state);
  const resolvedSlotIndex = Math.floor(slotIndex);

  if (resolvedSlotIndex < 0 || resolvedSlotIndex >= bank.capacity) {
    return {
      ...state,
      bank,
    };
  }

  const lockedSlotIndices = new Set(bank.lockedSlotIndices);

  if (lockedSlotIndices.has(resolvedSlotIndex)) {
    lockedSlotIndices.delete(resolvedSlotIndex);
  } else {
    lockedSlotIndices.add(resolvedSlotIndex);
  }

  return {
    ...state,
    bank: sanitizePartyBank({
      ...bank,
      lockedSlotIndices: [...lockedSlotIndices],
    }),
  };
}

export function toggleInventoryBankLock(
  state: GameState,
  slotIndex: number,
): GameState {
  return {
    ...state,
    inventory: toggleInventorySlotLock(state.inventory, slotIndex),
    bank: getPartyBank(state),
  };
}

export function depositInventorySlotToBank(
  state: GameState,
  inventorySlotIndex: number,
  quantity: number,
  options: { requireProximity?: boolean } = {},
): { state: GameState; result: BankTransferResult } {
  const requireProximity = options.requireProximity ?? true;
  const sanitizedState = sanitizeBankState(state);
  const requestedQuantity = Math.floor(quantity);

  if (requireProximity && !isPartyLeaderNearBankChest(sanitizedState)) {
    return {
      state: sanitizedState,
      result: createFailedTransfer(requestedQuantity, "not_near_bank"),
    };
  }

  if (requestedQuantity <= 0) {
    return {
      state: sanitizedState,
      result: createFailedTransfer(requestedQuantity, "invalid_quantity"),
    };
  }

  const sourceSlot = getInventorySlotAtIndex(
    sanitizedState.inventory,
    inventorySlotIndex,
  );

  if (!sourceSlot) {
    return {
      state: sanitizedState,
      result: createFailedTransfer(requestedQuantity, "source_empty"),
    };
  }

  if (isInventorySlotLocked(sanitizedState.inventory, inventorySlotIndex)) {
    return {
      state: sanitizedState,
      result: createFailedTransfer(
        requestedQuantity,
        "source_locked",
        sourceSlot.itemId,
      ),
    };
  }

  const itemDefinition = getItemDefinition(sourceSlot.itemId);

  if (!itemDefinition) {
    return {
      state: sanitizedState,
      result: createFailedTransfer(
        requestedQuantity,
        "invalid_item",
        sourceSlot.itemId,
      ),
    };
  }

  if (itemDefinition.category === "quest") {
    return {
      state: sanitizedState,
      result: createFailedTransfer(
        requestedQuantity,
        "quest_item",
        sourceSlot.itemId,
      ),
    };
  }

  const destination = getBankDestination(
    sanitizedState.bank,
    sourceSlot.itemId,
    itemDefinition,
  );

  if (!destination) {
    return {
      state: sanitizedState,
      result: createFailedTransfer(
        requestedQuantity,
        "bank_full",
        sourceSlot.itemId,
      ),
    };
  }

  if (destination.reason === "destination_locked") {
    return {
      state: sanitizedState,
      result: createFailedTransfer(
        requestedQuantity,
        "destination_locked",
        sourceSlot.itemId,
      ),
    };
  }

  const movableQuantity = clampBankTransferQuantity(
    requestedQuantity,
    sourceSlot.quantity,
    destination.availableQuantity,
  );

  if (movableQuantity <= 0) {
    return {
      state: sanitizedState,
      result: createFailedTransfer(
        requestedQuantity,
        destination.availableQuantity <= 0 ? "bank_full" : "invalid_quantity",
        sourceSlot.itemId,
      ),
    };
  }

  const nextInventory = removeFromInventoryFixedSlot(
    sanitizedState.inventory,
    inventorySlotIndex,
    movableQuantity,
  );
  const nextBank = addToBankDestination(
    sanitizedState.bank,
    destination,
    sourceSlot.itemId,
    movableQuantity,
  );
  const remainingQuantity = requestedQuantity - movableQuantity;

  return {
    state: {
      ...sanitizedState,
      inventory: nextInventory,
      bank: nextBank,
    },
    result: {
      status: remainingQuantity > 0 ? "partial" : "success",
      itemId: sourceSlot.itemId,
      requestedQuantity,
      movedQuantity: movableQuantity,
      remainingQuantity,
      previousSourceQuantity: sourceSlot.quantity,
      nextSourceQuantity: sourceSlot.quantity - movableQuantity,
    },
  };
}

export function withdrawBankSlotToInventory(
  state: GameState,
  bankSlotIndex: number,
  quantity: number,
  options: { requireProximity?: boolean } = {},
): { state: GameState; result: BankTransferResult } {
  const requireProximity = options.requireProximity ?? true;
  const sanitizedState = sanitizeBankState(state);
  const requestedQuantity = Math.floor(quantity);

  if (requireProximity && !isPartyLeaderNearBankChest(sanitizedState)) {
    return {
      state: sanitizedState,
      result: createFailedTransfer(requestedQuantity, "not_near_bank"),
    };
  }

  if (requestedQuantity <= 0) {
    return {
      state: sanitizedState,
      result: createFailedTransfer(requestedQuantity, "invalid_quantity"),
    };
  }

  const sourceSlot = getBankSlotAtIndex(sanitizedState.bank, bankSlotIndex);

  if (!sourceSlot) {
    return {
      state: sanitizedState,
      result: createFailedTransfer(requestedQuantity, "source_empty"),
    };
  }

  if (sanitizedState.bank.lockedSlotIndices.includes(bankSlotIndex)) {
    return {
      state: sanitizedState,
      result: createFailedTransfer(
        requestedQuantity,
        "source_locked",
        sourceSlot.itemId,
      ),
    };
  }

  const itemDefinition = getItemDefinition(sourceSlot.itemId);

  if (!itemDefinition) {
    return {
      state: sanitizedState,
      result: createFailedTransfer(
        requestedQuantity,
        "invalid_item",
        sourceSlot.itemId,
      ),
    };
  }

  const destinationCapacity = getUnlockedInventoryAcceptQuantity(
    sanitizedState.inventory,
    sourceSlot.itemId,
    itemDefinition,
  );
  const movableQuantity = clampBankTransferQuantity(
    requestedQuantity,
    sourceSlot.quantity,
    destinationCapacity,
  );

  if (movableQuantity <= 0) {
    return {
      state: sanitizedState,
      result: createFailedTransfer(
        requestedQuantity,
        "inventory_full",
        sourceSlot.itemId,
      ),
    };
  }

  const nextBank = removeFromBankFixedSlot(
    sanitizedState.bank,
    bankSlotIndex,
    movableQuantity,
  );
  const nextInventory = addToInventoryUnlocked(
    sanitizedState.inventory,
    sourceSlot.itemId,
    itemDefinition,
    movableQuantity,
  );
  const remainingQuantity = requestedQuantity - movableQuantity;

  return {
    state: {
      ...sanitizedState,
      inventory: nextInventory,
      bank: nextBank,
    },
    result: {
      status: remainingQuantity > 0 ? "partial" : "success",
      itemId: sourceSlot.itemId,
      requestedQuantity,
      movedQuantity: movableQuantity,
      remainingQuantity,
      previousSourceQuantity: sourceSlot.quantity,
      nextSourceQuantity: sourceSlot.quantity - movableQuantity,
    },
  };
}

export function depositAllToBank(
  state: GameState,
  options: { onlyEnemyParts?: boolean; requireProximity?: boolean } = {},
): { state: GameState; movedQuantity: number; stoppedBecauseFull: boolean } {
  const requireProximity = options.requireProximity ?? true;
  let nextState = sanitizeBankState(state);
  let movedQuantity = 0;

  if (requireProximity && !isPartyLeaderNearBankChest(nextState)) {
    return { state: nextState, movedQuantity: 0, stoppedBecauseFull: false };
  }

  for (const { slotIndex, slot } of getUnlockedInventorySourceSlots(
    nextState.inventory,
  )) {
    const itemDefinition = getItemDefinition(slot.itemId);

    if (!itemDefinition || itemDefinition.category === "quest") {
      continue;
    }

    if (
      options.onlyEnemyParts &&
      !isAutoDepositEnemyPartMaterialDefinition(itemDefinition)
    ) {
      continue;
    }

    const transfer = depositInventorySlotToBank(
      nextState,
      slotIndex,
      slot.quantity,
      { requireProximity: false },
    );
    nextState = transfer.state;

    if (transfer.result.status === "success" || transfer.result.status === "partial") {
      movedQuantity += transfer.result.movedQuantity;
    }

    if (
      transfer.result.status === "failed" &&
      transfer.result.reason === "bank_full"
    ) {
      return { state: nextState, movedQuantity, stoppedBecauseFull: true };
    }

    if (
      transfer.result.status === "partial" &&
      transfer.result.remainingQuantity > 0
    ) {
      return { state: nextState, movedQuantity, stoppedBecauseFull: true };
    }
  }

  return { state: nextState, movedQuantity, stoppedBecauseFull: false };
}

export function autoDepositByRoutingMode(state: GameState): BankAutoDepositResult {
  const sanitizedState = sanitizeBankState(state);
  const mode = sanitizedState.bank.autoRoutingMode;

  if (mode === "keep_inventory") {
    return {
      state: sanitizedState,
      movedQuantity: 0,
      message: "No items deposited",
      stoppedBecauseFull: false,
    };
  }

  const result = depositAllToBank(sanitizedState, {
    onlyEnemyParts: mode === "deposit_body_parts",
    requireProximity: false,
  });
  const message = result.stoppedBecauseFull
    ? "Bank is full!"
    : result.movedQuantity > 0
      ? "Items Deposited!"
      : "No items deposited";

  return {
    ...result,
    message,
  };
}

export function isAutoDepositEnemyPartMaterialDefinition(
  itemDefinition: ItemDefinition,
): boolean {
  return isEnemyPartMaterialDefinition(itemDefinition);
}

export function clampBankTransferQuantity(
  requestedQuantity: number,
  availableSourceQuantity: number,
  availableDestinationQuantity: number,
): number {
  return Math.max(
    0,
    Math.min(
      Math.floor(requestedQuantity),
      Math.floor(availableSourceQuantity),
      Math.floor(availableDestinationQuantity),
    ),
  );
}

function sanitizeBankState(state: GameState): GameState {
  return {
    ...state,
    inventory: sanitizePartyInventory(state.inventory),
    bank: getPartyBank(state),
  };
}

function getBankDestination(
  bank: PartyBank,
  itemId: ItemId,
  itemDefinition: ItemDefinition,
):
  | {
      type: "existing";
      slotIndex: number;
      arrayIndex: number;
      availableQuantity: number;
      reason?: undefined;
    }
  | {
      type: "empty";
      slotIndex: number;
      availableQuantity: number;
      reason?: undefined;
    }
  | { reason: "destination_locked" }
  | null {
  if (itemDefinition.stackable) {
    const matchingSlots = bank.slots
      .map((slot, arrayIndex) => ({
        slot,
        arrayIndex,
        slotIndex: getBankSlotIndex(slot, arrayIndex),
      }))
      .filter(({ slot }) => slot.itemId === itemId);
    const unlockedSlot = matchingSlots.find(
      ({ slotIndex }) => !bank.lockedSlotIndices.includes(slotIndex),
    );

    if (unlockedSlot) {
      return {
        type: "existing",
        slotIndex: unlockedSlot.slotIndex,
        arrayIndex: unlockedSlot.arrayIndex,
        availableQuantity: BANK_MAX_STACK_QUANTITY - unlockedSlot.slot.quantity,
      };
    }

    if (matchingSlots.length > 0) {
      return { reason: "destination_locked" };
    }
  }

  const emptySlotIndex = getFirstEmptyUnlockedBankSlotIndex(bank);

  return emptySlotIndex === null
    ? null
    : {
        type: "empty",
        slotIndex: emptySlotIndex,
        availableQuantity: itemDefinition.stackable ? BANK_MAX_STACK_QUANTITY : 1,
      };
}

function addToBankDestination(
  bank: PartyBank,
  destination: Exclude<ReturnType<typeof getBankDestination>, null | { reason: "destination_locked" }>,
  itemId: ItemId,
  quantity: number,
): PartyBank {
  const slots = [...bank.slots];

  if (destination.type === "existing") {
    const slot = slots[destination.arrayIndex];
    slots[destination.arrayIndex] = {
      ...slot,
      quantity: Math.min(BANK_MAX_STACK_QUANTITY, slot.quantity + quantity),
      slotIndex: destination.slotIndex,
    };
  } else {
    slots.push({
      itemId,
      quantity,
      slotIndex: destination.slotIndex,
    });
  }

  return sanitizePartyBank({
    ...bank,
    slots,
  });
}

function removeFromInventoryFixedSlot(
  inventory: PartyInventory,
  slotIndex: number,
  quantity: number,
): PartyInventory {
  return sanitizePartyInventory({
    ...inventory,
    slots: inventory.slots
      .map((slot, fallbackIndex) => {
        const currentSlotIndex = getInventorySlotIndex(slot, fallbackIndex);

        if (currentSlotIndex !== slotIndex) {
          return {
            ...slot,
            slotIndex: currentSlotIndex,
          };
        }

        return {
          ...slot,
          slotIndex: currentSlotIndex,
          quantity: slot.quantity - quantity,
        };
      })
      .filter((slot) => slot.quantity > 0),
    lockedSlotIndices: getLockedInventorySlotIndices(inventory),
  });
}

function removeFromBankFixedSlot(
  bank: PartyBank,
  slotIndex: number,
  quantity: number,
): PartyBank {
  return sanitizePartyBank({
    ...bank,
    slots: bank.slots
      .map((slot, fallbackIndex) => {
        const currentSlotIndex = getBankSlotIndex(slot, fallbackIndex);

        if (currentSlotIndex !== slotIndex) {
          return slot;
        }

        return {
          ...slot,
          slotIndex: currentSlotIndex,
          quantity: slot.quantity - quantity,
        };
      })
      .filter((slot) => slot.quantity > 0),
  });
}

function addToInventoryUnlocked(
  inventory: PartyInventory,
  itemId: ItemId,
  itemDefinition: ItemDefinition,
  quantity: number,
): PartyInventory {
  let remainingQuantity = quantity;
  const lockedSlotIndices = new Set(getLockedInventorySlotIndices(inventory));
  const slots = inventory.slots.map((slot, fallbackIndex) => ({
    ...slot,
    slotIndex: getInventorySlotIndex(slot, fallbackIndex),
  }));

  if (itemDefinition.stackable) {
    for (let arrayIndex = 0; arrayIndex < slots.length && remainingQuantity > 0; arrayIndex += 1) {
      const slot = slots[arrayIndex];

      if (
        slot.itemId !== itemId ||
        slot.quantity >= itemDefinition.maxStack ||
        lockedSlotIndices.has(slot.slotIndex)
      ) {
        continue;
      }

      const addedQuantity = Math.min(
        itemDefinition.maxStack - slot.quantity,
        remainingQuantity,
      );
      slots[arrayIndex] = {
        ...slot,
        quantity: slot.quantity + addedQuantity,
      };
      remainingQuantity -= addedQuantity;
    }
  }

  while (remainingQuantity > 0) {
    const slotIndex = getFirstEmptyUnlockedInventorySlotIndex({
      ...inventory,
      slots,
    });

    if (slotIndex === null) {
      break;
    }

    const addedQuantity = itemDefinition.stackable
      ? Math.min(itemDefinition.maxStack, remainingQuantity)
      : 1;
    slots.push({
      itemId,
      quantity: addedQuantity,
      slotIndex,
    });
    remainingQuantity -= addedQuantity;
  }

  return sanitizePartyInventory({
    ...inventory,
    slots,
    lockedSlotIndices: [...lockedSlotIndices],
  });
}

function getUnlockedInventoryAcceptQuantity(
  inventory: PartyInventory,
  itemId: ItemId,
  itemDefinition: ItemDefinition,
): number {
  const lockedSlotIndices = new Set(getLockedInventorySlotIndices(inventory));
  let quantity = 0;

  if (itemDefinition.stackable) {
    for (const [fallbackIndex, slot] of inventory.slots.entries()) {
      const slotIndex = getInventorySlotIndex(slot, fallbackIndex);

      if (
        slot.itemId === itemId &&
        !lockedSlotIndices.has(slotIndex) &&
        slot.quantity < itemDefinition.maxStack
      ) {
        quantity += itemDefinition.maxStack - slot.quantity;
      }
    }
  }

  const occupiedIndices = new Set(
    inventory.slots.map((slot, fallbackIndex) =>
      getInventorySlotIndex(slot, fallbackIndex),
    ),
  );

  for (let index = 0; index < inventory.capacity; index += 1) {
    if (!occupiedIndices.has(index) && !lockedSlotIndices.has(index)) {
      quantity += itemDefinition.stackable ? itemDefinition.maxStack : 1;
    }
  }

  return quantity;
}

function getUnlockedInventorySourceSlots(
  inventory: PartyInventory,
): Array<{ slotIndex: number; slot: BankSlot }> {
  const lockedSlotIndices = new Set(getLockedInventorySlotIndices(inventory));

  return inventory.slots
    .map((slot, fallbackIndex) => ({
      slotIndex: getInventorySlotIndex(slot, fallbackIndex),
      slot,
    }))
    .filter(({ slotIndex }) => !lockedSlotIndices.has(slotIndex));
}

function getFirstEmptyUnlockedBankSlotIndex(bank: PartyBank): number | null {
  const occupiedIndices = new Set(
    bank.slots.map((slot, fallbackIndex) =>
      getBankSlotIndex(slot, fallbackIndex),
    ),
  );
  const lockedSlotIndices = new Set(bank.lockedSlotIndices);

  for (let index = 0; index < bank.capacity; index += 1) {
    if (!occupiedIndices.has(index) && !lockedSlotIndices.has(index)) {
      return index;
    }
  }

  return null;
}

function getFirstEmptyUnlockedInventorySlotIndex(
  inventory: PartyInventory,
): number | null {
  const occupiedIndices = new Set(
    inventory.slots.map((slot, fallbackIndex) =>
      getInventorySlotIndex(slot, fallbackIndex),
    ),
  );
  const lockedSlotIndices = new Set(getLockedInventorySlotIndices(inventory));

  for (let index = 0; index < inventory.capacity; index += 1) {
    if (!occupiedIndices.has(index) && !lockedSlotIndices.has(index)) {
      return index;
    }
  }

  return null;
}

function getBankSlotIndex(slot: BankSlot, fallbackIndex: number): number {
  return typeof slot.slotIndex === "number" &&
    Number.isFinite(slot.slotIndex) &&
    slot.slotIndex >= 0
    ? Math.floor(slot.slotIndex)
    : fallbackIndex;
}

function createFailedTransfer(
  requestedQuantity: number,
  reason: BankTransferFailureReason,
  itemId?: ItemId,
): BankTransferResult {
  return {
    status: "failed",
    itemId,
    requestedQuantity,
    movedQuantity: 0,
    remainingQuantity: Math.max(0, requestedQuantity),
    reason,
  };
}

function getFirstUsableSlotIndex(
  preferredIndex: number,
  usedIndices: Set<number>,
  capacity: number,
): number | null {
  if (
    preferredIndex >= 0 &&
    preferredIndex < capacity &&
    !usedIndices.has(preferredIndex)
  ) {
    return preferredIndex;
  }

  for (let index = 0; index < capacity; index += 1) {
    if (!usedIndices.has(index)) {
      return index;
    }
  }

  return null;
}

function normalizeSlotIndices(
  slotIndices: number[] | undefined,
  capacity: number,
): number[] {
  return Array.from(
    new Set(
      (slotIndices ?? [])
        .map((slotIndex) => Math.floor(slotIndex))
        .filter((slotIndex) => slotIndex >= 0 && slotIndex < capacity),
    ),
  ).sort((first, second) => first - second);
}

function getDistance(first: { x: number; y: number }, second: { x: number; y: number }): number {
  return Math.hypot(first.x - second.x, first.y - second.y);
}
