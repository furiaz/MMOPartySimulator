import { useState, type ReactNode } from "react";
import type { FormationSelectionOption } from "./game/formationSelection";
import type { FormationPresetId } from "./game/types";
import { CompanionSkillPreferences as SkillPreferencesSection } from "./CompanionSkillPreferences";
import {
  EMPTY_EQUIPMENT_SLOT_ICON_SRC,
  INVENTORY_ITEM_ICON_SRC,
  RUNECASTER_SKILL_ICON_SRC,
  RUNE_WORD_SEAL_SRC,
} from "./assetIcons";
import type {
  PartyManagementSection,
  PartyMenuSection,
} from "./gameMenuTypes";
import {
  ARMOR_FAMILY_LABELS,
  CLASS_DEFINITIONS,
  companionIds,
  EQUIPMENT_SLOT_LABELS,
  EQUIPMENT_SLOTS,
  EQUIPMENT_TYPE_LABELS,
  getConsumableCooldownRemainingMs,
  getCharacterXpProgress,
  canCompanionEnterFirstClassSelection,
  getCompanionEquipmentPrimaryStatModifiers,
  getCompanionEquipmentStatModifiers,
  getCompanionActualStatsWithPartyBuffs,
  getCompanionDerivedStatsWithPartyBuffs,
  getCompanionEffectiveGatherSpeed,
  getDefenseReductionPercent,
  getEquipmentCompatibleSlots,
  getItemDefinition,
  getActiveSkillsForCompanion,
  getCompanionSkillRank,
  getCompanionSkillMaxRank,
  getLearnedPassivesForCompanion,
  getLearnedSkillGroupsForCompanion,
  getPassiveSkillEffectSummary,
  getScaledSkillDefinitionForCompanion,
  getRoleBonusDisplayState,
  isFlaskItemDefinition,
  isRunecasterSkillId,
  getPartySizeUnlockRequirement,
  getSkillRoleScore,
  getSkillCooldownMs,
  getSkillBooksRequiredForNextRank,
  validateEquipmentItemForCompanion,
  type Companion,
  type CompanionDerivedStats,
  type CompanionPrimaryStatModifiers,
  type EquipmentSlot,
  type EquipmentStatModifiers,
  type ItemDefinition,
  type ItemId,
  type GameState,
  type PartyInventory,
  type PartyMemberRole,
  type PrimaryStatId,
  type ActiveSkillDefinition,
  type PassiveSkillDefinition,
  type SkillId,
} from "./game";
export type {
  GameMenuTab,
  PartyManagementSection,
  PartyMenuSection,
  PartyShortcutTarget,
} from "./gameMenuTypes";

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

const primaryStatDescriptions: Record<PrimaryStatId, string> = {
  strength: "Increases physical attack and block.",
  dexterity: "Increases accuracy, evasion, and helps attack.",
  constitution: "Increases max HP, defense, block, and health regen.",
  intelligence: "Increases magic power and helps healing and magic defense.",
  wisdom: "Increases healing power, magic defense, and helps magic power, accuracy, and defense.",
};

