import { useState, type ReactNode } from "react";
import {
  EMPTY_EQUIPMENT_SLOT_ICON_SRC,
  INVENTORY_ITEM_ICON_SRC,
} from "./assetIcons";
import {
  CLASS_DEFINITIONS,
  companionIds,
  EQUIPMENT_SLOT_LABELS,
  EQUIPMENT_SLOTS,
  EQUIPMENT_TYPE_LABELS,
  getCharacterXpProgress,
  getCompanionEquipmentStatModifiers,
  getCompanionActualStats,
  getCompanionDerivedStats,
  getItemDefinition,
  getPartySizeUnlockRequirement,
  getSkillRoleScore,
  getSkillsForClass,
  validateEquipmentItemForCompanion,
  type Companion,
  type EquipmentSlot,
  type EquipmentStatModifiers,
  type ItemDefinition,
  type ItemId,
  type PartyInventory,
  type PartyMemberRole,
  type PrimaryStatId,
  type SkillDefinition,
} from "./game";

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
  selectedCompanionId,
  totalPartyLevel,
  onAllocateStatPoint,
  onEquipEquipment,
  onSelectCompanion,
  onSelectSection,
  onUnequipEquipment,
}: {
  activeSection: PartyMenuSection;
  inventory: PartyInventory;
  members: Companion[];
  selectedCompanionId: string | null;
  totalPartyLevel: number;
  onAllocateStatPoint: (companionId: string, statId: PrimaryStatId) => void;
  onEquipEquipment: (
    companionId: string,
    itemId: ItemId,
    targetSlot: EquipmentSlot,
  ) => void;
  onSelectCompanion: (companionId: string) => void;
  onSelectSection: (section: PartyMenuSection) => void;
  onUnequipEquipment: (companionId: string, targetSlot: EquipmentSlot) => void;
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
            inventory={inventory}
            member={selectedMember}
            onAllocateStatPoint={onAllocateStatPoint}
            onEquipEquipment={onEquipEquipment}
            onUnequipEquipment={onUnequipEquipment}
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
  inventory,
  member,
  onEquipEquipment,
  onAllocateStatPoint,
  onUnequipEquipment,
}: {
  activeSection: PartyMenuSection;
  inventory: PartyInventory;
  member: Companion;
  onEquipEquipment: (
    companionId: string,
    itemId: ItemId,
    targetSlot: EquipmentSlot,
  ) => void;
  onAllocateStatPoint: (companionId: string, statId: PrimaryStatId) => void;
  onUnequipEquipment: (companionId: string, targetSlot: EquipmentSlot) => void;
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
        inventory={inventory}
        member={member}
        onEquipEquipment={onEquipEquipment}
        onUnequipEquipment={onUnequipEquipment}
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
  leaderId,
  member,
  onChangeLeader,
}: {
  leaderId: string;
  member: Companion;
  onChangeLeader: (companionId: string) => void;
}) {
  if (member.id === leaderId) {
    return (
      <span className="leadership-status leadership-current">
        Current Leader
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
  onChangeRole,
  onMovePartyOrder,
}: {
  activeSection: PartyManagementSection;
  leaderId: string;
  member: Companion;
  members: Companion[];
  onChangeLeader: (companionId: string) => void;
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

  return (
    <PlaceholderSection title={partyManagementSectionLabels[activeSection]}>
      {partyManagementSectionLabels[activeSection]} is a future-facing
      placeholder and does not change party behavior yet.
    </PlaceholderSection>
  );
}

function PartyEquipmentSection({
  inventory,
  member,
  onEquipEquipment,
  onUnequipEquipment,
}: {
  inventory: PartyInventory;
  member: Companion;
  onEquipEquipment: (
    companionId: string,
    itemId: ItemId,
    targetSlot: EquipmentSlot,
  ) => void;
  onUnequipEquipment: (companionId: string, targetSlot: EquipmentSlot) => void;
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
  const statModifiers = getCompanionEquipmentStatModifiers(member);
  const selectedItemId = member.equipment[selectedSlot];
  const selectedItemDefinition = selectedItemId
    ? getItemDefinition(selectedItemId)
    : null;

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
      <StatModifierSummary statModifiers={statModifiers} />
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
  statModifiers,
}: {
  statModifiers: EquipmentStatModifiers;
}) {
  const entries = Object.entries(statModifiers).filter(([, value]) =>
    Boolean(value)
  );

  return (
    <div className="equipment-stat-summary">
      {entries.length > 0
        ? entries.map(([stat, value]) => (
            <span key={stat}>
              {formatStatName(stat)} +{value}
            </span>
          ))
        : "No equipment stat modifiers"}
    </div>
  );
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
            <div key={statId}>
              <dt>{primaryStatLabels[statId]}</dt>
              <dd>{actualStats[statId]}</dd>
              <button
                disabled={member.unspentStatPoints <= 0}
                onClick={() => onAllocateStatPoint(member.id, statId)}
                title={
                  member.unspentStatPoints > 0
                    ? `Allocate 1 point to ${primaryStatLabels[statId]}`
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
        <div>
          <dt>Health</dt>
          <dd>
            {member.health}/{derivedStats.maxHealth}
          </dd>
        </div>
        <div>
          <dt>Attack</dt>
          <dd>{derivedStats.attack}</dd>
        </div>
        <div>
          <dt>Defense</dt>
          <dd>{derivedStats.defense}</dd>
        </div>
        <div>
          <dt>Magic Defense</dt>
          <dd>{derivedStats.magicDefense}</dd>
        </div>
        <div>
          <dt>Accuracy</dt>
          <dd>{derivedStats.accuracy}</dd>
        </div>
        <div>
          <dt>Block</dt>
          <dd>{derivedStats.block}</dd>
        </div>
        <div>
          <dt>Evasion</dt>
          <dd>{derivedStats.evasion}</dd>
        </div>
        <div>
          <dt>Magic Power</dt>
          <dd>{derivedStats.magicPower}</dd>
        </div>
        <div>
          <dt>Healing Power</dt>
          <dd>{derivedStats.healingPower}</dd>
        </div>
        <div>
          <dt>Critical Chance</dt>
          <dd>{Math.round(derivedStats.criticalChance * 100)}%</dd>
        </div>
        <div>
          <dt>Critical Damage</dt>
          <dd>{Math.round(derivedStats.criticalDamage * 100)}%</dd>
        </div>
        <div>
          <dt>Health Regen</dt>
          <dd>{derivedStats.healthRegen}</dd>
        </div>
        <div>
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

export function CompanionVitalsPanel({ members }: { members: Companion[] }) {
  if (members.length === 0) {
    return null;
  }

  const orderedMembers = [...members].sort(
    (a, b) => a.partyOrder - b.partyOrder || a.id.localeCompare(b.id),
  );

  return (
    <section className="companion-vitals-panel" aria-label="Companion vitals">
      {orderedMembers.map((member) => {
        const derivedStats = getCompanionDerivedStats(member);
        const healthPercent =
          derivedStats.maxHealth > 0
            ? Math.max(0, Math.min(100, (member.health / derivedStats.maxHealth) * 100))
            : 0;
        const characterXpProgress = getCharacterXpProgress(member);
        const companionNumber = companionIds.indexOf(member.id) + 1;

        return (
          <div key={member.id} className="companion-vitals-row">
            <div className="companion-vitals-header">
              <span>Lv {member.characterLevel} C{companionNumber}</span>
              <span>
                {member.health}/{derivedStats.maxHealth} HP
              </span>
            </div>
            <span
              className="companion-vitals-bar companion-vitals-hp"
              title={`HP ${member.health}/${derivedStats.maxHealth}`}
            >
              <span style={{ width: `${healthPercent}%` }} />
            </span>
            <span
              className={`companion-vitals-bar companion-vitals-xp${
                characterXpProgress.isMaxLevel ? " companion-vitals-xp-max" : ""
              }`}
              title={`Character XP ${getCharacterXpText(member)}`}
            >
              <span style={{ width: `${characterXpProgress.percent}%` }} />
            </span>
          </div>
        );
      })}
    </section>
  );
}
