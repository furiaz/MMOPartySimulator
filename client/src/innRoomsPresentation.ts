import {
  CLASS_DEFINITIONS,
  getActiveCompanions,
  getActiveSkillsForCompanion,
  getCompanionSkillRank,
  getCompanionSkillMaxRank,
  getGuildCompanionCapacity,
  getGuildSecondaryPartiesState,
  getInnReserveCompanions,
  getItemDefinition,
  getLearnedSkillGroupsForCompanion,
  getRestingCompanions,
  type Companion,
  type EquipmentSlot,
  type GameState,
  type ItemId,
  type SkillId,
} from "./game";

export type InnRoomCardVisualState =
  | "inn"
  | "active"
  | "field_team"
  | "assigned_field_team"
  | "empty";

export type InnRoomCard =
  | {
      kind: "companion";
      slotNumber: number;
      companion: Companion;
      visualState: Exclude<InnRoomCardVisualState, "empty">;
      locationLabel: string;
      statusLabel: string;
      badgeText: string | null;
    }
  | {
      kind: "empty";
      slotNumber: number;
      visualState: "empty";
      locationLabel: "Empty Room";
      statusLabel: "Available";
      badgeText: null;
    };

export type InnRoomOverview = {
  cards: InnRoomCard[];
  occupiedRooms: number;
  capacity: number;
  isOverCapacity: boolean;
};

export type InnRoomEquipmentRow = {
  slot: EquipmentSlot;
  label: string;
  itemId: ItemId | null;
  itemName: string;
};

export type InnRoomSkillRow = {
  skillId: SkillId;
  displayName: string;
  rank: number;
  maxRank: number;
  enabled: boolean;
};

export type InnRoomSkillGroup = {
  classId: Companion["classId"];
  className: string;
  skills: InnRoomSkillRow[];
};

const EQUIPMENT_SLOT_LABELS: Record<EquipmentSlot, string> = {
  head: "Head",
  chest: "Chest",
  legs: "Legs",
  gloves: "Gloves",
  boots: "Boots",
  mainHand: "Main Hand",
  offhand: "Offhand",
  accessory1: "Accessory 1",
  accessory2: "Accessory 2",
};

const EQUIPMENT_SLOT_ORDER: EquipmentSlot[] = [
  "mainHand",
  "offhand",
  "head",
  "chest",
  "legs",
  "gloves",
  "boots",
  "accessory1",
  "accessory2",
];

export function getInnRoomOverview(state: GameState): InnRoomOverview {
  const capacity = getGuildCompanionCapacity(state);
  const activeCards = getActiveCompanions(state)
    .sort(compareCompanionsByPartyOrder)
    .map((companion): InnRoomCard => ({
      kind: "companion",
      slotNumber: 0,
      companion,
      visualState: "active",
      locationLabel: "Active Party",
      statusLabel: "Active Party",
      badgeText: "\u2605",
    }));
  const reserveCards = getInnReserveCompanions(state).map(
    (companion): InnRoomCard => ({
      kind: "companion",
      slotNumber: 0,
      companion,
      visualState: "inn",
      locationLabel: "Inn's Reserve",
      statusLabel: "Available",
      badgeText: null,
    }),
  );
  const fieldTeamCards = getFieldTeamRoomCards(state);
  const companionCards = [...activeCards, ...reserveCards, ...fieldTeamCards];
  const emptyCards = Array.from(
    { length: Math.max(0, capacity - companionCards.length) },
    (): InnRoomCard => ({
      kind: "empty",
      slotNumber: 0,
      visualState: "empty",
      locationLabel: "Empty Room",
      statusLabel: "Available",
      badgeText: null,
    }),
  );
  const cards = [...companionCards, ...emptyCards].map((card, index) => ({
    ...card,
    slotNumber: index + 1,
  })) as InnRoomCard[];

  return {
    cards,
    occupiedRooms: companionCards.length,
    capacity,
    isOverCapacity: companionCards.length > capacity,
  };
}

export function getInnRoomEquipmentRows(
  companion: Companion,
): InnRoomEquipmentRow[] {
  return EQUIPMENT_SLOT_ORDER.map((slot) => {
    const itemId = companion.equipment[slot];

    return {
      slot,
      label: EQUIPMENT_SLOT_LABELS[slot],
      itemId,
      itemName: itemId ? getItemDefinition(itemId).displayName : "None",
    };
  });
}

export function getInnRoomSkillGroups(companion: Companion): InnRoomSkillGroup[] {
  const activeSkillIds = new Set(
    getActiveSkillsForCompanion(companion).map((skill) => skill.id),
  );

  return getLearnedSkillGroupsForCompanion(companion).map((group) => ({
    classId: group.classId,
    className: CLASS_DEFINITIONS[group.classId].displayName,
    skills: group.skills.map((skill) => ({
      skillId: skill.id,
      displayName: skill.displayName,
      rank: getCompanionSkillRank(companion, skill.id),
      maxRank: getCompanionSkillMaxRank(companion, skill),
      enabled: activeSkillIds.has(skill.id),
    })),
  }));
}

function getFieldTeamRoomCards(state: GameState): InnRoomCard[] {
  const restingCompanionsById = Object.fromEntries(
    getRestingCompanions(state).map((companion) => [companion.id, companion]),
  );
  const secondaryParties = getGuildSecondaryPartiesState(state);

  return secondaryParties.parties.flatMap((party, partyIndex) => {
    const teamNumber = partyIndex + 1;
    const isAssigned = Boolean(party.assignment);

    return party.companionIds
      .filter((companionId): companionId is string => Boolean(companionId))
      .map((companionId): InnRoomCard | null => {
        const companion = restingCompanionsById[companionId];

        if (!companion) {
          return null;
        }

        return {
          kind: "companion",
          slotNumber: 0,
          companion,
          visualState: isAssigned ? "assigned_field_team" : "field_team",
          locationLabel: party.displayName,
          statusLabel: isAssigned ? `Assigned - ${party.displayName}` : party.displayName,
          badgeText: String(teamNumber),
        };
      })
      .filter((card): card is InnRoomCard => Boolean(card));
  });
}

function compareCompanionsByPartyOrder(a: Companion, b: Companion): number {
  return a.partyOrder - b.partyOrder || a.id.localeCompare(b.id);
}
