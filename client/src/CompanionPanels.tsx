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
  getAllowedEquipmentTypeLabels,
  getCompanionEquipmentStatModifiers,
  getItemDefinition,
  getSkillRoleScore,
  getSkillsForClass,
  validateEquipmentItemForCompanion,
  type Companion,
  type EquipmentSlot,
  type EquipmentType,
  type EquipmentStatModifiers,
  type ItemDefinition,
  type ItemId,
  type PartyInventory,
  type PartyMemberRole,
  type SkillDefinition,
} from "./game";

export type GameMenuTab =
  | "party"
  | "partyManagement"
  | "inventory"
  | "quests"
  | "world";

export type PartyManagementSection =
  | "role"
  | "equipment"
  | "stats"
  | "partyOrder"
  | "formation"
  | "skillPreferences"
  | "behaviorSettings";

export type PartyShortcutTarget = Extract<
  PartyManagementSection,
  "stats" | "role" | "equipment"
>;

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

const partyManagementSectionLabels: Record<PartyManagementSection, string> = {
  role: "Role Select",
  equipment: "Equipment",
  stats: "Full Stats",
  partyOrder: "Party Order",
  formation: "Formation",
  skillPreferences: "Skill Preferences",
  behaviorSettings: "Behavior Settings",
};

const partyManagementSections: PartyManagementSection[] = [
  "role",
  "equipment",
  "stats",
  "partyOrder",
  "formation",
  "skillPreferences",
  "behaviorSettings",
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
  members,
  selectedCompanionId,
  onSelectCompanion,
  onShortcut,
}: {
  members: Companion[];
  selectedCompanionId: string | null;
  onSelectCompanion: (companionId: string) => void;
  onShortcut: (companionId: string, target: PartyShortcutTarget) => void;
}) {
  const [isSkillPanelOpen, setIsSkillPanelOpen] = useState(false);
  const orderedMembers = getOrderedMenuMembers(members);
  const selectedMember =
    orderedMembers.find((member) => member.id === selectedCompanionId) ?? null;
  const selectedMemberSkills = selectedMember
    ? getSkillsForClass(selectedMember.classId)
    : [];

  return (
    <section className="party-menu-panel" aria-label="Party">
      <h2>Party</h2>
      <div className="menu-split-layout">
        <CompanionMenuList
          members={orderedMembers}
          selectedCompanionId={selectedCompanionId}
          onSelectCompanion={onSelectCompanion}
        />
        <div className="party-selected-summary">
          {selectedMember ? (
            <>
              <div className="menu-section-heading">
                <span>{getCompanionLabel(selectedMember)} Overview</span>
                <span
                  className={`role-pill ${getRoleAccentClass(
                    selectedMember.role,
                  )}`}
                >
                  {partyMemberRoleLabels[selectedMember.role]}
                </span>
              </div>
              <dl className="compact-stat-grid">
                <div>
                  <dt>HP</dt>
                  <dd>
                    {selectedMember.health}/{selectedMember.maxHealth}
                  </dd>
                </div>
                <div>
                  <dt>Level</dt>
                  <dd>{selectedMember.characterLevel}</dd>
                </div>
                <div>
                  <dt>Class</dt>
                  <dd>{CLASS_DEFINITIONS[selectedMember.classId].displayName}</dd>
                </div>
                <div>
                  <dt>State</dt>
                  <dd>{selectedMember.state}</dd>
                </div>
              </dl>
              <div className="placeholder-box">
                <span className="equipment-section-label">Equipped</span>
                <EquipmentSlotList member={selectedMember} isCompact />
              </div>
              <div className="party-shortcut-actions">
                <button
                  onClick={() => onShortcut(selectedMember.id, "stats")}
                  type="button"
                >
                  View Full Stats
                </button>
                <button
                  onClick={() => onShortcut(selectedMember.id, "role")}
                  type="button"
                >
                  Change Role
                </button>
                <button
                  onClick={() => onShortcut(selectedMember.id, "equipment")}
                  type="button"
                >
                  Manage Equipment
                </button>
                <button
                  className={isSkillPanelOpen ? "active" : ""}
                  onClick={() => setIsSkillPanelOpen((isOpen) => !isOpen)}
                  type="button"
                >
                  Skills
                </button>
              </div>
              {isSkillPanelOpen ? (
                <CompanionSkillSummary
                  member={selectedMember}
                  skills={selectedMemberSkills}
                />
              ) : null}
            </>
          ) : (
            <span className="party-menu-empty">Select a companion</span>
          )}
        </div>
      </div>
    </section>
  );
}

