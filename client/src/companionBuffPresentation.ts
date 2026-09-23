import { SKILL_VISUAL_ICON_SRC } from "./assetIcons";
import {
  SKILL_DEFINITIONS,
  type GameState,
  type SkillId,
  type StatusEffectState,
} from "./game";
import {
  getHeadhunterStackCap,
  getLearnedPassiveRank,
} from "./game/passiveSkills";
import { getActiveHeadhunterKillTimestamps } from "./game/martialPassives";
import { getSkillScaleUnits } from "./game/skillProgression";

const defaultVisibleBuffCount = 8;
const expiringBuffThresholdMs = 10_000;

type BuffEffectLine = {
  label: string;
  expiresAt?: number;
};

type CompanionBuffDisplayDraft = {
  skillId: SkillId;
  effectLines: BuffEffectLine[];
};

export type CompanionBuffDisplayEntry = {
  skillId: SkillId;
  displayName: string;
  iconSrc?: string;
  tooltip: string;
  effectLines: string[];
  remainingMs?: number;
  isExpiring: boolean;
  isUntimed: boolean;
};

export function getCompanionBuffDisplayEntries({
  companionId,
  currentTime,
  gameState,
  maxEntries = defaultVisibleBuffCount,
}: {
  companionId: string;
  currentTime: number;
  gameState: GameState;
  maxEntries?: number;
}): CompanionBuffDisplayEntry[] {
  const drafts = new Map<SkillId, CompanionBuffDisplayDraft>();
  const companion = gameState.entities[companionId];
  if (companion?.kind === "companion") {
    const momentum = gameState.duelistsMomentumByCompanionId?.[companionId];
    const momentumRank = getLearnedPassiveRank(companion, "duelists_momentum");
    addUntimedBuff(
      drafts,
      "duelists_momentum",
      momentum && momentumRank
        ? `${momentum.stacks}/3 stacks, physical damage +${formatNumber(momentum.stacks * getSkillScaleUnits(momentumRank))}%`
        : "Momentum",
      Boolean(momentum && momentumRank),
    );

    const riposte = gameState.riposteTrainingByCompanionId?.[companionId];
    const riposteRank = getLearnedPassiveRank(companion, "riposte_training");
    addTimedBuff(
      drafts,
      "riposte_training",
      riposteRank
        ? `Next direct physical hit +${formatNumber(5 * getSkillScaleUnits(riposteRank))}%`
        : "Riposte ready",
      riposte?.expiresAt,
      currentTime,
    );

    const rooted = gameState.rootedBastionByCompanionId?.[companionId];
    const rootedRank = getLearnedPassiveRank(companion, "rooted_bastion");
    addUntimedBuff(
      drafts,
      "rooted_bastion",
      rootedRank
        ? `Defense +${formatNumber(3 * getSkillScaleUnits(rootedRank))}%`
        : "Rooted",
      Boolean(rooted?.active && rootedRank),
    );

    const headhunterRank = getLearnedPassiveRank(companion, "headhunter");
    const killTimestamps = headhunterRank
      ? getActiveHeadhunterKillTimestamps(gameState, companionId, currentTime)
      : [];
    const headhunterExpiry =
      killTimestamps.length > 0 ? Math.min(...killTimestamps) + 30_000 : undefined;
    addTimedBuff(
      drafts,
      "headhunter",
      headhunterRank
        ? `${killTimestamps.length}/${getHeadhunterStackCap(headhunterRank)} stacks, critical chance +${killTimestamps.length}%`
        : "Recent-kill critical chance",
      headhunterExpiry,
      currentTime,
    );
  }
  const selfBuff = gameState.skillSelfBuffsByCompanionId?.[companionId];

  addTimedBuff(
    drafts,
    getRuntimeSkillId(
      selfBuff?.sourceSkillId,
      undefined,
      undefined,
    ),
    selfBuff ? formatSelfBuffLine(selfBuff) : "Damage buff",
    selfBuff?.expiresAt,
    currentTime,
  );
  for (const buff of Object.values(gameState.skillPartyBuffsBySourceId ?? {})) {
    addTimedBuff(
      drafts,
      getRuntimeSkillId(buff.sourceSkillId, undefined, undefined),
      `Party damage ${formatSignedNumber(buff.bonusDamage)}`,
      buff.expiresAt,
      currentTime,
    );
  }
  for (const buff of Object.values(
    gameState.skillPartyClassBuffsByCompanionId?.[companionId] ?? {},
  )) {
    addTimedBuff(
      drafts,
      buff?.sourceSkillId,
      buff ? formatPartyClassBuffLine(buff) : "Party buff",
      buff?.expiresAt,
      currentTime,
    );
  }
  const overcharge = gameState.skillOverchargesByCompanionId?.[companionId];
  addTimedBuff(
    drafts,
    getRuntimeSkillId(
      overcharge?.sourceSkillId,
      undefined,
      "overcharge",
    ),
    overcharge ? formatOverchargeLine(overcharge) : "Skill power buff",
    overcharge?.expiresAt,
    currentTime,
  );
  const manaShield = gameState.skillManaShieldsByCompanionId?.[companionId];
  addUntimedBuff(
    drafts,
    getRuntimeSkillId(
      manaShield?.sourceSkillId,
      manaShield?.id,
      "mana_shield",
    ),
    manaShield ? formatAbsorbShieldLine("Mana shield", manaShield) : "Mana shield",
    Boolean(manaShield),
  );
  const frostArmor = gameState.skillFrostArmorsByCompanionId?.[companionId];
  addTimedBuff(
    drafts,
    getRuntimeSkillId(
      frostArmor?.sourceSkillId,
      frostArmor?.id,
      "frost_armor",
    ),
    frostArmor ? formatFrostArmorLine(frostArmor) : "Frost armor",
    frostArmor?.expiresAt,
    currentTime,
  );
  const healOverTime = gameState.skillHealOverTimesByCompanionId?.[companionId];
  addTimedBuff(
    drafts,
    getRuntimeSkillId(
      healOverTime?.sourceSkillId,
      healOverTime?.id,
      undefined,
    ),
    healOverTime ? formatHealOverTimeLine(healOverTime) : "Heal over time",
    healOverTime?.expiresAt,
    currentTime,
  );
  const lifesteal = gameState.skillLifestealBuffsByCompanionId?.[companionId];
  addTimedBuff(
    drafts,
    getRuntimeSkillId(
      lifesteal?.sourceSkillId,
      undefined,
      "blood_feast",
    ),
    lifesteal
      ? `Lifesteal ${formatPercent(lifesteal.lifestealPercent)}`
      : "Lifesteal",
    lifesteal?.expiresAt,
    currentTime,
  );
  const rewindRune = gameState.skillRewindRunesByCompanionId?.[companionId];
  addTimedBuff(
    drafts,
    getRuntimeSkillId(
      rewindRune?.sourceSkillId,
      rewindRune?.id,
      "rewind_rune",
    ),
    rewindRune ? formatRewindRuneLine(rewindRune) : "Delayed healing",
    rewindRune?.expiresAt,
    currentTime,
  );
  addUntimedBuff(
    drafts,
    gameState.skillRunicFocusByCompanionId?.[companionId]?.skillId,
    "Duplicates next eligible skill",
    Boolean(gameState.skillRunicFocusByCompanionId?.[companionId]),
  );
  const gatherBuff = gameState.skillGatherBuffsByCompanionId?.[companionId];
  addTimedBuff(
    drafts,
    getRuntimeSkillId(
      gatherBuff?.sourceSkillId,
      undefined,
      undefined,
    ),
    gatherBuff ? formatGatherBuffLine(gatherBuff) : "Gather buff",
    gatherBuff?.expiresAt,
    currentTime,
  );
  const damageMitigation =
    gameState.skillDamageMitigationsByCompanionId?.[companionId];
  addTimedBuff(
    drafts,
    getRuntimeSkillId(
      damageMitigation?.sourceSkillId,
      damageMitigation?.id,
      undefined,
    ),
    damageMitigation
      ? formatDamageMitigationLine(damageMitigation)
      : "Damage mitigation",
    damageMitigation?.expiresAt,
    currentTime,
  );
  const absorbShield = gameState.skillAbsorbShieldsByCompanionId?.[companionId];
  addTimedBuff(
    drafts,
    getRuntimeSkillId(
      absorbShield?.sourceSkillId,
      absorbShield?.id,
      undefined,
    ),
    absorbShield
      ? formatAbsorbShieldLine("Absorb shield", absorbShield)
      : "Absorb shield",
    absorbShield?.expiresAt,
    currentTime,
  );
  const selfMitigation =
    gameState.skillSelfMitigationBuffsByCompanionId?.[companionId];
  addTimedBuff(
    drafts,
    getRuntimeSkillId(
      selfMitigation?.sourceSkillId,
      selfMitigation?.id,
      undefined,
    ),
    selfMitigation ? formatMitigationBuffLine(selfMitigation) : "Mitigation buff",
    selfMitigation?.expiresAt,
    currentTime,
  );
  for (const buff of Object.values(gameState.skillPartyMitigationBuffsBySourceId ?? {})) {
    addTimedBuff(
      drafts,
      getRuntimeSkillId(buff.sourceSkillId, buff.id, undefined),
      `Party ${formatMitigationBuffLine(buff)}`,
      buff.expiresAt,
      currentTime,
    );
  }
  for (const block of Object.values(gameState.skillShieldBlocksById ?? {})) {
    if (block.ownerId !== companionId) {
      continue;
    }
    const skillId = getRuntimeSkillId(block.sourceSkillId, block.id, undefined);
    addTimedBuff(
      drafts,
      skillId,
      formatShieldBlockLine(
        skillId && SKILL_DEFINITIONS[skillId].tags.includes("Barrier")
          ? "Barrier"
          : "Shield",
        block,
      ),
      block.expiresAt,
      currentTime,
    );
  }
  for (const status of Object.values(gameState.statusEffectsById ?? {})) {
    addBeneficialStatusEffectBuff(drafts, status, companionId, currentTime);
  }

  return [...drafts.values()]
    .map((draft) => buildDisplayEntry(draft, currentTime))
    .sort(compareBuffDisplayEntries)
    .slice(0, maxEntries);
}

