import type { ReactNode } from "react";
import {
  CLASS_DEFINITIONS,
  companionIds,
  getCharacterXpProgress,
  type Companion,
  type PartyMemberRole,
} from "./game";

export type GameMenuTab = "party" | "partyManagement" | "inventory" | "quests";

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
  const orderedMembers = getOrderedMenuMembers(members);
  const selectedMember =
    orderedMembers.find((member) => member.id === selectedCompanionId) ?? null;

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
                Equipment preview unavailable. Equipment slots are not implemented
                yet.
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
              </div>
            </>
          ) : (
            <span className="party-menu-empty">Select a companion</span>
          )}
        </div>
      </div>
    </section>
  );
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
  leaderId,
  members,
  selectedCompanionId,
  onChangeRole,
  onSelectCompanion,
  onSelectSection,
}: {
  activeSection: PartyManagementSection;
  leaderId: string;
  members: Companion[];
  selectedCompanionId: string | null;
  onChangeRole: (companionId: string, role: PartyMemberRole) => void;
  onSelectCompanion: (companionId: string) => void;
  onSelectSection: (section: PartyManagementSection) => void;
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
                <span>
                  {getCompanionLabel(selectedMember)} |{" "}
                  {partyMemberRoleLabels[selectedMember.role]}
                </span>
                <span>{selectedMember.id}</span>
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
                leaderId={leaderId}
                member={selectedMember}
                onChangeRole={onChangeRole}
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

function PartyManagementSectionPanel({
  activeSection,
  leaderId,
  member,
  onChangeRole,
}: {
  activeSection: PartyManagementSection;
  leaderId: string;
  member: Companion;
  onChangeRole: (companionId: string, role: PartyMemberRole) => void;
}) {
  if (activeSection === "role") {
    return <RoleSelectSection member={member} onChangeRole={onChangeRole} />;
  }

  if (activeSection === "equipment") {
    return (
      <PlaceholderSection title="Equipment">
        Equipment system not implemented yet. This section is reserved for
        future equipment management.
      </PlaceholderSection>
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
