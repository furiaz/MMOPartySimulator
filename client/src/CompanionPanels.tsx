import { useState, type ReactNode } from "react";
import {
  EMPTY_EQUIPMENT_SLOT_ICON_SRC,
  INVENTORY_ITEM_ICON_SRC,
} from "./assetIcons";
import {
  ARMOR_FAMILY_LABELS,
  CLASS_DEFINITIONS,
  companionIds,
  EQUIPMENT_SLOT_LABELS,
  EQUIPMENT_SLOTS,
  EQUIPMENT_TYPE_LABELS,
  getConsumableCooldownRemainingMs,
  getCompanionFlaskDisplayState,
  getCharacterXpProgress,
  getCompanionEquipmentPrimaryStatModifiers,
  getCompanionEquipmentStatModifiers,
  getCompanionActualStats,
  getCompanionDerivedStats,
  getDefenseReductionPercent,
  getItemDefinition,
  isFlaskItemDefinition,
  isFoodItemDefinition,
  getPartySizeUnlockRequirement,
  getSkillRoleScore,
  getSkillsForClass,
  validateEquipmentItemForCompanion,
  type Companion,
  type CompanionPrimaryStatModifiers,
  type EquipmentSlot,
  type EquipmentStatModifiers,
  type ItemDefinition,
  type ItemId,
  type PartyInventory,
  type PartyMemberRole,
  type PrimaryStatId,
  type SkillDefinition,
  type ClassPath,
} from "./game";
import { CLASS_PORTRAIT_SRC } from "./visualAssets";

export type GameMenuTab =
  | "party"
  | "partyManagement"
  | "inventory"
  | "quests"
  | "world";

export type PartyMenuSection =
  | "stats"
  | "equipment"
  | "skills"
  | "skillPreferences";

export type PartyManagementSection =
  | "role"
  | "partyOrder"
  | "formation"
  | "behaviorSettings";

export type PartyShortcutTarget = PartyMenuSection;

const partyMemberRoleOptions: PartyMemberRole[] = [
  "none",
  "defender",
  "fighter",
  "support",
  "gatherer",
];

const partyMemberRoleLabels: Record<PartyMemberRole, string> = {
  defender: "Defender",
  fighter: "Fighter",
  support: "Support",
  gatherer: "Gatherer",
  none: "None / Unassigned",
};

const classPathLabels: Record<ClassPath, string> = {
  honor: "Honor Path",
  primal: "Primal Path",
  arcane: "Arcane Path",
  holy: "Holy Path",
};

const partyMenuSectionLabels: Record<PartyMenuSection, string> = {
  stats: "Stats",
  equipment: "Equipment",
  skills: "Skills",
  skillPreferences: "Skill Preferences",
};

const partyMenuSections: PartyMenuSection[] = [
  "stats",
  "equipment",
  "skills",
  "skillPreferences",
];

const partyManagementSectionLabels: Record<PartyManagementSection, string> = {
  role: "Role Select",
  partyOrder: "Party Order",
  formation: "Formation",
  behaviorSettings: "Behavior Settings",
};

const partyManagementSections: PartyManagementSection[] = [
  "role",
  "partyOrder",
  "formation",
  "behaviorSettings",
];

const partyCompanionSlotCount = 5;

const primaryStatLabels: Record<PrimaryStatId, string> = {
  strength: "Strength",
  dexterity: "Dexterity",
  constitution: "Constitution",
  intelligence: "Intelligence",
  wisdom: "Wisdom",
};

const primaryStatIds: PrimaryStatId[] = [
  "strength",
  "dexterity",
  "constitution",
  "intelligence",
  "wisdom",
];

const primaryStatDescriptions: Record<PrimaryStatId, string> = {
  strength: "Increases physical attack and block.",
  dexterity: "Increases accuracy, evasion, and helps attack.",
  constitution: "Increases max HP, defense, block, and health regen.",
  intelligence: "Increases magic power and helps healing and magic defense.",
  wisdom: "Increases healing power, magic defense, and helps magic power, accuracy, and defense.",
};

type DerivedStatId =
  | "health"
  | keyof ReturnType<typeof getCompanionDerivedStats>
  | "gatherSpeed";

const derivedStatDescriptions: Record<DerivedStatId, string> = {
  health: "Increases survivability; based mainly on Constitution and level.",
  attack: "Affects physical damage; based mainly on Strength, then Dexterity.",
  defense: "Mitigates physical damage; based mainly on Constitution, then Wisdom.",
  maxHealth: "Increases survivability; based mainly on Constitution and level.",
  evasion: "Helps avoid incoming attacks; based on Dexterity.",
  block: "Can reduce physical hits; based mainly on Constitution, then Strength.",
  magicPower: "Affects magic damage; based mainly on Intelligence, then Wisdom.",
  healingPower: "Affects healing output; based mainly on Wisdom, then Intelligence.",
  magicDefense: "Mitigates magic damage; based mainly on Wisdom, then Intelligence.",
  accuracy: "Helps attacks connect; based mainly on Dexterity, then Wisdom.",
  criticalChance: "Chance for stronger hits; currently base and equipment driven.",
  criticalDamage: "Strength of critical hits; currently base and equipment driven.",
  healthRegen: "Passive recovery; based mainly on Constitution.",
  gatherSpeed: "Affects gathering progress; based on companion gather speed and effects.",
};

function getCharacterXpText(member: Companion): string {
  const progress = getCharacterXpProgress(member);

  if (progress.isMaxLevel) {
    return "MAX";
  }

  return `${progress.xp}/${progress.xpToNextLevel} XP`;
}

function getCompanionLabel(member: Companion): string {
  const companionNumber = companionIds.indexOf(member.id) + 1;

  return companionNumber > 0 ? `C${companionNumber}` : member.id;
}

function getOrderedMenuMembers(members: Companion[]): Companion[] {
  return [...members].sort(
    (a, b) => a.partyOrder - b.partyOrder || a.id.localeCompare(b.id),
  );
}

function getRoleAccentClass(role: PartyMemberRole): string {
  return `role-accent-${role}`;
}