function addTimedBuff(
  drafts: Map<SkillId, CompanionBuffDisplayDraft>,
  skillId: SkillId | null | undefined,
  label: string,
  expiresAt: number | undefined,
  currentTime: number,
): void {
  if (!skillId || expiresAt === undefined || expiresAt <= currentTime) {
    return;
  }

  addEffectLine(drafts, skillId, { label, expiresAt });
}

function addUntimedBuff(
  drafts: Map<SkillId, CompanionBuffDisplayDraft>,
  skillId: SkillId | null | undefined,
  label: string,
  isActive: boolean,
): void {
  if (!skillId || !isActive) {
    return;
  }

  addEffectLine(drafts, skillId, { label });
}

function addEffectLine(
  drafts: Map<SkillId, CompanionBuffDisplayDraft>,
  skillId: SkillId,
  effectLine: BuffEffectLine,
): void {
  const draft = drafts.get(skillId) ?? {
    skillId,
    effectLines: [],
  };

  draft.effectLines.push(effectLine);
  drafts.set(skillId, draft);
}

function addBeneficialStatusEffectBuff(
  drafts: Map<SkillId, CompanionBuffDisplayDraft>,
  status: StatusEffectState,
  companionId: string,
  currentTime: number,
): void {
  if (status.targetId !== companionId || status.expiresAt <= currentTime) {
    return;
  }

  const skillId = getRuntimeSkillId(undefined, status.sourceKey, undefined);

  if (!skillId) {
    return;
  }

  if (status.type === "fakeDeath") {
    addTimedBuff(
      drafts,
      skillId,
      "Drops aggro; temporarily incapacitated",
      status.expiresAt,
      currentTime,
    );
  } else if (status.type === "forcedEvasion") {
    addTimedBuff(
      drafts,
      skillId,
      "Evades the next incoming hit",
      status.expiresAt,
      currentTime,
    );
  } else if (status.type === "nextAttackDamageBonus") {
    addTimedBuff(
      drafts,
      skillId,
      `Next attack damage ${formatPercent(status.damageMultiplierBonus * 100)}`,
      status.expiresAt,
      currentTime,
    );
  } else if (status.type === "defenseBuff") {
    addTimedBuff(
      drafts,
      skillId,
      `Defense ${formatPercent(status.defenseBonusPercent)}`,
      status.expiresAt,
      currentTime,
    );
  }
}