function CompanionSkillSummary({
  member,
  skills,
}: {
  member: Companion;
  skills: SkillDefinition[];
}) {
  return (
    <div className="companion-skill-summary" aria-label="Companion skills">
      <span className="equipment-section-label">Skills</span>
      {skills.length > 0 ? (
        <div className="companion-skill-list">
          {skills.map((skill) => (
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
                  <dd>{getSkillRoleScore(member.role, skill.tags)}</dd>
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
    return `Deals ${effect.damage} damage.`;
  }

  if (effect.type === "sweepingDamage") {
    return `Deals ${effect.mainDamage} damage and ${effect.splashDamage} splash damage.`;
  }

  if (effect.type === "taunt") {
    return effect.damage > 0
      ? `Pulls attention and deals ${effect.damage} damage.`
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
    return `Heals ${effect.amount} HP.`;
  }

  return `Heals ${effect.amount} HP at ${effect.hpCost} HP cost.`;
}

function CompanionMenuList({
  members,
  selectedCompanionId,
  onSelectCompanion,
}: {
  members: Companion[];
  selectedCompanionId: string | null;
  onSelectCompanion: (companionId: string) => void;
}) {
  return (
    <div className="party-companion-list">
      {members.length > 0 ? (
        members.map((member) => {
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
  inventory,
  leaderId,
  members,
  selectedCompanionId,
  onChangeLeader,
  onChangeRole,
  onEquipEquipment,
  onSelectCompanion,
  onSelectSection,
  onUnequipEquipment,
}: {
  activeSection: PartyManagementSection;
  inventory: PartyInventory;
  leaderId: string;
  members: Companion[];
  selectedCompanionId: string | null;
  onChangeLeader: (companionId: string) => void;
  onChangeRole: (companionId: string, role: PartyMemberRole) => void;
  onEquipEquipment: (
    companionId: string,
    itemId: ItemId,
    targetSlot: EquipmentSlot,
  ) => void;
  onSelectCompanion: (companionId: string) => void;
  onSelectSection: (section: PartyManagementSection) => void;
  onUnequipEquipment: (companionId: string, targetSlot: EquipmentSlot) => void;
}) {
  const orderedMembers = getOrderedMenuMembers(members);
  const selectedMember =
    orderedMembers.find((member) => member.id === selectedCompanionId) ?? null;

  return (
    <section className="party-management-panel" aria-label="Party Management">
      <h2>Party Management</h2>
      <div className="menu-split-layout">
        <CompanionMenuList
          members={orderedMembers}
          selectedCompanionId={selectedCompanionId}
          onSelectCompanion={onSelectCompanion}
        />
        <div className="party-management-detail">
          {selectedMember ? (
            <>
              <div className="menu-section-heading">
                <span className="party-management-heading-title">
                  {getCompanionLabel(selectedMember)} |{" "}
                  {partyMemberRoleLabels[selectedMember.role]}
                </span>
                <LeadershipHeaderAction
                  leaderId={leaderId}
                  member={selectedMember}
                  onChangeLeader={onChangeLeader}
                />
              </div>
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
              <PartyManagementSectionPanel
                activeSection={activeSection}
                inventory={inventory}
                leaderId={leaderId}
                member={selectedMember}
                onChangeRole={onChangeRole}
                onEquipEquipment={onEquipEquipment}
                onUnequipEquipment={onUnequipEquipment}
              />
            </>
          ) : (
            <span className="party-menu-empty">No companion selected</span>
          )}
        </div>
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
  inventory,
  leaderId,
  member,
  onChangeRole,
  onEquipEquipment,
  onUnequipEquipment,
}: {
  activeSection: PartyManagementSection;
  inventory: PartyInventory;
  leaderId: string;
  member: Companion;
  onChangeRole: (companionId: string, role: PartyMemberRole) => void;
  onEquipEquipment: (
    companionId: string,
    itemId: ItemId,
    targetSlot: EquipmentSlot,
  ) => void;
  onUnequipEquipment: (companionId: string, targetSlot: EquipmentSlot) => void;
}) {
  if (activeSection === "role") {
    return <RoleSelectSection member={member} onChangeRole={onChangeRole} />;
  }

  if (activeSection === "equipment") {
    return (
      <EquipmentManagementSection
        inventory={inventory}
        member={member}
        onEquipEquipment={onEquipEquipment}
        onUnequipEquipment={onUnequipEquipment}
      />
    );
  }

  if (activeSection === "stats") {
    return <FullStatsSection leaderId={leaderId} member={member} />;
  }

  return (
    <PlaceholderSection title={partyManagementSectionLabels[activeSection]}>
      {partyManagementSectionLabels[activeSection]} is a future-facing
      placeholder and does not change party behavior yet.
    </PlaceholderSection>
  );
}

function EquipmentSlotList({
  isCompact = false,
  member,
}: {
  isCompact?: boolean;
  member: Companion;
}) {
  const visibleSlots = isCompact
    ? (["mainHand", "offhand", "head", "chest"] as EquipmentSlot[])
    : EQUIPMENT_SLOTS;

  return (
    <dl className="equipment-slot-list">
      {visibleSlots.map((slot) => {
        const itemId = member.equipment[slot];
        const itemDefinition = itemId ? getItemDefinition(itemId) : null;

        return (
          <div key={slot}>
            <dt>{EQUIPMENT_SLOT_LABELS[slot]}</dt>
            <dd>{itemDefinition?.displayName ?? "None"}</dd>
          </div>
        );
      })}
    </dl>
  );
}

function EquipmentManagementSection({
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
    useState<EquipmentSlot>("mainHand");
  const allowedEquipmentTypes = getAllowedEquipmentTypeLabels(member.classId);
  const usableEquipmentSlots = inventory.slots.filter((slot) =>
    canShowInventoryItemForSlot(
      member,
      getItemDefinition(slot.itemId),
      selectedEquipmentSlot,
    )
  );
  const statModifiers = getCompanionEquipmentStatModifiers(member);
  const selectedItemId = member.equipment[selectedEquipmentSlot];
  const selectedItemDefinition = selectedItemId
    ? getItemDefinition(selectedItemId)
    : null;

  return (
    <section className="management-section-card" aria-label="Equipment">
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
      <span className="equipment-section-label">Class Allowed Types</span>
      <div className="equipment-allowed-types">
        <span>
          Allowed Main Hand: {formatEquipmentTypes(allowedEquipmentTypes.mainHand)}
        </span>
        <span>
          Allowed Offhand: {formatEquipmentTypes(allowedEquipmentTypes.offhand)}
        </span>
      </div>
      <span className="equipment-section-label">
        Available for {EQUIPMENT_SLOT_LABELS[selectedEquipmentSlot]}
      </span>
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
                onEquipEquipment={onEquipEquipment}
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
      <StatModifierSummary statModifiers={statModifiers} />
      <span className="equipment-section-label">Unequip</span>
      <div className="equipment-equipped-actions">
        {selectedItemDefinition ? (
          <button
            onClick={() => onUnequipEquipment(member.id, selectedEquipmentSlot)}
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

function formatEquipmentTypes(equipmentTypes: EquipmentType[]): string {
  return equipmentTypes.length > 0
    ? equipmentTypes.map((type) => EQUIPMENT_TYPE_LABELS[type]).join(", ")
    : "None";
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

function FullStatsSection({
  leaderId,
  member,
}: {
  leaderId: string;
  member: Companion;
}) {
  return (
    <section className="management-section-card" aria-label="Full Stats">
      <h3>Full Stats</h3>
      <dl className="full-stat-grid">
        <div>
          <dt>HP</dt>
          <dd>
            {member.health}/{member.maxHealth}
          </dd>
        </div>
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
          <dt>Command</dt>
          <dd>{member.commandPriority}</dd>
        </div>
        <div>
          <dt>Gather Speed</dt>
          <dd>{member.gatherSpeed}</dd>
        </div>
        <div>
          <dt>Party Order</dt>
          <dd>{member.partyOrder}</dd>
        </div>
        <div>
          <dt>Leader</dt>
          <dd>{leaderId === member.id ? "yes" : "no"}</dd>
        </div>
      </dl>
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
        const healthPercent =
          member.maxHealth > 0
            ? Math.max(0, Math.min(100, (member.health / member.maxHealth) * 100))
            : 0;
        const characterXpProgress = getCharacterXpProgress(member);
        const companionNumber = companionIds.indexOf(member.id) + 1;

        return (
          <div key={member.id} className="companion-vitals-row">
            <div className="companion-vitals-header">
              <span>Lv {member.characterLevel} C{companionNumber}</span>
              <span>
                {member.health}/{member.maxHealth} HP
              </span>
            </div>
            <span
              className="companion-vitals-bar companion-vitals-hp"
              title={`HP ${member.health}/${member.maxHealth}`}
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