export function PartyMenuPanel({
  activeSection,
  inventory,
  members,
  currentTime,
  selectedCompanionId,
  totalPartyLevel,
  onAllocateStatPoint,
  onAssignFood,
  onEquipEquipment,
  onEquipFlask,
  onSelectCompanion,
  onSelectSection,
  onUnequipEquipment,
  onUnequipFlask,
}: {
  activeSection: PartyMenuSection;
  inventory: PartyInventory;
  members: Companion[];
  currentTime: number;
  selectedCompanionId: string | null;
  totalPartyLevel: number;
  onAllocateStatPoint: (companionId: string, statId: PrimaryStatId) => void;
  onAssignFood: (companionId: string, itemId: ItemId | null) => void;
  onEquipEquipment: (
    companionId: string,
    itemId: ItemId,
    targetSlot: EquipmentSlot,
  ) => void;
  onEquipFlask: (companionId: string, itemId: ItemId) => void;
  onSelectCompanion: (companionId: string) => void;
  onSelectSection: (section: PartyMenuSection) => void;
  onUnequipEquipment: (companionId: string, targetSlot: EquipmentSlot) => void;
  onUnequipFlask: (companionId: string) => void;
}) {
  const orderedMembers = getOrderedMenuMembers(members);
  const selectedMember =
    orderedMembers.find((member) => member.id === selectedCompanionId) ?? null;

  return (
    <section className="party-menu-panel" aria-label="Party">
      <h2>Party</h2>
      <CompanionMenuList
        layout="horizontal"
        members={orderedMembers}
        selectedCompanionId={selectedCompanionId}
        showEmptySlots={true}
        totalPartyLevel={totalPartyLevel}
        onSelectCompanion={onSelectCompanion}
      />
      <nav className="party-submenu-tabs" aria-label="Party sections">
        {partyMenuSections.map((section) => (
          <button
            key={section}
            className={activeSection === section ? "active" : ""}
            onClick={() => onSelectSection(section)}
            type="button"
          >
            {partyMenuSectionLabels[section]}
          </button>
        ))}
      </nav>
      <div className="party-selected-summary">
        {selectedMember ? (
          <PartyMenuSectionPanel
            activeSection={activeSection}
            currentTime={currentTime}
            inventory={inventory}
            member={selectedMember}
            onAllocateStatPoint={onAllocateStatPoint}
            onAssignFood={onAssignFood}
            onEquipEquipment={onEquipEquipment}
            onEquipFlask={onEquipFlask}
            onUnequipEquipment={onUnequipEquipment}
            onUnequipFlask={onUnequipFlask}
          />
        ) : (
          <span className="party-menu-empty">Select a companion</span>
        )}
      </div>
    </section>
  );
}

function PartyMenuSectionPanel({
  activeSection,
  currentTime,
  inventory,
  member,
  onEquipEquipment,
  onAllocateStatPoint,
  onAssignFood,
  onEquipFlask,
  onUnequipEquipment,
  onUnequipFlask,
}: {
  activeSection: PartyMenuSection;
  currentTime: number;
  inventory: PartyInventory;
  member: Companion;
  onEquipEquipment: (
    companionId: string,
    itemId: ItemId,
    targetSlot: EquipmentSlot,
  ) => void;
  onAllocateStatPoint: (companionId: string, statId: PrimaryStatId) => void;
  onAssignFood: (companionId: string, itemId: ItemId | null) => void;
  onEquipFlask: (companionId: string, itemId: ItemId) => void;
  onUnequipEquipment: (companionId: string, targetSlot: EquipmentSlot) => void;
  onUnequipFlask: (companionId: string) => void;
}) {
  if (activeSection === "stats") {
    return (
      <StatsSection
        member={member}
        onAllocateStatPoint={onAllocateStatPoint}
      />
    );
  }

  if (activeSection === "equipment") {
    return (
      <PartyEquipmentSection
        currentTime={currentTime}
        inventory={inventory}
        member={member}
        onAssignFood={onAssignFood}
        onEquipEquipment={onEquipEquipment}
        onEquipFlask={onEquipFlask}
        onUnequipEquipment={onUnequipEquipment}
        onUnequipFlask={onUnequipFlask}
      />
    );
  }

  if (activeSection === "skills") {
    return <PartySkillsSection member={member} />;
  }

  return (
    <PlaceholderSection title="Skill Preferences">
      Skill Preferences is a future-facing placeholder and does not change skill
      behavior yet.
    </PlaceholderSection>
  );
}