function formatSelfBuffLine(buff: {
  bonusDamage: number;
  movementSpeedBonusPercent?: number;
}): string {
  const parts = [`Damage ${formatSignedNumber(buff.bonusDamage)}`];

  if (buff.movementSpeedBonusPercent) {
    parts.push(`move speed ${formatPercent(buff.movementSpeedBonusPercent)}`);
  }

  return parts.join(", ");
}

function formatPartyClassBuffLine(buff: {
  primaryStatBonusPercentByStat?: Partial<Record<string, number>>;
  physicalDamageBonusPercent?: number;
  magicDamageBonusPercent?: number;
  mitigationPercent?: number;
  mitigatedDamageTypes?: string[];
  healingReceivedBonusPercent?: number;
  poisonCoating?: {
    tickDamage: number;
    poisonTickIntervalMs: number;
  };
}): string {
  const parts: string[] = [];

  for (const [stat, percent] of Object.entries(
    buff.primaryStatBonusPercentByStat ?? {},
  )) {
    if (percent !== undefined) {
      parts.push(`${formatStatLabel(stat)} ${formatPercent(percent)}`);
    }
  }

  if (buff.physicalDamageBonusPercent) {
    parts.push(`physical damage ${formatPercent(buff.physicalDamageBonusPercent)}`);
  }

  if (buff.magicDamageBonusPercent) {
    parts.push(`magic damage ${formatPercent(buff.magicDamageBonusPercent)}`);
  }

  if (buff.mitigationPercent) {
    parts.push(
      `${formatDamageTypesPrefix(buff.mitigatedDamageTypes)}mitigation ${formatPercent(
        buff.mitigationPercent,
      )}`,
    );
  }

  if (buff.healingReceivedBonusPercent) {
    parts.push(`healing received ${formatPercent(buff.healingReceivedBonusPercent)}`);
  }

  if (buff.poisonCoating) {
    parts.push(
      `poison coating ${formatNumber(buff.poisonCoating.tickDamage)} dmg/${formatSeconds(
        buff.poisonCoating.poisonTickIntervalMs,
      )}`,
    );
  }

  return parts.length > 0 ? parts.join(", ") : "Party buff";
}