type DerivedStatId =
  | "health"
  | keyof CompanionDerivedStats
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
  gameState,
  inventory,
  members,
  currentTime,
  selectedCompanionId,
  highestCharacterLevelEver,
  onAllocateStatPoint,
  onChangeSkillBehavior,
  onEquipEquipment,
  onEquipFlask,
  onSetLegacySkillEnabled,
  onSelectCompanion,
  onSelectSection,
  onUnequipEquipment,
  onUnequipFlask,
}: {
  activeSection: PartyMenuSection;
  gameState: GameState;
  inventory: PartyInventory;
  members: Companion[];
  currentTime: number;
  selectedCompanionId: string | null;
  highestCharacterLevelEver: number;
  onAllocateStatPoint: (companionId: string, statId: PrimaryStatId) => void;
  onChangeSkillBehavior: (
    companionId: string,
    update: Partial<Companion["skillBehavior"]>,
  ) => void;
  onEquipEquipment: (
    companionId: string,
    itemId: ItemId,
    targetSlot: EquipmentSlot,
  ) => void;
  onEquipFlask: (companionId: string, itemId: ItemId) => void;
  onSetLegacySkillEnabled: (
    companionId: string,
    skillId: SkillId,
    enabled: boolean,
  ) => void;
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
        partySizeUnlockLevel={highestCharacterLevelEver}
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
            gameState={gameState}
            inventory={inventory}
            member={selectedMember}
            onAllocateStatPoint={onAllocateStatPoint}
            onChangeSkillBehavior={onChangeSkillBehavior}
            onEquipEquipment={onEquipEquipment}
            onEquipFlask={onEquipFlask}
            onSetLegacySkillEnabled={onSetLegacySkillEnabled}
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
  gameState,
  inventory,
  member,
  onEquipEquipment,
  onAllocateStatPoint,
  onChangeSkillBehavior,
  onEquipFlask,
  onSetLegacySkillEnabled,
  onUnequipEquipment,
  onUnequipFlask,
}: {
  activeSection: PartyMenuSection;
  currentTime: number;
  gameState: GameState;
  inventory: PartyInventory;
  member: Companion;
  onEquipEquipment: (
    companionId: string,
    itemId: ItemId,
    targetSlot: EquipmentSlot,
  ) => void;
  onAllocateStatPoint: (companionId: string, statId: PrimaryStatId) => void;
  onChangeSkillBehavior: (
    companionId: string,
    update: Partial<Companion["skillBehavior"]>,
  ) => void;
  onEquipFlask: (companionId: string, itemId: ItemId) => void;
  onSetLegacySkillEnabled: (
    companionId: string,
    skillId: SkillId,
    enabled: boolean,
  ) => void;
  onUnequipEquipment: (companionId: string, targetSlot: EquipmentSlot) => void;
  onUnequipFlask: (companionId: string) => void;
}) {
  if (activeSection === "stats") {
    return (
      <StatsSection
        gameState={gameState}
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

  if (activeSection === "skillPreferences") {
    return (
      <SkillPreferencesSection
        member={member}
        onChangeSkillBehavior={onChangeSkillBehavior}
        onSetLegacySkillEnabled={onSetLegacySkillEnabled}
      />
    );
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
  title,
  showRoleScore = true,
}: {
  member: Companion;
  skills: ActiveSkillDefinition[];
  title: string;
  showRoleScore?: boolean;
}) {
  const orderedSkills = skills
    .map((skill, index) => ({
      index,
      score: getSkillRoleScore(member.role, skill.tags),
      skill,
      scaledSkill: getScaledSkillDefinitionForCompanion(member, skill),
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index);

  return (
    <div className="companion-skill-summary" aria-label="Companion skills">
      <span className="equipment-section-label">{title}</span>
      {skills.length > 0 ? (
        <div className="companion-skill-list">
          {orderedSkills.map(({ score, skill, scaledSkill }) => {
            const requiredBooks = getSkillBooksRequiredForNextRank(
              member,
              skill.id,
            );

            return (
            <div key={skill.id} className="companion-skill-row">
              <div>
                <strong>{skill.displayName}</strong>
                <span>{getSkillEffectSummary(scaledSkill)}</span>
              </div>
              <RunecasterRuneWords skill={skill} />
              <dl>
                <div>
                  <dt>Rank</dt>
                  <dd>
                    {getCompanionSkillRank(member, skill.id)}/
                    {getCompanionSkillMaxRank(member, skill)}
                  </dd>
                </div>
                <div>
                  <dt>Books</dt>
                  <dd>{requiredBooks === null ? "Max" : requiredBooks}</dd>
                </div>
                <div>
                  <dt>Cooldown</dt>
                  <dd>{formatSkillCooldown(getSkillCooldownMs(skill))}</dd>
                </div>
                {showRoleScore ? (
                  <div>
                    <dt>Role Score</dt>
                    <dd>{score}</dd>
                  </div>
                ) : null}
                <div>
                  <dt>Range</dt>
                  <dd>{skill.range}</dd>
                </div>
              </dl>
              <span className="companion-skill-tags">
                {skill.tags.join(", ")}
              </span>
            </div>
            );
          })}
        </div>
      ) : (
        <span className="party-menu-empty">No skills for this class</span>
      )}
    </div>
  );
}

function RunecasterRuneWords({ skill }: { skill: ActiveSkillDefinition }) {
  if (!skill.runeWords || !isRunecasterSkillId(skill.id)) {
    return null;
  }

  const { primary, secondary, presentationGuidance } = skill.runeWords;

  return (
    <div className="runecaster-rune-presentation">
      <div className="runecaster-rune-compact">
        <img
          alt={`${skill.displayName} ordered rune-seal sequence`}
          className="runecaster-rune-sequence-icon"
          src={RUNECASTER_SKILL_ICON_SRC[skill.id]}
        />
        <span>
          {primary.transliterations[0]} → {secondary.transliterations[0]}
        </span>
      </div>
      <details className="runecaster-rune-details">
        <summary>Rune-word details · 2 words</summary>
        <ol>
          {[primary, secondary].map((word, index) => (
            <li key={word.id}>
              <img
                alt={`${word.transliterations[0]} word seal`}
                className="runecaster-word-seal"
                src={RUNE_WORD_SEAL_SRC[word.sealAssetKey]}
              />
              <div>
                <strong>
                  {index === 0 ? "1. Primary" : "2. Secondary"} · {word.mechanicalConcept}
                </strong>
                <span className="runecaster-tifinagh" lang="zgh-Tfng">
                  {word.glyphs}
                </span>
                <span>{word.transliterations.join(" / ")}</span>
                <span>{word.meaning}</span>
              </div>
            </li>
          ))}
        </ol>
        <p>{presentationGuidance}</p>
      </details>
    </div>
  );
}

function CompanionPassiveSummary({
  member,
  passives,
}: {
  member: Companion;
  passives: PassiveSkillDefinition[];
}) {
  return (
    <div className="companion-skill-summary" aria-label="Companion passives">
      <span className="equipment-section-label">Always-Active Passives</span>
      {passives.length > 0 ? (
        <div className="companion-skill-list">
          {passives.map((skill) => {
            const requiredBooks = getSkillBooksRequiredForNextRank(
              member,
              skill.id,
            );

            return (
              <div key={skill.id} className="companion-skill-row">
                <div>
                  <strong>{skill.displayName}</strong>
                  <span>{getPassiveSkillEffectSummary(member, skill)}</span>
                </div>
                <dl>
                  <div>
                    <dt>Rank</dt>
                    <dd>
                      {getCompanionSkillRank(member, skill.id)}/
                      {getCompanionSkillMaxRank(member, skill)}
                    </dd>
                  </div>
                  <div>
                    <dt>Books</dt>
                    <dd>{requiredBooks === null ? "Max" : requiredBooks}</dd>
                  </div>
                  <div>
                    <dt>Class</dt>
                    <dd>{CLASS_DEFINITIONS[skill.classId].displayName}</dd>
                  </div>
                </dl>
                <span className="companion-skill-tags">
                  {skill.tags.join(", ")}
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <span className="party-menu-empty">No learned passives</span>
      )}
    </div>
  );
}

function getSkillEffectSummary(skill: ActiveSkillDefinition): string {
  const { effect } = skill;

  if (effect.type === "damage") {
    return `Deals ${Math.round(effect.powerMultiplier * 100)}% ${effect.damageType} damage.`;
  }

  if (effect.type === "followThrough") {
    return `Deals ${formatPercent(effect.powerMultiplier * 100)}% physical damage, plus ${formatPercent(effect.conditionalBonusMultiplier * 100)} percentage points when the target is attacking another living companion.`;
  }

  if (effect.type === "lungeDamage") {
    return `Lunges ${effect.lungeDistance} spaces and deals ${Math.round(effect.powerMultiplier * 100)}% ${effect.damageType} damage.`;
  }

  if (effect.type === "sweepingDamage") {
    return `Deals ${formatPercent(effect.mainPowerMultiplier * 100)}% ${effect.damageType} damage to every enemy in the forward semicircle, or 70% of that damage in the full circle. Choose the area in Skill Preferences.`;
  }

  if (effect.type === "taunt") {
    const duration = formatDuration(effect.durationMs);

    return effect.powerMultiplier && effect.powerMultiplier > 0
      ? `Pulls attention for ${duration} and deals ${Math.round(effect.powerMultiplier * 100)}% ${effect.damageType ?? "physical"} damage.`
      : `Pulls enemy attention for ${duration}.`;
  }

  if (effect.type === "multiTaunt") {
    return `Pulls attention from up to ${effect.maxTargets} enemies.`;
  }

  if (effect.type === "shockwave") {
    return `Deals ${formatPercent(effect.powerMultiplier * 100)}% ${effect.damageType} damage. Circle binds and taunts; forward cone stuns, pushes, then taunts. Choose the area in Skill Preferences.`;
  }

  if (effect.type === "pinningShot") {
    return `Immobilizes one enemy for ${Math.round(effect.durationMs / 1000)}s.`;
  }

  if (effect.type === "fakeDeath") {
    return `Drops enemy attention and empowers the next physical attack.`;
  }

  if (effect.type === "forcedEvasion") {
    return "Avoids the next incoming damage source.";
  }

  if (effect.type === "selfBuff") {
    const parts = [`Self +${effect.bonusDamage} damage`];

    if (effect.movementSpeedBonusPercent) {
      parts.push(`+${Math.round(effect.movementSpeedBonusPercent)}% move speed`);
    }

    return `${parts.join(", ")}.`;
  }

  if (effect.type === "allyBuff") {
    return `Ally +${effect.bonusDamage} damage.`;
  }

  if (effect.type === "partyBuff") {
    return `Party +${effect.bonusDamage} damage.`;
  }

  if (effect.type === "partyClassBuff") {
    const parts: string[] = [];

    if (effect.physicalDamageBonusPercent) {
      parts.push(`+${Math.round(effect.physicalDamageBonusPercent)}% physical damage`);
    }

    if (effect.magicDamageBonusPercent) {
      parts.push(`+${Math.round(effect.magicDamageBonusPercent)}% magic damage`);
    }

    if (effect.mitigationPercent) {
      parts.push(`${Math.round(effect.mitigationPercent)}% mitigation`);
    }

    if (effect.poisonCoating) {
      parts.push("attacks apply poison");
    }

    if (effect.healingReceivedBonusPercent) {
      parts.push(`+${Math.round(effect.healingReceivedBonusPercent)}% healing received`);
    }

    for (const [statId, percent] of Object.entries(
      effect.primaryStatBonusPercentByStat ?? {},
    )) {
      parts.push(`+${Math.round(percent)}% ${statId}`);
    }

    return `Party ${parts.join(", ")}.`;
  }

  if (effect.type === "partyPoisonCoating") {
    return `Party attacks apply poison for ${Math.round(effect.poisonDurationMs / 1000)}s.`;
  }

  if (effect.type === "manaShield") {
    return `Self shield absorbs ${Math.round(effect.absorbPercentMaxHealth)}% max HP damage.`;
  }

  if (effect.type === "frostArmor") {
    return `Ally +${Math.round(effect.defenseBonusPercent)}% defense and ${Math.round(effect.mitigationPercent)}% mitigation.`;
  }

  if (effect.type === "overcharge") {
    return `Self skills are ${formatPercent(effect.skillPowerBonusPercent)}% stronger with ${formatPercent(effect.cooldownPenaltyPercent)}% longer cooldowns.`;
  }

  if (effect.type === "gatherBuff") {
    if (skill.id === "field_hands") {
      return `+${formatPercent(effect.bonusGatherSpeed)} gathering power. For 90 seconds, increases gathering power for any resource. Each one-second gathering attempt removes more resource durability, so items are collected sooner. It does not improve item quantity, tier, or rarity.`;
    }

    return effect.resourceType
      ? `Self +${effect.bonusGatherSpeed} ${effect.resourceType} gather speed.`
      : `Self +${effect.bonusGatherSpeed} gather speed.`;
  }

  if (effect.type === "quickStep") {
    return `Moves ${effect.distance} space.`;
  }

  if (effect.type === "skirmishShot") {
    return `Moves ${effect.distance} spaces and fires a normal shot.`;
  }

  if (effect.type === "arrowBurst") {
    return `Deals ${formatPercent(effect.powerMultiplier * 100)}% ${effect.damageType} damage in a forward cone or longer line. Choose the area in Skill Preferences.`;
  }

  if (effect.type === "lifestealBuff") {
    return `Self heals for ${Math.round(effect.lifestealPercent)}% of physical damage dealt.`;
  }

  if (effect.type === "pounce") {
    return `Moves ${effect.distance} spaces and deals ${Math.round(effect.powerMultiplier * 100)}% ${effect.damageType} damage.`;
  }

  if (effect.type === "flameStep") {
    return `Moves ${effect.distance} spaces and applies burning.`;
  }

  if (effect.type === "runeStep") {
    return `Moves ${effect.distance} spaces and places an immobilizing trap.`;
  }

  if (effect.type === "dawnStep") {
    return `Moves ${effect.distance} spaces and disarms nearby enemies.`;
  }

  if (effect.type === "whipPrison") {
    return `Locks the caster and target for ${Math.round(effect.controlDurationMs / 1000)}s and applies bleed.`;
  }

  if (effect.type === "flagellantLash") {
    return `Costs ${Math.round(effect.hpCostCurrentPercent)}% current HP, deals ${Math.round(effect.powerMultiplier * 100)}% physical damage, and applies bleed.`;
  }

  if (effect.type === "sacrificialBarrier") {
    return `Costs ${Math.round(effect.hpCostCurrentPercent)}% current HP and grants an ally barrier for ${effect.blocks} hits.`;
  }

  if (effect.type === "sacrificeHeal") {
    return `Sacrifices ${Math.round(effect.hpCostCurrentPercent)}% current HP and heals for ${Math.round(effect.healSacrificeMultiplier * 100)}% of the sacrifice.`;
  }

  if (effect.type === "eternalHope") {
    return `Sacrifices ${Math.round(effect.hpCostCurrentPercent)}% current HP for self mitigation and healing over time.`;
  }

  if (effect.type === "atonementStep") {
    return `Costs ${Math.round(effect.hpCostCurrentPercent)}% current HP, moves ${effect.distance} spaces, and heals or disarms nearby targets.`;
  }

  if (effect.type === "fireBurst") {
    return `Hits enemies near the target for ${Math.round(effect.powerMultiplier * 100)}% magic damage and applies burning.`;
  }

  if (effect.type === "maulSweep") {
    return `Deals ${formatPercent(effect.powerMultiplier * 100)}% ${effect.damageType} damage in a forward semicircle, or 70% of that damage in a full circle, and disarms affected enemies. Choose the area in Skill Preferences.`;
  }

  if (effect.type === "shieldBlock") {
    return `For ${formatDuration(effect.durationMs)}, blocks ${effect.blocks} physical ${effect.blocks === 1 ? "hit" : "hits"}.`;
  }

  if (effect.type === "absorbShield") {
    return `Absorbs ${Math.round(effect.absorbPercentMaxHealth)}% max HP damage.`;
  }

  if (effect.type === "holdFast") {
    return `Self +${Math.round(effect.defenseBonusPercent)}% defense, ${Math.round(effect.absorbPercentMaxHealth)}% max HP shield, and cannot move briefly.`;
  }

  if (effect.type === "damageMitigation") {
    return `Mitigates ${Math.round(effect.mitigationPercent)}% damage for ${effect.procs} hits.`;
  }

  if (effect.type === "selfMitigationBuff") {
    return `Self mitigates ${Math.round(effect.mitigationPercent)}% damage.`;
  }

  if (effect.type === "partyMitigationBuff") {
    return `Party mitigates ${Math.round(effect.mitigationPercent)}% damage.`;
  }

  if (effect.type === "bind") {
    return "Binds an enemy briefly.";
  }

  if (effect.type === "silencingRay") {
    return `Silences one enemy for ${Math.round(effect.durationMs / 1000)}s.`;
  }

  if (effect.type === "heal") {
    if (skill.id === "first_aid") {
      return `Emergency heal at 60% HP or lower. Normal healing is ${formatPercent(effect.powerMultiplier * 100)}% healing power, then scales from 10% effectiveness at 60% HP to 100% at 10% HP.`;
    }

    return `Heals ${Math.round(effect.powerMultiplier * 100)}% healing power.`;
  }

  if (effect.type === "healOverTime") {
    return `Heals ${Math.round(effect.healPercentMaxHealth)}% max HP every ${Math.round(effect.tickIntervalMs / 1000)}s.`;
  }

  if (effect.type === "circleOfRenewal") {
    return `Heals allies near the target for ${Math.round(effect.powerMultiplier * 100)}% healing power.`;
  }

  if (effect.type === "selfPercentHeal") {
    return `Heals self for ${Math.round(effect.healPercent)}% max HP.`;
  }

  if (effect.type === "selfCostHeal") {
    return `Heals ${Math.round(effect.powerMultiplier * 100)}% healing power at ${effect.hpCost} HP cost.`;
  }

  return "Applies a skill effect.";
}

function formatSkillCooldown(cooldownMs: number): string {
  return `${Math.round(cooldownMs / 1000)}s`;
}

function formatDuration(durationMs: number): string {
  return `${formatPercent(durationMs / 1000)}s`;
}

function formatPercent(value: number): string {
  return String(Number(value.toFixed(3)));
}


function CompanionMenuList({
  layout = "vertical",
  members,
  selectedCompanionId,
  showEmptySlots = false,
  partySizeUnlockLevel = 0,
  onSelectCompanion,
}: {
  layout?: "vertical" | "horizontal";
  members: Companion[];
  selectedCompanionId: string | null;
  showEmptySlots?: boolean;
  partySizeUnlockLevel?: number;
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
              unlockRequirement !== null &&
              partySizeUnlockLevel < unlockRequirement;

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
                      ? `Unlocks at Highest Companion Level ${unlockRequirement}`
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
  formationOptions,
  selectedFormationPreset,
  onSelectFormationPreset,
  activeSection,
  currentTime,
  leaderId,
  members,
  selectedCompanionId,
  highestCharacterLevelEver,
  onChangeLeader,
  onChangeConsumableBehavior,
  onChangeRole,
  onSelectCompanion,
  onSelectSection,
  onMovePartyOrder,
}: {
  formationOptions: FormationSelectionOption[];
  selectedFormationPreset: FormationPresetId;
  onSelectFormationPreset: (preset: FormationPresetId) => void;
  activeSection: PartyManagementSection;
  currentTime: number;
  leaderId: string;
  members: Companion[];
  selectedCompanionId: string | null;
  highestCharacterLevelEver: number;
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
          partySizeUnlockLevel={highestCharacterLevelEver}
          onSelectCompanion={onSelectCompanion}
        />
        {activeSection === "formation" ? (
          <FormationSelectionSection options={formationOptions} selectedPreset={selectedFormationPreset} onSelect={onSelectFormationPreset} />
        ) : selectedMember ? (
          <PartyManagementSectionPanel
            activeSection={activeSection}
            currentTime={currentTime}
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

export function FormationSelectionSection({ options, selectedPreset, onSelect }: {
  options: FormationSelectionOption[];
  selectedPreset: FormationPresetId;
  onSelect: (preset: FormationPresetId) => void;
}) {
  return <section className="formation-selection" aria-label="Formation selection">
    <h3>Formation</h3>
    <p>Choose a soft formation for travel and combat. Companions keep their current orders and targets.</p>
    <div className="formation-options">
      {options.map(option => <button key={option.id} type="button" aria-pressed={option.id === selectedPreset}
        onKeyDown={event => { if (event.key === " " || event.key === "Enter") event.stopPropagation(); }}
        className={`formation-option${option.id === selectedPreset ? " active" : ""}`} onClick={() => onSelect(option.id)}>
        <strong>{option.label}</strong>
        {option.slots.length ? <span className="formation-preview" aria-hidden="true">
          <small>Front</small>
          {[...new Set(option.slots.map(slot => slot.forward))].map(row => <span className="formation-preview-row" key={row}>
            {option.slots.filter(slot => slot.forward === row).map(slot => <span className="formation-preview-dot" key={slot.id} />)}
          </span>)}
        </span> : <span>Preview unavailable for this party size</span>}
        <span>{option.id === selectedPreset ? "Selected" : "Select"}</span>
      </button>)}
    </div>
  </section>;
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
  currentTime,
  leaderId,
  member,
  members,
  onChangeLeader,
  onChangeConsumableBehavior,
  onChangeRole,
  onMovePartyOrder,
}: {
  activeSection: PartyManagementSection;
  currentTime: number;
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
    return (
      <RoleSelectSection
        currentTime={currentTime}
        member={member}
        onChangeRole={onChangeRole}
      />
    );
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
  onEquipEquipment,
  onEquipFlask,
  onUnequipEquipment,
  onUnequipFlask,
}: {
  currentTime: number;
  inventory: PartyInventory;
  member: Companion;
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
  const equippedFlask = member.consumables.flask;
  const equippedFlaskDefinition = equippedFlask
    ? getItemDefinition(equippedFlask.itemId)
    : null;
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

function getTargetSlotsForItem(itemDefinition: ItemDefinition): EquipmentSlot[] {
  return getEquipmentCompatibleSlots(itemDefinition);
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

function formatGatherSpeed(value: number): string {
  return Number.isInteger(value) ? value.toString() : value.toFixed(1);
}

function RoleSelectSection({
  currentTime,
  member,
  onChangeRole,
}: {
  currentTime: number;
  member: Companion;
  onChangeRole: (companionId: string, role: PartyMemberRole) => void;
}) {
  const roleBonusDisplay = getRoleBonusDisplayState(member, currentTime);

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
      <span
        className={`role-bonus-status role-bonus-status-${roleBonusDisplay.status}`}
      >
        {roleBonusDisplay.label}
      </span>
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
  gameState,
  member,
  onAllocateStatPoint,
}: {
  gameState: GameState;
  member: Companion;
  onAllocateStatPoint: (companionId: string, statId: PrimaryStatId) => void;
}) {
  const actualStats = getCompanionActualStatsWithPartyBuffs(gameState, member);
  const derivedStats = getCompanionDerivedStatsWithPartyBuffs(gameState, member);
  const effectiveGatherSpeed = getCompanionEffectiveGatherSpeed(member);

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
        {canCompanionEnterFirstClassSelection(member) ? (
          <div className="first-class-ready-stat">
            <dt>Class Path</dt>
            <dd>Ready for first class</dd>
          </div>
        ) : null}
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
          <dd>{formatGatherSpeed(effectiveGatherSpeed)}</dd>
        </div>
      </dl>
    </section>
  );
}

function PartySkillsSection({ member }: { member: Companion }) {
  const classDefinition = CLASS_DEFINITIONS[member.classId];
  const skills = getActiveSkillsForCompanion(member);
  const learnedSkillGroups = getLearnedSkillGroupsForCompanion(member);
  const learnedPassives = getLearnedPassivesForCompanion(member);

  return (
    <section className="management-section-card" aria-label="Skills">
      <h3>Skills</h3>
      <nav className="class-skill-tabs" aria-label="Class skills">
        <button className="active" type="button">
          {classDefinition.displayName}
        </button>
      </nav>
      <CompanionSkillSummary
        member={member}
        skills={skills}
        title="Skill Usage Lineup"
      />
      {learnedSkillGroups.map((group) => (
        <CompanionSkillSummary
          key={group.classId}
          member={member}
          skills={group.skills}
          title={`Learned ${CLASS_DEFINITIONS[group.classId].displayName} Skills`}
          showRoleScore={false}
        />
      ))}
      <CompanionPassiveSummary member={member} passives={learnedPassives} />
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