function CompanionSkillSummary({
  member,
  skills,
}: {
  member: Companion;
  skills: SkillDefinition[];
}) {
  const orderedSkills = skills
    .map((skill, index) => ({
      index,
      score: getSkillRoleScore(member.role, skill.tags),
      skill,
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index);

  return (
    <div className="companion-skill-summary" aria-label="Companion skills">
      <span className="equipment-section-label">Skills</span>
      {skills.length > 0 ? (
        <div className="companion-skill-list">
          {orderedSkills.map(({ score, skill }) => (
            <div key={skill.id} className="companion-skill-row">
              <div>
                <strong>{skill.displayName}</strong>
                <span>{getSkillEffectSummary(skill)}</span>
              </div>
              <dl>
                <div>
                  <dt>Range</dt>
                  <dd>{skill.range}</dd>
                </div>
                <div>
                  <dt>Role Score</dt>
                  <dd>{score}</dd>
                </div>
              </dl>
              <span className="companion-skill-tags">
                {skill.tags.join(", ")}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <span className="party-menu-empty">No skills for this class</span>
      )}
    </div>
  );
}

function getSkillEffectSummary(skill: SkillDefinition): string {
  const { effect } = skill;

  if (effect.type === "damage") {
    return `Deals ${Math.round(effect.powerMultiplier * 100)}% ${effect.damageType} damage.`;
  }

  if (effect.type === "lungeDamage") {
    return `Lunges ${effect.lungeDistance} spaces and deals ${Math.round(effect.powerMultiplier * 100)}% ${effect.damageType} damage.`;
  }

  if (effect.type === "sweepingDamage") {
    return `Deals ${Math.round(effect.mainPowerMultiplier * 100)}% ${effect.damageType} damage and ${Math.round(effect.splashPowerMultiplier * 100)}% splash damage.`;
  }

  if (effect.type === "taunt") {
    return effect.powerMultiplier && effect.powerMultiplier > 0
      ? `Pulls attention and deals ${Math.round(effect.powerMultiplier * 100)}% ${effect.damageType ?? "physical"} damage.`
      : "Pulls enemy attention.";
  }

  if (effect.type === "mark") {
    return `Marks a target for +${effect.bonusDamage} damage.`;
  }

  if (effect.type === "selfBuff") {
    return `Self +${effect.bonusDamage} damage.`;
  }

  if (effect.type === "allyBuff") {
    return `Ally +${effect.bonusDamage} damage.`;
  }

  if (effect.type === "gatherBuff") {
    return `Self +${effect.bonusGatherSpeed} gather speed.`;
  }

  if (effect.type === "quickStep") {
    return `Moves ${effect.distance} space.`;
  }

  if (effect.type === "shieldBlock") {
    return `Blocks ${effect.blocks} hit.`;
  }

  if (effect.type === "bind") {
    return "Binds an enemy briefly.";
  }

  if (effect.type === "heal") {
    return `Heals ${Math.round(effect.powerMultiplier * 100)}% healing power.`;
  }

  return `Heals ${Math.round(effect.powerMultiplier * 100)}% healing power at ${effect.hpCost} HP cost.`;
}

function CompanionMenuList({
  layout = "vertical",
  members,
  selectedCompanionId,
  showEmptySlots = false,
  totalPartyLevel = 0,
  onSelectCompanion,
}: {
  layout?: "vertical" | "horizontal";
  members: Companion[];
  selectedCompanionId: string | null;
  showEmptySlots?: boolean;
  totalPartyLevel?: number;
  onSelectCompanion: (companionId: string) => void;
}) {
  const slots = showEmptySlots
    ? Array.from({ length: partyCompanionSlotCount }, (_, index) => ({
        member: members[index] ?? null,
        slotNumber: index + 1,
      }))
    : members.map((member, index) => ({
        member,
        slotNumber: index + 1,
      }));

  return (
    <div className={`party-companion-list party-companion-list-${layout}`}>
      {slots.length > 0 ? (
        slots.map(({ member, slotNumber }) => {
          if (!member) {
            const unlockRequirement = getPartySizeUnlockRequirement(slotNumber);
            const isLocked =
              unlockRequirement !== null && totalPartyLevel < unlockRequirement;

            return (
              <div
                key={`empty-slot-${slotNumber}`}
                className="party-companion-list-item"
              >
                <button
                  className={`party-companion-card party-companion-card-empty${
                    isLocked ? " locked" : ""
                  }`}
                  disabled
                  type="button"
                >
                  <span className="party-companion-card-header">
                    <strong>Slot {slotNumber}</strong>
                  </span>
                  <span className="party-companion-card-detail">Empty Slot</span>
                  <span className="party-companion-xp-text">
                    {isLocked
                      ? `Unlocks at Total Party Level ${unlockRequirement}`
                      : "No companion assigned"}
                  </span>
                </button>
              </div>
            );
          }

          const characterXpProgress = getCharacterXpProgress(member);
          const isSelected = member.id === selectedCompanionId;
          const xpToNextLevelText =
            characterXpProgress.isMaxLevel ||
            characterXpProgress.xpToNextLevel === null
              ? "Max level"
              : `${characterXpProgress.xpToNextLevel - characterXpProgress.xp} XP to next level`;

          return (
            <div key={member.id} className="party-companion-list-item">
              <button
                className={`party-companion-card${
                  isSelected ? " selected" : ""
                }`}
                onClick={() => onSelectCompanion(member.id)}
                type="button"
              >
                <span className="party-companion-card-header">
                  <strong>{getCompanionLabel(member)}</strong>
                  <span
                    className={`role-dot ${getRoleAccentClass(member.role)}`}
                    title={partyMemberRoleLabels[member.role]}
                  />
                </span>
                <span className="party-companion-card-detail">
                  Level {member.characterLevel} |{" "}
                  {partyMemberRoleLabels[member.role]}
                </span>
                <span
                  className={`party-menu-xp-bar${
                    characterXpProgress.isMaxLevel ? " xp-bar-max" : ""
                  }`}
                  title={`Character XP ${getCharacterXpText(member)}`}
                >
                  <span style={{ width: `${characterXpProgress.percent}%` }} />
                </span>
                <span className="party-companion-xp-text">
                  {xpToNextLevelText}
                </span>
              </button>
            </div>
          );
        })
      ) : (
        <span className="party-menu-empty">No companions in party</span>
      )}
    </div>
  );
}

export function PartyManagementPanel({
  activeSection,
  leaderId,
  members,
  selectedCompanionId,
  totalPartyLevel,
  onChangeLeader,
  onChangeConsumableBehavior,
  onChangeRole,
  onSelectCompanion,
  onSelectSection,
  onMovePartyOrder,
}: {
  activeSection: PartyManagementSection;
  leaderId: string;
  members: Companion[];
  selectedCompanionId: string | null;
  totalPartyLevel: number;
  onChangeLeader: (companionId: string) => void;
  onChangeConsumableBehavior: (
    companionId: string,
    update: Partial<Companion["consumableBehavior"]>,
  ) => void;
  onChangeRole: (companionId: string, role: PartyMemberRole) => void;
  onSelectCompanion: (companionId: string) => void;
  onSelectSection: (section: PartyManagementSection) => void;
  onMovePartyOrder: (companionId: string, direction: "up" | "down") => void;
}) {
  const orderedMembers = getOrderedMenuMembers(members);
  const selectedMember =
    orderedMembers.find((member) => member.id === selectedCompanionId) ?? null;

  return (
    <section className="party-management-panel" aria-label="Party Management">
      <h2>Party Management</h2>
      <div className="party-management-detail">
        <div className="party-management-section-row">
          <nav
            className="party-management-sections"
            aria-label="Party management sections"
          >
            {partyManagementSections.map((section) => (
              <button
                key={section}
                className={activeSection === section ? "active" : ""}
                onClick={() => onSelectSection(section)}
                type="button"
              >
                {partyManagementSectionLabels[section]}
              </button>
            ))}
          </nav>
          {selectedMember ? (
            <LeadershipHeaderAction
              currentLabel="Is Leader"
              leaderId={leaderId}
              member={selectedMember}
              onChangeLeader={onChangeLeader}
            />
          ) : null}
        </div>
        <CompanionMenuList
          layout="horizontal"
          members={orderedMembers}
          selectedCompanionId={selectedCompanionId}
          showEmptySlots={true}
          totalPartyLevel={totalPartyLevel}
          onSelectCompanion={onSelectCompanion}
        />
        {selectedMember ? (
          <PartyManagementSectionPanel
            activeSection={activeSection}
            leaderId={leaderId}
            member={selectedMember}
            members={orderedMembers}
            onChangeLeader={onChangeLeader}
            onChangeConsumableBehavior={onChangeConsumableBehavior}
            onChangeRole={onChangeRole}
            onMovePartyOrder={onMovePartyOrder}
          />
        ) : (
          <span className="party-menu-empty">No companion selected</span>
        )}
      </div>
    </section>
  );
}

function LeadershipHeaderAction({
  currentLabel = "Current Leader",
  leaderId,
  member,
  onChangeLeader,
}: {
  currentLabel?: string;
  leaderId: string;
  member: Companion;
  onChangeLeader: (companionId: string) => void;
}) {
  if (member.id === leaderId) {
    return (
      <span className="leadership-status leadership-current">
        {currentLabel}
      </span>
    );
  }

  if (member.state === "dead") {
    return (
      <span className="leadership-status leadership-unavailable">
        Leader Unavailable
      </span>
    );
  }

  return (
    <button
      className="leadership-action-button"
      onClick={() => onChangeLeader(member.id)}
      type="button"
    >
      Make Leader
    </button>
  );
}

function PartyManagementSectionPanel({
  activeSection,
  leaderId,
  member,
  members,
  onChangeLeader,
  onChangeConsumableBehavior,
  onChangeRole,
  onMovePartyOrder,
}: {
  activeSection: PartyManagementSection;
  leaderId: string;
  member: Companion;
  members: Companion[];
  onChangeLeader: (companionId: string) => void;
  onChangeConsumableBehavior: (
    companionId: string,
    update: Partial<Companion["consumableBehavior"]>,
  ) => void;
  onChangeRole: (companionId: string, role: PartyMemberRole) => void;
  onMovePartyOrder: (companionId: string, direction: "up" | "down") => void;
}) {
  if (activeSection === "role") {
    return <RoleSelectSection member={member} onChangeRole={onChangeRole} />;
  }

  if (activeSection === "partyOrder") {
    return (
      <PartyOrderSection
        leaderId={leaderId}
        member={member}
        members={members}
        onChangeLeader={onChangeLeader}
        onMovePartyOrder={onMovePartyOrder}
      />
    );
  }

  if (activeSection === "behaviorSettings") {
    return (
      <BehaviorSettingsSection
        member={member}
        onChangeConsumableBehavior={onChangeConsumableBehavior}
      />
    );
  }

  return (
    <PlaceholderSection title={partyManagementSectionLabels[activeSection]}>
      {partyManagementSectionLabels[activeSection]} is a future-facing
      placeholder and does not change party behavior yet.
    </PlaceholderSection>
  );
}

function PartyEquipmentSection({
  currentTime,
  inventory,
  member,
  onAssignFood,
  onEquipEquipment,
  onEquipFlask,
  onUnequipEquipment,
  onUnequipFlask,
}: {
  currentTime: number;
  inventory: PartyInventory;
  member: Companion;
  onAssignFood: (companionId: string, itemId: ItemId | null) => void;
  onEquipEquipment: (
    companionId: string,
    itemId: ItemId,
    targetSlot: EquipmentSlot,
  ) => void;
  onEquipFlask: (companionId: string, itemId: ItemId) => void;
  onUnequipEquipment: (companionId: string, targetSlot: EquipmentSlot) => void;
  onUnequipFlask: (companionId: string) => void;
}) {
  const [selectedEquipmentSlot, setSelectedEquipmentSlot] =
    useState<EquipmentSlot | null>(null);
  const selectedSlot = selectedEquipmentSlot ?? "mainHand";
  const usableEquipmentSlots = inventory.slots.filter((slot) =>
    canShowInventoryItemForSlot(
      member,
      getItemDefinition(slot.itemId),
      selectedSlot,
    )
  );
  const primaryStatModifiers = getCompanionEquipmentPrimaryStatModifiers(member);
  const statModifiers = getCompanionEquipmentStatModifiers(member);
  const selectedItemId = member.equipment[selectedSlot];
  const selectedItemDefinition = selectedItemId
    ? getItemDefinition(selectedItemId)
    : null;
  const flaskInventorySlots = getGroupedConsumableInventorySlots(
    inventory,
    isFlaskItemDefinition,
  );
  const foodInventorySlots = getGroupedConsumableInventorySlots(
    inventory,
    isFoodItemDefinition,
  );
  const equippedFlask = member.consumables.flask;
  const equippedFlaskDefinition = equippedFlask
    ? getItemDefinition(equippedFlask.itemId)
    : null;
  const assignedFoodDefinition = member.consumables.foodItemId
    ? getItemDefinition(member.consumables.foodItemId)
    : null;
  const assignedFoodCount = member.consumables.foodItemId
    ? inventory.slots
        .filter((slot) => slot.itemId === member.consumables.foodItemId)
        .reduce((total, slot) => total + slot.quantity, 0)
    : 0;
  const cooldownRemainingMs = getConsumableCooldownRemainingMs(
    member,
    currentTime,
  );

  return (
    <section className="management-section-card party-equipment-section" aria-label="Equipment">
      <h3>Equipment</h3>
      <span className="equipment-section-label">Equipped Slots</span>
      <div className="equipment-slot-picker">
        {EQUIPMENT_SLOTS.map((slot) => {
          const itemId = member.equipment[slot];
          const itemDefinition = itemId ? getItemDefinition(itemId) : null;
          const iconSrc = itemId
            ? INVENTORY_ITEM_ICON_SRC[itemId]
            : EMPTY_EQUIPMENT_SLOT_ICON_SRC[slot];

          return (
            <button
              key={slot}
              className={selectedEquipmentSlot === slot ? "active" : ""}
              onClick={() => setSelectedEquipmentSlot(slot)}
              type="button"
            >
              {iconSrc ? (
                <img
                  alt=""
                  aria-hidden="true"
                  className="equipment-slot-icon"
                  src={iconSrc}
                />
              ) : null}
              <span>{EQUIPMENT_SLOT_LABELS[slot]}</span>
              <strong>{itemDefinition?.displayName ?? "None"}</strong>
            </button>
          );
        })}
      </div>
      <div className="equipment-consumable-grid">
        <div className="equipment-consumable-card">
          <span className="equipment-section-label">Flask Slot</span>
          {equippedFlask ? (
            <span className="equipment-inventory-item-name">
              {INVENTORY_ITEM_ICON_SRC[equippedFlask.itemId] ? (
                <img
                  alt=""
                  aria-hidden="true"
                  className="equipment-inventory-item-icon"
                  src={INVENTORY_ITEM_ICON_SRC[equippedFlask.itemId]}
                />
              ) : null}
              <strong>{equippedFlaskDefinition?.displayName ?? "None"}</strong>
            </span>
          ) : (
            <strong>None</strong>
          )}
          <span>
            {equippedFlask && equippedFlaskDefinition
              ? `${equippedFlask.charges}/${equippedFlaskDefinition.maxCharges ?? 0} charges | ${cooldownRemainingMs > 0 ? `${Math.ceil(cooldownRemainingMs / 1000)}s cooldown` : "Ready"}`
              : "No flask equipped"}
          </span>
          <div className="equipment-inventory-list">
            {flaskInventorySlots.length > 0 ? (
              flaskInventorySlots.map((slot) => {
                const itemDefinition = getItemDefinition(slot.itemId);

                return (
                  <div
                    className="equipment-inventory-row"
                    key={`flask-${slot.itemId}`}
                  >
                    <span className="equipment-inventory-item-name">
                      {INVENTORY_ITEM_ICON_SRC[slot.itemId] ? (
                        <img
                          alt=""
                          aria-hidden="true"
                          className="equipment-inventory-item-icon"
                          src={INVENTORY_ITEM_ICON_SRC[slot.itemId]}
                        />
                      ) : null}
                      <span>{itemDefinition.displayName} x{slot.quantity}</span>
                    </span>
                    <span>{getConsumableMetadataText(itemDefinition)}</span>
                    <button
                      onClick={() => onEquipFlask(member.id, slot.itemId)}
                      type="button"
                    >
                      Equip Flask
                    </button>
                  </div>
                );
              })
            ) : (
              <span className="party-menu-empty">No flasks in inventory</span>
            )}
          </div>
          {equippedFlask ? (
            <button onClick={() => onUnequipFlask(member.id)} type="button">
              Unequip Flask
            </button>
          ) : null}
        </div>
        <div className="equipment-consumable-card">
          <span className="equipment-section-label">Food Assignment</span>
          <strong>{assignedFoodDefinition?.displayName ?? "None"}</strong>
          <span>
            {assignedFoodDefinition
              ? `${assignedFoodCount} available | ${getActiveFoodBuffText(member, currentTime)}`
              : "No food assigned"}
          </span>
          <div className="equipment-inventory-list">
            {foodInventorySlots.length > 0 ? (
              foodInventorySlots.map((slot) => {
                const itemDefinition = getItemDefinition(slot.itemId);
                const levelRequirementMet =
                  !itemDefinition.levelRequirement ||
                  member.characterLevel >= itemDefinition.levelRequirement;

                return (
                  <div
                    className="equipment-inventory-row"
                    key={`food-${slot.itemId}`}
                  >
                    <span className="equipment-inventory-item-name">
                      {INVENTORY_ITEM_ICON_SRC[slot.itemId] ? (
                        <img
                          alt=""
                          aria-hidden="true"
                          className="equipment-inventory-item-icon"
                          src={INVENTORY_ITEM_ICON_SRC[slot.itemId]}
                        />
                      ) : null}
                      <span>{itemDefinition.displayName} x{slot.quantity}</span>
                    </span>
                    <span>{getConsumableMetadataText(itemDefinition)}</span>
                    <button
                      disabled={!levelRequirementMet}
                      onClick={() => onAssignFood(member.id, slot.itemId)}
                      type="button"
                    >
                      {levelRequirementMet
                        ? "Assign Food"
                        : `Requires Level ${itemDefinition.levelRequirement}`}
                    </button>
                  </div>
                );
              })
            ) : (
              <span className="party-menu-empty">No food in inventory</span>
            )}
          </div>
          {assignedFoodDefinition ? (
            <button onClick={() => onAssignFood(member.id, null)} type="button">
              Clear Food
            </button>
          ) : null}
        </div>
      </div>
      <StatModifierSummary
        primaryStatModifiers={primaryStatModifiers}
        statModifiers={statModifiers}
      />
      {selectedEquipmentSlot ? (
        <div className="equipment-popover-backdrop" role="presentation">
          <aside className="equipment-popover" aria-label="Equipment slot options">
            <div className="equipment-popover-header">
              <div>
                <span className="equipment-section-label">
                  Equip {EQUIPMENT_SLOT_LABELS[selectedEquipmentSlot]}
                </span>
                <strong>
                  {selectedItemDefinition?.displayName ?? "Empty Slot"}
                </strong>
              </div>
              <button onClick={() => setSelectedEquipmentSlot(null)} type="button">
                Close
              </button>
            </div>
            <div className="equipment-inventory-list">
              {usableEquipmentSlots.length > 0 ? (
                usableEquipmentSlots.map((slot, index) => {
                  const itemDefinition = getItemDefinition(slot.itemId);

                  return (
                    <EquipmentInventoryRow
                      key={`${slot.itemId}-${index}`}
                      itemDefinition={itemDefinition}
                      itemId={slot.itemId}
                      member={member}
                      onEquipEquipment={(companionId, itemId, targetSlot) => {
                        onEquipEquipment(companionId, itemId, targetSlot);
                        setSelectedEquipmentSlot(null);
                      }}
                      targetSlot={selectedEquipmentSlot}
                    />
                  );
                })
              ) : (
                <span className="party-menu-empty">
                  No usable inventory items for this slot
                </span>
              )}
            </div>
            <div className="equipment-equipped-actions">
              {selectedItemDefinition ? (
                <button
                  onClick={() => {
                    onUnequipEquipment(member.id, selectedEquipmentSlot);
                    setSelectedEquipmentSlot(null);
                  }}
                  type="button"
                >
                  Unequip {selectedItemDefinition.displayName}
                </button>
              ) : (
                <span className="party-menu-empty">
                  {EQUIPMENT_SLOT_LABELS[selectedEquipmentSlot]} is empty
                </span>
              )}
            </div>
          </aside>
        </div>
      ) : null}
    </section>
  );
}

function EquipmentInventoryRow({
  itemDefinition,
  itemId,
  member,
  onEquipEquipment,
  targetSlot,
}: {
  itemDefinition: ItemDefinition;
  itemId: ItemId;
  member: Companion;
  onEquipEquipment: (
    companionId: string,
    itemId: ItemId,
    targetSlot: EquipmentSlot,
  ) => void;
  targetSlot: EquipmentSlot;
}) {
  const validation = validateEquipmentItemForCompanion(
    member,
    itemDefinition,
    targetSlot,
  );
  const iconSrc = INVENTORY_ITEM_ICON_SRC[itemId];

  return (
    <div className="equipment-inventory-row">
      <span className="equipment-inventory-item-name">
        {iconSrc ? (
          <img
            alt=""
            aria-hidden="true"
            className="equipment-inventory-item-icon"
            src={iconSrc}
          />
        ) : null}
        <span>
          {itemDefinition.displayName} |{" "}
          {itemDefinition.equipmentType
            ? EQUIPMENT_TYPE_LABELS[itemDefinition.equipmentType]
            : "Equipment"}
        </span>
      </span>
      <span>{getEquipmentMetadataText(itemDefinition)}</span>
      <span>{getItemModifierText(itemDefinition)}</span>
      <span>{getEquipmentValidityText(member, itemDefinition, targetSlot)}</span>
      <div>
        <button
          disabled={!validation.ok}
          onClick={() => onEquipEquipment(member.id, itemId, targetSlot)}
          type="button"
        >
          Equip to {EQUIPMENT_SLOT_LABELS[targetSlot]}
        </button>
      </div>
    </div>
  );
}

function StatModifierSummary({
  primaryStatModifiers,
  statModifiers,
}: {
  primaryStatModifiers: CompanionPrimaryStatModifiers;
  statModifiers: EquipmentStatModifiers;
}) {
  const primaryEntries = Object.entries(primaryStatModifiers)
    .filter(([, value]) => value !== undefined && value !== 0)
    .map(
      ([stat, value]) =>
        `${primaryStatLabels[stat as PrimaryStatId]} ${formatModifier(value)}`,
    );
  const derivedEntries = Object.entries(statModifiers)
    .filter(([, value]) => value !== undefined && value !== 0)
    .map(([stat, value]) => `${formatStatName(stat)} ${formatModifier(value)}`);
  const entries = [...primaryEntries, ...derivedEntries];

  return (
    <div className="equipment-stat-summary">
      {entries.length > 0
        ? entries.map((entry) => <span key={entry}>{entry}</span>)
        : "No equipment stat modifiers"}
    </div>
  );
}

function getEquipmentMetadataText(itemDefinition: ItemDefinition): string {
  if (itemDefinition.category !== "equipment") {
    return "";
  }

  return [
    itemDefinition.armorFamily
      ? ARMOR_FAMILY_LABELS[itemDefinition.armorFamily]
      : null,
    itemDefinition.tier ? `Tier ${itemDefinition.tier}` : null,
    itemDefinition.levelRequirement
      ? `Level ${itemDefinition.levelRequirement}+`
      : null,
  ]
    .filter(Boolean)
    .join(" | ");
}

function getItemModifierText(itemDefinition: ItemDefinition): string {
  const primaryStats = Object.entries(itemDefinition.primaryStatModifiers ?? {})
    .filter(([, value]) => value !== undefined && value !== 0)
    .map(
      ([stat, value]) =>
        `${primaryStatLabels[stat as PrimaryStatId]} ${formatModifier(value)}`,
    );
  const derivedStats = Object.entries(itemDefinition.statModifiers ?? {})
    .filter(([, value]) => value !== undefined && value !== 0)
    .map(([stat, value]) => `${formatStatName(stat)} ${formatModifier(value)}`);
  const stats = [...primaryStats, ...derivedStats];

  return stats.length > 0 ? stats.join(", ") : "Stats none";
}

function getConsumableMetadataText(itemDefinition: ItemDefinition): string {
  const parts = [
    itemDefinition.levelRequirement
      ? `Level ${itemDefinition.levelRequirement}+`
      : null,
    itemDefinition.useDurationMs
      ? `${itemDefinition.useDurationMs / 1000}s use`
      : null,
    itemDefinition.cooldownMs
      ? `${itemDefinition.cooldownMs / 1000}s cooldown`
      : null,
    itemDefinition.healPercent
      ? `Heals ${Math.round(itemDefinition.healPercent * 100)}%`
      : null,
    getItemModifierText(itemDefinition) !== "Stats none"
      ? getItemModifierText(itemDefinition)
      : null,
  ];

  return parts.filter(Boolean).join(" | ");
}

function getGroupedConsumableInventorySlots(
  inventory: PartyInventory,
  predicate: (itemDefinition: ItemDefinition) => boolean,
): { itemId: ItemId; quantity: number }[] {
  const quantityByItemId = new Map<ItemId, number>();

  for (const slot of inventory.slots) {
    const itemDefinition = getItemDefinition(slot.itemId);

    if (!predicate(itemDefinition)) {
      continue;
    }

    quantityByItemId.set(
      slot.itemId,
      (quantityByItemId.get(slot.itemId) ?? 0) + slot.quantity,
    );
  }

  return [...quantityByItemId.entries()].map(([itemId, quantity]) => ({
    itemId,
    quantity,
  }));
}

function getActiveFoodBuffText(member: Companion, currentTime: number): string {
  const foodBuff = member.consumableBuffs.food;

  if (!foodBuff || foodBuff.expiresAt <= currentTime) {
    return "No active food buff";
  }

  return `${Math.ceil((foodBuff.expiresAt - currentTime) / 1000)}s food buff`;
}

function getActiveFoodRemainingSeconds(
  member: Companion,
  currentTime: number,
): number | null {
  const foodBuff = member.consumableBuffs.food;

  if (!foodBuff || foodBuff.expiresAt <= currentTime) {
    return null;
  }

  return Math.ceil((foodBuff.expiresAt - currentTime) / 1000);
}

function getTargetSlotsForItem(itemDefinition: ItemDefinition): EquipmentSlot[] {
  if (itemDefinition.equipmentKind === "accessory") {
    return ["accessory1", "accessory2"];
  }

  return itemDefinition.equipmentSlot ? [itemDefinition.equipmentSlot] : [];
}

function canShowInventoryItemForSlot(
  member: Companion,
  itemDefinition: ItemDefinition,
  targetSlot: EquipmentSlot,
): boolean {
  return validateEquipmentItemForCompanion(
    member,
    itemDefinition,
    targetSlot,
  ).ok;
}

function getEquipmentValidityText(
  member: Companion,
  itemDefinition: ItemDefinition,
  forcedTargetSlot?: EquipmentSlot,
): string {
  const targetSlot = forcedTargetSlot ?? getTargetSlotsForItem(itemDefinition)[0];

  if (!targetSlot) {
    return "Invalid: no target slot";
  }

  const result = validateEquipmentItemForCompanion(
    member,
    itemDefinition,
    targetSlot,
  );

  return result.ok ? "Valid" : `Invalid: ${formatReason(result.reason)}`;
}

function formatReason(reason: string): string {
  return reason.split("_").join(" ");
}

function formatStatName(stat: string): string {
  return stat.replace(/[A-Z]/g, (letter) => ` ${letter}`).toLowerCase();
}

function formatModifier(value: number): string {
  return `${value > 0 ? "+" : ""}${value}`;
}

function RoleSelectSection({
  member,
  onChangeRole,
}: {
  member: Companion;
  onChangeRole: (companionId: string, role: PartyMemberRole) => void;
}) {
  return (
    <section className="management-section-card" aria-label="Role Select">
      <h3>Role Select</h3>
      <div className="role-select-grid">
        {partyMemberRoleOptions.map((role) => (
          <button
            key={role}
            className={`role-select-button ${getRoleAccentClass(role)}${
              member.role === role ? " active" : ""
            }`}
            onClick={() => onChangeRole(member.id, role)}
            type="button"
          >
            <span className={`role-dot ${getRoleAccentClass(role)}`} />
            {partyMemberRoleLabels[role]}
          </button>
        ))}
      </div>
    </section>
  );
}

function BehaviorSettingsSection({
  member,
  onChangeConsumableBehavior,
}: {
  member: Companion;
  onChangeConsumableBehavior: (
    companionId: string,
    update: Partial<Companion["consumableBehavior"]>,
  ) => void;
}) {
  const threshold = member.consumableBehavior.autoFlaskHpThresholdPercent;

  return (
    <section className="management-section-card" aria-label="Behavior Settings">
      <h3>Behavior Settings</h3>
      <div className="behavior-settings-list">
        <label className="behavior-toggle-row">
          <input
            checked={member.consumableBehavior.autoFlaskEnabled}
            onChange={(event) =>
              onChangeConsumableBehavior(member.id, {
                autoFlaskEnabled: event.target.checked,
              })
            }
            type="checkbox"
          />
          <span>Auto-use Flask</span>
        </label>
        <label className="behavior-range-row">
          <span>Flask HP Threshold</span>
          <input
            max={100}
            min={1}
            onChange={(event) =>
              onChangeConsumableBehavior(member.id, {
                autoFlaskHpThresholdPercent: Number(event.target.value),
              })
            }
            type="range"
            value={threshold}
          />
          <input
            max={100}
            min={1}
            onChange={(event) =>
              onChangeConsumableBehavior(member.id, {
                autoFlaskHpThresholdPercent: Number(event.target.value),
              })
            }
            type="number"
            value={threshold}
          />
          <strong>{threshold}%</strong>
        </label>
      </div>
    </section>
  );
}

function PartyOrderSection({
  leaderId,
  member,
  members,
  onChangeLeader,
  onMovePartyOrder,
}: {
  leaderId: string;
  member: Companion;
  members: Companion[];
  onChangeLeader: (companionId: string) => void;
  onMovePartyOrder: (companionId: string, direction: "up" | "down") => void;
}) {
  const selectedIndex = members.findIndex((candidate) => candidate.id === member.id);

  return (
    <section className="management-section-card" aria-label="Party Order">
      <h3>Party Order</h3>
      <div className="party-order-list">
        {members.map((candidate, index) => (
          <div
            key={candidate.id}
            className={`party-order-row${
              candidate.id === member.id ? " selected" : ""
            }`}
          >
            <span>
              {index + 1}. {getCompanionLabel(candidate)}
            </span>
            <span>{partyMemberRoleLabels[candidate.role]}</span>
            {candidate.id === leaderId ? <strong>Leader</strong> : null}
          </div>
        ))}
      </div>
      <div className="equipment-equipped-actions">
        <button
          disabled={selectedIndex <= 0}
          onClick={() => onMovePartyOrder(member.id, "up")}
          type="button"
        >
          Move Up
        </button>
        <button
          disabled={selectedIndex < 0 || selectedIndex >= members.length - 1}
          onClick={() => onMovePartyOrder(member.id, "down")}
          type="button"
        >
          Move Down
        </button>
        <LeadershipHeaderAction
          leaderId={leaderId}
          member={member}
          onChangeLeader={onChangeLeader}
        />
      </div>
    </section>
  );
}

function StatsSection({
  member,
  onAllocateStatPoint,
}: {
  member: Companion;
  onAllocateStatPoint: (companionId: string, statId: PrimaryStatId) => void;
}) {
  const actualStats = getCompanionActualStats(member);
  const derivedStats = getCompanionDerivedStats(member);

  return (
    <section className="management-section-card" aria-label="Stats">
      <div className="menu-section-heading">
        <h3>Stats</h3>
        <span className="available-stat-points">
          Available Stat Points: {member.unspentStatPoints}
        </span>
      </div>
      <div className="base-stat-panel">
        <span className="equipment-section-label">Base Stats</span>
        <dl className="base-stat-grid">
          {primaryStatIds.map((statId) => (
            <div key={statId} title={primaryStatDescriptions[statId]}>
              <dt>{primaryStatLabels[statId]}</dt>
              <dd>{actualStats[statId]}</dd>
              <button
                disabled={member.unspentStatPoints <= 0}
                onClick={() => onAllocateStatPoint(member.id, statId)}
                title={
                  member.unspentStatPoints > 0
                    ? `Allocate 1 point to ${primaryStatLabels[statId]}. ${primaryStatDescriptions[statId]}`
                    : "No stat points available"
                }
                type="button"
              >
                +
              </button>
            </div>
          ))}
        </dl>
      </div>
      <span className="equipment-section-label">Progression</span>
      <dl className="full-stat-grid">
        <div>
          <dt>Level</dt>
          <dd>{member.characterLevel}</dd>
        </div>
        <div>
          <dt>XP</dt>
          <dd>{getCharacterXpText(member)}</dd>
        </div>
        <div>
          <dt>Class</dt>
          <dd>{CLASS_DEFINITIONS[member.classId].displayName}</dd>
        </div>
        <div>
          <dt>Role</dt>
          <dd>{partyMemberRoleLabels[member.role]}</dd>
        </div>
        <div>
          <dt>State</dt>
          <dd>{member.state}</dd>
        </div>
        <div>
          <dt>Party Order</dt>
          <dd>{member.partyOrder}</dd>
        </div>
      </dl>
      <span className="equipment-section-label">Derived Stats</span>
      <dl className="full-stat-grid">
        <div title={derivedStatDescriptions.health}>
          <dt>Health</dt>
          <dd>
            {member.health}/{derivedStats.maxHealth}
          </dd>
        </div>
        <div title={derivedStatDescriptions.attack}>
          <dt>Attack</dt>
          <dd>{derivedStats.attack}</dd>
        </div>
        <div title={derivedStatDescriptions.defense}>
          <dt>Defense</dt>
          <dd>
            {derivedStats.defense} (
            {getDefenseReductionPercent(derivedStats.defense)}%)
          </dd>
        </div>
        <div title={derivedStatDescriptions.magicDefense}>
          <dt>Magic Defense</dt>
          <dd>{derivedStats.magicDefense}</dd>
        </div>
        <div title={derivedStatDescriptions.accuracy}>
          <dt>Accuracy</dt>
          <dd>{derivedStats.accuracy}</dd>
        </div>
        <div title={derivedStatDescriptions.block}>
          <dt>Block</dt>
          <dd>{derivedStats.block}</dd>
        </div>
        <div title={derivedStatDescriptions.evasion}>
          <dt>Evasion</dt>
          <dd>{derivedStats.evasion}</dd>
        </div>
        <div title={derivedStatDescriptions.magicPower}>
          <dt>Magic Power</dt>
          <dd>{derivedStats.magicPower}</dd>
        </div>
        <div title={derivedStatDescriptions.healingPower}>
          <dt>Healing Power</dt>
          <dd>{derivedStats.healingPower}</dd>
        </div>
        <div title={derivedStatDescriptions.criticalChance}>
          <dt>Critical Chance</dt>
          <dd>{Math.round(derivedStats.criticalChance * 100)}%</dd>
        </div>
        <div title={derivedStatDescriptions.criticalDamage}>
          <dt>Critical Damage</dt>
          <dd>{Math.round(derivedStats.criticalDamage * 100)}%</dd>
        </div>
        <div title={derivedStatDescriptions.healthRegen}>
          <dt>Health Regen</dt>
          <dd>{derivedStats.healthRegen}</dd>
        </div>
        <div title={derivedStatDescriptions.gatherSpeed}>
          <dt>Gather Speed</dt>
          <dd>{member.gatherSpeed}</dd>
        </div>
      </dl>
    </section>
  );
}

function PartySkillsSection({ member }: { member: Companion }) {
  const classDefinition = CLASS_DEFINITIONS[member.classId];
  const skills = getSkillsForClass(member.classId);

  return (
    <section className="management-section-card" aria-label="Skills">
      <h3>Skills</h3>
      <nav className="class-skill-tabs" aria-label="Class skills">
        <button className="active" type="button">
          {classDefinition.displayName}
        </button>
      </nav>
      <CompanionSkillSummary member={member} skills={skills} />
    </section>
  );
}

function PlaceholderSection({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <section className="management-section-card" aria-label={title}>
      <h3>{title}</h3>
      <div className="placeholder-box">{children}</div>
    </section>
  );
}

export function CompanionVitalsPanel({
  currentTime,
  members,
}: {
  currentTime: number;
  members: Companion[];
}) {
  if (members.length === 0) {
    return null;
  }

  const orderedMembers = [...members].sort(
    (a, b) => a.partyOrder - b.partyOrder || a.id.localeCompare(b.id),
  );

  return (
    <section className="companion-vitals-panel" aria-label="Companion vitals">
      {orderedMembers.map((member) => {
        const classDefinition = CLASS_DEFINITIONS[member.classId];
        const classPath = classDefinition.path;
        const classPathLabel = classPath ? classPathLabels[classPath] : null;
        const assignedFoodDefinition = member.consumables.foodItemId
          ? getItemDefinition(member.consumables.foodItemId)
          : null;
        const activeFoodRemainingSeconds = getActiveFoodRemainingSeconds(
          member,
          currentTime,
        );
        const activeFoodDefinition =
          activeFoodRemainingSeconds !== null && member.consumableBuffs.food
            ? getItemDefinition(member.consumableBuffs.food.itemId)
            : null;
        const derivedStats = getCompanionDerivedStats(member);
        const healthPercent =
          derivedStats.maxHealth > 0
            ? Math.max(0, Math.min(100, (member.health / derivedStats.maxHealth) * 100))
            : 0;
        const characterXpProgress = getCharacterXpProgress(member);
        const characterXpText = characterXpProgress.isMaxLevel
          ? "MAX"
          : `${characterXpProgress.xp}/${characterXpProgress.xpToNextLevel}`;
        const companionNumber = companionIds.indexOf(member.id) + 1;
        const companionLabel =
          companionNumber > 0 ? `Companion ${companionNumber}` : member.id;
        const portraitSrc = CLASS_PORTRAIT_SRC[member.classId];
        const pathClassName = classPath ?? "beginner";
        const flaskIconSrc = member.consumables.flask
          ? INVENTORY_ITEM_ICON_SRC[member.consumables.flask.itemId]
          : null;
        const flaskDisplayState = getCompanionFlaskDisplayState(
          member,
          currentTime,
        );
        const displayedFoodDefinition =
          activeFoodDefinition ?? assignedFoodDefinition;
        const displayedFoodIconSrc =
          displayedFoodDefinition
            ? INVENTORY_ITEM_ICON_SRC[displayedFoodDefinition.id]
            : null;

        return (
          <article
            key={member.id}
            className={`companion-vitals-card companion-vitals-card-${pathClassName}`}
          >
            <div className="companion-vitals-portrait-frame">
              <img
                alt=""
                className="companion-vitals-portrait"
                draggable={false}
                src={portraitSrc}
              />
            </div>
            <div className="companion-vitals-main">
              <div className="companion-vitals-header">
                <span>{companionLabel}</span>
                <span>Lv {member.characterLevel}</span>
              </div>
              <div className="companion-vitals-class">
                <span>{classDefinition.displayName}</span>
                {classPathLabel ? <span>{classPathLabel}</span> : null}
              </div>
              <div className="companion-vitals-meter-row">
                <span>HP</span>
                <span>
                  {member.health}/{derivedStats.maxHealth}
                </span>
              </div>
              <span
                className="companion-vitals-bar companion-vitals-hp"
                title={`HP ${member.health}/${derivedStats.maxHealth}`}
              >
                <span style={{ width: `${healthPercent}%` }} />
              </span>
              <div className="companion-vitals-meter-row">
                <span>Exp</span>
                <span>{characterXpText}</span>
              </div>
              <span
                className={`companion-vitals-bar companion-vitals-exp${
                  characterXpProgress.isMaxLevel ? " companion-vitals-exp-max" : ""
                }`}
                title={`Exp ${characterXpText}`}
              >
                <span style={{ width: `${characterXpProgress.percent}%` }} />
              </span>
              <div className="companion-vitals-slots">
                <span
                  className="companion-vitals-consumable"
                  title={
                    flaskDisplayState
                      ? `${flaskDisplayState.displayName}: ${flaskDisplayState.usesLeft} uses left${flaskDisplayState.cooldownRemainingMs > 0 ? `, ${Math.ceil(flaskDisplayState.cooldownRemainingMs / 1000)}s cooldown` : ", ready"}`
                      : "No flask equipped"
                  }
                >
                  {flaskDisplayState?.cooldownRemainingMs ? (
                    <span
                      className="companion-vitals-cooldown-fill"
                      style={{
                        width: `${flaskDisplayState.cooldownPercent}%`,
                      }}
                    />
                  ) : null}
                  <span className="companion-vitals-slot-label">Flask</span>
                  <span className="companion-vitals-icon-frame">
                    {flaskIconSrc ? (
                      <img
                        alt=""
                        className="companion-vitals-slot-icon"
                        draggable={false}
                        src={flaskIconSrc}
                      />
                    ) : null}
                    {flaskDisplayState ? (
                      <span className="companion-vitals-uses-badge">
                        {flaskDisplayState.usesLeft}
                      </span>
                    ) : null}
                  </span>
                  <span>
                    {flaskDisplayState
                      ? `${flaskDisplayState.displayName}`
                      : "Empty"}
                  </span>
                </span>
                <span
                  className="companion-vitals-consumable"
                  title={
                    activeFoodRemainingSeconds !== null && displayedFoodDefinition
                      ? `${displayedFoodDefinition.displayName}: ${activeFoodRemainingSeconds}s remaining`
                      : assignedFoodDefinition?.displayName ?? "No food assigned"
                  }
                >
                  <span className="companion-vitals-slot-label">Food:</span>
                  <span className="companion-vitals-icon-frame">
                    {displayedFoodIconSrc ? (
                      <img
                        alt=""
                        className="companion-vitals-slot-icon"
                        draggable={false}
                        src={displayedFoodIconSrc}
                      />
                    ) : null}
                  </span>
                  <span>
                    {activeFoodRemainingSeconds !== null
                      ? `${activeFoodRemainingSeconds}s`
                      : assignedFoodDefinition?.displayName ?? "Empty"}
                  </span>
                </span>
              </div>
            </div>
          </article>
        );
      })}
    </section>
  );
}