function formatOverchargeLine(buff: {
  skillPowerBonusPercent: number;
  cooldownPenaltyPercent: number;
}): string {
  return `Skill power ${formatPercent(
    buff.skillPowerBonusPercent,
  )}, cooldowns +${formatNumber(buff.cooldownPenaltyPercent)}%`;
}

function formatAbsorbShieldLine(
  label: string,
  shield: { remainingAbsorb: number; maxAbsorb: number },
): string {
  return `${label} ${formatNumber(shield.remainingAbsorb)}/${formatNumber(
    shield.maxAbsorb,
  )} HP`;
}

function formatFrostArmorLine(buff: {
  defenseBonusPercent: number;
  mitigationPercent: number;
}): string {
  return `Defense ${formatPercent(buff.defenseBonusPercent)}, mitigation ${formatPercent(
    buff.mitigationPercent,
  )}`;
}

function formatHealOverTimeLine(buff: {
  healPercentMaxHealth?: number;
  healAmountPerTick?: number;
  tickIntervalMs: number;
}): string {
  if (buff.healAmountPerTick !== undefined) {
    return `Heals ${formatNumber(buff.healAmountPerTick)} HP/${formatSeconds(
      buff.tickIntervalMs,
    )}`;
  }

  if (buff.healPercentMaxHealth !== undefined) {
    return `Heals ${formatNumber(buff.healPercentMaxHealth)}% max HP/${formatSeconds(
      buff.tickIntervalMs,
    )}`;
  }

  return `Heal over time every ${formatSeconds(buff.tickIntervalMs)}`;
}

function formatRewindRuneLine(buff: {
  healPercentRecordedDamage: number;
  tickIntervalMs: number;
}): string {
  return `Stores damage; heals ${formatNumber(
    buff.healPercentRecordedDamage,
  )}%/${formatSeconds(buff.tickIntervalMs)}`;
}

function formatGatherBuffLine(buff: {
  bonusGatherSpeed: number;
  resourceType?: string;
}): string {
  const resourceLabel = buff.resourceType
    ? `${formatStatLabel(buff.resourceType)} `
    : "";

  return `${resourceLabel}gather speed ${formatSignedNumber(buff.bonusGatherSpeed)}`;
}

function formatDamageMitigationLine(buff: {
  mitigationPercent: number;
  remainingProcs: number;
  mitigatedDamageTypes?: string[];
}): string {
  return `${formatDamageTypesPrefix(buff.mitigatedDamageTypes)}mitigation ${formatPercent(
    buff.mitigationPercent,
  )} for ${buff.remainingProcs} ${buff.remainingProcs === 1 ? "hit" : "hits"}`;
}

function formatMitigationBuffLine(buff: {
  mitigationPercent: number;
  mitigatedDamageTypes?: string[];
}): string {
  const prefix = formatDamageTypesPrefix(buff.mitigatedDamageTypes);

  return `${prefix ? `${prefix}mitigation` : "Mitigation"} ${formatPercent(
    buff.mitigationPercent,
  )}`;
}

function formatShieldBlockLine(
  label: string,
  block: {
    remainingBlocks: number;
    blockedDamageTypes?: string[];
    healPercentMaxHealthOnConsume?: number;
  },
): string {
  const parts = [
    `${label} blocks ${block.remainingBlocks} ${formatDamageTypesLabel(
      block.blockedDamageTypes,
    )} ${block.remainingBlocks === 1 ? "hit" : "hits"}`,
  ];

  if (block.healPercentMaxHealthOnConsume) {
    parts.push(`heals ${formatNumber(block.healPercentMaxHealthOnConsume)}% on block`);
  }

  return parts.join(", ");
}

function buildDisplayEntry(
  draft: CompanionBuffDisplayDraft,
  currentTime: number,
): CompanionBuffDisplayEntry {
  const timedLines = draft.effectLines.filter(
    (line): line is BuffEffectLine & { expiresAt: number } =>
      line.expiresAt !== undefined,
  );
  const remainingMs =
    timedLines.length > 0
      ? Math.min(...timedLines.map((line) => line.expiresAt - currentTime))
      : undefined;
  const effectLines = draft.effectLines.map((line) =>
    line.expiresAt === undefined
      ? `${line.label}: active`
      : `${line.label}: ${formatRemainingTime(line.expiresAt - currentTime)}`,
  );
  const displayName = SKILL_DEFINITIONS[draft.skillId].displayName;
  const summary =
    remainingMs === undefined
      ? "Active"
      : `Remaining: ${formatRemainingTime(remainingMs)}`;

  return {
    skillId: draft.skillId,
    displayName,
    iconSrc: SKILL_VISUAL_ICON_SRC[draft.skillId],
    tooltip: [displayName, summary, ...effectLines].join("\n"),
    effectLines,
    remainingMs,
    isExpiring:
      remainingMs !== undefined &&
      remainingMs > 0 &&
      remainingMs <= expiringBuffThresholdMs,
    isUntimed: remainingMs === undefined,
  };
}

function compareBuffDisplayEntries(
  left: CompanionBuffDisplayEntry,
  right: CompanionBuffDisplayEntry,
): number {
  if (left.remainingMs === undefined && right.remainingMs !== undefined) {
    return 1;
  }

  if (left.remainingMs !== undefined && right.remainingMs === undefined) {
    return -1;
  }

  if (left.remainingMs !== undefined && right.remainingMs !== undefined) {
    return (
      left.remainingMs - right.remainingMs ||
      left.displayName.localeCompare(right.displayName)
    );
  }

  return left.displayName.localeCompare(right.displayName);
}

function formatRemainingTime(remainingMs: number): string {
  return `${Math.max(1, Math.ceil(remainingMs / 1000))}s`;
}

function formatSignedNumber(value: number): string {
  return value > 0 ? `+${formatNumber(value)}` : formatNumber(value);
}

function formatPercent(value: number): string {
  return `${formatSignedNumber(value)}%`;
}

function formatNumber(value: number): string {
  if (Number.isInteger(value)) {
    return value.toString();
  }

  return value.toFixed(1).replace(/\.0$/, "");
}

function formatSeconds(ms: number): string {
  return `${formatNumber(ms / 1000)}s`;
}

function formatStatLabel(stat: string): string {
  return stat
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDamageTypesPrefix(damageTypes: string[] | undefined): string {
  return damageTypes && damageTypes.length > 0
    ? `${formatDamageTypesLabel(damageTypes)} `
    : "";
}

function formatDamageTypesLabel(damageTypes: string[] | undefined): string {
  return damageTypes && damageTypes.length > 0
    ? damageTypes.map(formatStatLabel).join("/")
    : "damage";
}

function getRuntimeSkillId(
  explicitSkillId: SkillId | undefined,
  runtimeId: string | undefined,
  fallbackSkillId: SkillId | undefined,
): SkillId | null {
  if (explicitSkillId && isSkillId(explicitSkillId)) {
    return explicitSkillId;
  }

  if (runtimeId && isSkillId(runtimeId)) {
    return runtimeId;
  }

  if (runtimeId) {
    const matchingSkillId = Object.keys(SKILL_DEFINITIONS).find((skillId) =>
      runtimeId.endsWith(`-${skillId}`),
    );

    if (matchingSkillId && isSkillId(matchingSkillId)) {
      return matchingSkillId;
    }
  }

  return fallbackSkillId && isSkillId(fallbackSkillId) ? fallbackSkillId : null;
}

function isSkillId(skillId: string): skillId is SkillId {
  return skillId in SKILL_DEFINITIONS;
}
