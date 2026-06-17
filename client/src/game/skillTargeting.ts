import { getPartyLeader, getPartyMembers } from "./partySystem";
import {
  isActiveResource,
  isLivingCompanion,
  isLivingEnemy,
  isTargetDummyEnemy,
} from "./entityGuards";
import {
  getClearLungePosition,
  getDirectionAwayFrom,
  getDirectionToward,
  getSkillDashPosition,
} from "./skillMovement";
import { getCompanionAttackRange } from "./companionCombat";
import { getGridDistance } from "./positionUtils";
import { getEntityById, type GameState } from "./state";
import { getPartyExecutionIntent } from "./partyIntentState";
import { getPartyCombatTarget } from "./partyTargetSystem";
import {
  getCompanionSkillBehavior,
  isBeginnerFirstAidSelfHealPriorityActive,
} from "./skillBehavior";
import { isFakeDeathActive } from "./statusEffects";
import type {
  Companion,
  Enemy,
  GameEntity,
  ResourceType,
  SkillDefinition,
} from "./types";

const LOW_HEALTH_BUFFER = 1;
const DEFAULT_ENEMY_CONTEXT_RANGE = 5;
const PARTY_DANGER_RANGE = 5;
const BEGINNER_THROW_ROCK_LOW_HEALTH_PROTECT_THRESHOLD_PERCENT = 30;
const BEGINNER_KICK_LEADER_OPENING_RANGE = 5;
const BEGINNER_FIELD_HANDS_RESOURCE_RANGE = 5;
const SUPPORT_FOCUS_HP_THRESHOLD_PERCENT = 70;

export type SkillTargetOptions = {
  now?: number;
  forcedEnemyTargetId?: string | null;
  enemyFilter?: (enemy: Enemy) => boolean;
  firstAidReservedTargetIds?: ReadonlySet<string>;
};

export function getSkillTarget(
  state: GameState,
  caster: Companion,
  skill: SkillDefinition,
  options: SkillTargetOptions = {},
): Enemy | Companion | undefined {
  if (skill.effect.type === "selfPercentHeal") {
    return isSelfPercentHealPriorityActive(caster, skill) ? caster : undefined;
  }

  if (isHealingSkill(skill)) {
    if (
      skill.effect.type === "selfCostHeal" &&
      !canPayHpCost(caster, skill.effect.hpCost)
    ) {
      return undefined;
    }

    return isBeginnerFirstAidSelfHealPriorityActive(caster, skill) &&
      getGridDistance(caster.position, caster.position) <= skill.range
      ? caster
      : skill.id === "first_aid"
        ? findFirstAidTarget(state, caster, skill.range, options)
        : findHealingTarget(state, caster, skill.range);
  }

  if (skill.effect.type === "selfBuff") {
    return hasValidEnemyContext(state, caster, options) &&
      canPayHpCost(caster, skill.effect.hpCost) &&
      canUseRefreshableRuntimeState(
        state.skillSelfBuffsByCompanionId?.[caster.id]?.expiresAt,
        skill.effect.refreshWindowMs,
        options.now,
      )
      ? caster
      : undefined;
  }

  if (skill.effect.type === "partyBuff") {
    return hasValidEnemyContext(state, caster, options) &&
      canUseRefreshableRuntimeState(
        state.skillPartyBuffsBySourceId?.[caster.id]?.expiresAt,
        skill.effect.refreshWindowMs,
        options.now,
      )
      ? caster
      : undefined;
  }

  if (skill.effect.type === "lifestealBuff") {
    return hasPartyDanger(state, caster) &&
      isBloodFeastUseThresholdActive(caster) &&
      !hasActiveLifestealBuff(state, caster)
      ? caster
      : undefined;
  }

  if (skill.effect.type === "partyPoisonCoating") {
    return hasValidEnemyContext(state, caster, options) &&
      canUseRefreshableRuntimeState(
        state.skillPartyPoisonCoatingsBySourceId?.[caster.id]?.expiresAt,
        skill.effect.refreshWindowMs,
        options.now,
      )
      ? caster
      : undefined;
  }

  if (skill.effect.type === "allyBuff") {
    return hasValidEnemyContext(state, caster, options)
      ? findAllyBuffTarget(state, caster, skill.range)
      : undefined;
  }

  if (skill.effect.type === "gatherBuff") {
    return hasGatherBuffResourceContext(state, caster, skill.effect.resourceType) &&
      canUseRefreshableRuntimeState(
        state.skillGatherBuffsByCompanionId?.[caster.id]?.expiresAt,
        skill.effect.refreshWindowMs,
        options.now,
      )
      ? caster
      : undefined;
  }

  if (skill.effect.type === "multiTaunt") {
    return (
      findEnemyTarget(state, caster, skill.range, {
        ...options,
        enemyFilter: (targetEnemy) =>
          targetEnemy.currentTargetId !== caster.id &&
          (!options.enemyFilter || options.enemyFilter(targetEnemy)),
      }) ?? findEnemyTarget(state, caster, skill.range, options)
    );
  }

  if (skill.effect.type === "shockwave") {
    return hasEnemyInRange(state, caster, skill.effect.radius) ? caster : undefined;
  }

  if (skill.effect.type === "quickStep") {
    return findQuickStepTarget(state, caster, skill.effect.distance, options);
  }

  if (skill.effect.type === "skirmishShot") {
    return findSkirmishShotTarget(state, caster, skill, options);
  }

  if (skill.effect.type === "pounce") {
    return findPounceTarget(state, caster, skill, options);
  }

  if (skill.effect.type === "maulSweep") {
    return hasEnemyInRange(state, caster, skill.effect.radius) ? caster : undefined;
  }

  if (skill.effect.type === "fakeDeath") {
    return hasPartyDanger(state, caster) &&
      isFakeDeathUseThresholdActive(caster) &&
      !isFakeDeathActive(state, caster.id)
      ? caster
      : undefined;
  }

  if (skill.effect.type === "forcedEvasion") {
    return hasPartyDanger(state, caster) &&
      !hasActiveStatusEffect(state, caster.id, skill.id)
      ? caster
      : undefined;
  }

  if (skill.effect.type === "shieldBlock") {
    return hasPartyDanger(state, caster) && !hasActiveShield(state, caster)
      ? caster
      : undefined;
  }

  if (skill.effect.type === "absorbShield") {
    return hasPartyDanger(state, caster) && !hasActiveAbsorbShield(state, caster)
      ? caster
      : undefined;
  }

  if (skill.effect.type === "holdFast") {
    return hasPartyDanger(state, caster) &&
      isHoldFastUseThresholdActive(caster) &&
      !hasActiveHoldFast(state, caster, skill)
      ? caster
      : undefined;
  }

  if (skill.effect.type === "damageMitigation") {
    return hasPartyDanger(state, caster) && !hasActiveDamageMitigation(state, caster)
      ? caster
      : undefined;
  }

  if (skill.effect.type === "selfMitigationBuff") {
    return hasPartyDanger(state, caster) &&
      canUseRefreshableRuntimeState(
        state.skillSelfMitigationBuffsByCompanionId?.[caster.id]?.expiresAt,
        skill.effect.refreshWindowMs,
        options.now,
      )
      ? caster
      : undefined;
  }

  if (skill.effect.type === "partyMitigationBuff") {
    return hasPartyDanger(state, caster) &&
      canUseRefreshableRuntimeState(
        state.skillPartyMitigationBuffsBySourceId?.[caster.id]?.expiresAt,
        skill.effect.refreshWindowMs,
        options.now,
      )
      ? caster
      : undefined;
  }

  const enemy =
    skill.id === "throw_rock"
      ? findProtectiveTauntTarget(state, caster, skill.range, options) ??
        findEnemyTarget(state, caster, skill.range, {
          ...options,
          enemyFilter: (targetEnemy) =>
            targetEnemy.currentTargetId !== caster.id &&
            (!options.enemyFilter || options.enemyFilter(targetEnemy)),
        })
      : skill.id === "kick" && skill.effect.type === "lungeDamage"
        ? findKickTarget(state, caster, skill, options)
        : findEnemyTarget(state, caster, skill.range, {
            ...options,
            enemyFilter:
              skill.effect.type === "taunt"
                ? (targetEnemy) => targetEnemy.currentTargetId !== caster.id
                : options.enemyFilter,
          });

  if (!enemy) {
    return undefined;
  }

  if (skill.effect.type === "lungeDamage") {
    return hasLungeDamageContext(state, caster, enemy) &&
      !isEnemyInNormalAttackRange(caster, enemy) &&
      getClearLungePosition(
        state,
        caster,
        enemy,
        skill.effect.lungeDistance,
      )
      ? enemy
      : undefined;
  }

  if (
    skill.effect.type === "pinningShot" &&
    hasActiveStatusEffect(state, enemy.id, skill.id)
  ) {
    return undefined;
  }

  if (skill.effect.type === "bind" && state.skillBindsByEnemyId?.[enemy.id]) {
    return undefined;
  }

  return enemy;
}

export function findEnemyTarget(
  state: GameState,
  caster: Companion,
  range: number,
  options: SkillTargetOptions = {},
): Enemy | undefined {
  if (options.forcedEnemyTargetId) {
    const forcedTarget = getEntityById(state, options.forcedEnemyTargetId);

    return isLivingEnemy(forcedTarget) &&
      isEnemyInRange(caster, forcedTarget, range) &&
      isAllowedEnemyTarget(forcedTarget, options)
      ? forcedTarget
      : undefined;
  }

  const currentTarget = caster.currentTargetId
    ? getEntityById(state, caster.currentTargetId)
    : undefined;

  if (
    isLivingEnemy(currentTarget) &&
    isEnemyInRange(caster, currentTarget, range) &&
    isAllowedEnemyTarget(currentTarget, options)
  ) {
    return currentTarget;
  }

  const partyTarget = getPartyCombatTarget(state);

  if (
    partyTarget &&
    isEnemyInRange(caster, partyTarget, range) &&
    isAllowedEnemyTarget(partyTarget, options)
  ) {
    return partyTarget;
  }

  return Object.values(state.entities).find(
    (entity): entity is Enemy =>
      isLivingEnemy(entity) &&
      !isTargetDummyEnemy(entity) &&
      isEnemyInRange(caster, entity, range) &&
      isAllowedEnemyTarget(entity, options),
  );
}

function isAllowedEnemyTarget(
  enemy: Enemy,
  options: SkillTargetOptions,
): boolean {
  return options.enemyFilter ? options.enemyFilter(enemy) : true;
}

function findHealingTarget(
  state: GameState,
  caster: Companion,
  range: number,
): Companion | undefined {
  return getPartyMembers(state)
    .filter(
      (member) =>
        member.state !== "dead" &&
        member.health < member.maxHealth &&
        getGridDistance(caster.position, member.position) <= range,
    )
    .sort(
      (a, b) =>
        a.health / a.maxHealth - b.health / b.maxHealth ||
        getGridDistance(caster.position, a.position) -
          getGridDistance(caster.position, b.position),
    )[0];
}

function findFirstAidTarget(
  state: GameState,
  caster: Companion,
  range: number,
  options: SkillTargetOptions,
): Companion | undefined {
  const inCombat = hasPartyCombatContext(state, caster);
  const behavior = getCompanionSkillBehavior(caster);

  if (caster.role !== "support" && inCombat) {
    return undefined;
  }

  const allyCandidates = getPartyMembers(state).filter((member) =>
    isFirstAidAllyCandidate(caster, member, range, {
      hpThresholdPercent: behavior.beginnerFirstAidAllyHealHpThresholdPercent,
      inCombat,
      options,
    }),
  );

  const focusedTarget =
    caster.role === "support"
      ? findSupportFocusFirstAidTarget(state, caster, range, {
          inCombat,
          options,
          supportFocus: behavior.supportFocus,
        })
      : undefined;

  return focusedTarget ?? sortFirstAidTargets(caster, allyCandidates)[0];
}

function isFirstAidAllyCandidate(
  caster: Companion,
  member: Companion,
  range: number,
  {
    hpThresholdPercent,
    inCombat,
    options,
  }: {
    hpThresholdPercent: number;
    inCombat: boolean;
    options: SkillTargetOptions;
  },
): boolean {
  return (
    member.id !== caster.id &&
    isLivingCompanion(member) &&
    member.health < member.maxHealth &&
    isCompanionAtOrBelowHpThreshold(member, hpThresholdPercent) &&
    getGridDistance(caster.position, member.position) <= range &&
    (inCombat || !options.firstAidReservedTargetIds?.has(member.id))
  );
}

function findSupportFocusFirstAidTarget(
  state: GameState,
  caster: Companion,
  range: number,
  {
    inCombat,
    options,
    supportFocus,
  }: {
    inCombat: boolean;
    options: SkillTargetOptions;
    supportFocus: Companion["skillBehavior"]["supportFocus"];
  },
): Companion | undefined {
  if (supportFocus === "leader") {
    const leader = getPartyLeader(state);

    return leader &&
      isFirstAidFocusedAllyCandidate(caster, leader, range, {
        inCombat,
        options,
      })
      ? leader
      : undefined;
  }

  if (supportFocus === "defender") {
    return sortFirstAidTargets(
      caster,
      getPartyMembers(state).filter(
        (member) =>
          member.role === "defender" &&
          isFirstAidFocusedAllyCandidate(caster, member, range, {
            inCombat,
            options,
          }),
      ),
    )[0];
  }

  return undefined;
}

function isFirstAidFocusedAllyCandidate(
  caster: Companion,
  member: Companion,
  range: number,
  {
    inCombat,
    options,
  }: {
    inCombat: boolean;
    options: SkillTargetOptions;
  },
): boolean {
  return (
    member.id !== caster.id &&
    isLivingCompanion(member) &&
    member.health < member.maxHealth &&
    isCompanionAtOrBelowHpThreshold(member, SUPPORT_FOCUS_HP_THRESHOLD_PERCENT) &&
    getGridDistance(caster.position, member.position) <= range &&
    (inCombat || !options.firstAidReservedTargetIds?.has(member.id))
  );
}

function sortFirstAidTargets(
  caster: Companion,
  targets: Companion[],
): Companion[] {
  return targets.sort(
    (a, b) =>
      a.health / a.maxHealth - b.health / b.maxHealth ||
      getGridDistance(caster.position, a.position) -
        getGridDistance(caster.position, b.position) ||
      a.id.localeCompare(b.id),
  );
}

function isCompanionAtOrBelowHpThreshold(
  companion: Companion,
  thresholdPercent: number,
): boolean {
  return (
    companion.maxHealth > 0 &&
    (companion.health / companion.maxHealth) * 100 <= thresholdPercent
  );
}

function findAllyBuffTarget(
  state: GameState,
  caster: Companion,
  range: number,
): Companion | undefined {
  return getPartyMembers(state)
    .filter(
      (member) =>
        isLivingCompanion(member) &&
        !state.skillSelfBuffsByCompanionId?.[member.id] &&
        getGridDistance(caster.position, member.position) <= range,
    )
    .sort(
      (a, b) =>
        getRallyCallRolePriority(a) - getRallyCallRolePriority(b) ||
        (a.id === caster.id ? 1 : 0) - (b.id === caster.id ? 1 : 0) ||
        getGridDistance(caster.position, a.position) -
          getGridDistance(caster.position, b.position),
    )[0];
}

function getRallyCallRolePriority(companion: Companion): number {
  switch (companion.role) {
    case "fighter":
      return 0;
    case "defender":
      return 1;
    case "gatherer":
      return 2;
    case "support":
      return 3;
    case "none":
      return 4;
  }
}

function hasValidEnemyContext(
  state: GameState,
  caster: Companion,
  options: SkillTargetOptions,
): boolean {
  return Boolean(
    findEnemyTarget(state, caster, DEFAULT_ENEMY_CONTEXT_RANGE, options),
  );
}

export function hasPartyCombatContext(
  state: GameState,
  caster: Companion,
): boolean {
  const currentTarget = caster.currentTargetId
    ? getEntityById(state, caster.currentTargetId)
    : undefined;
  const partyMemberIds = new Set(getPartyMembers(state).map((member) => member.id));

  return Boolean(
    getPartyCombatTarget(state) ||
      (caster.state === "attack" && isLivingEnemy(currentTarget)) ||
      Object.values(state.entities).some(
        (entity) =>
          isLivingEnemy(entity) &&
          entity.state === "attack" &&
          Boolean(
            entity.currentTargetId &&
              partyMemberIds.has(entity.currentTargetId),
          ),
      ),
  );
}

function hasLungeDamageContext(
  state: GameState,
  caster: Companion,
  enemy: Enemy,
): boolean {
  const currentTarget = caster.currentTargetId
    ? getEntityById(state, caster.currentTargetId)
    : undefined;
  const partyTarget = getPartyCombatTarget(state);
  const partyExecutionIntent = getPartyExecutionIntent(state);

  return (
    currentTarget?.id === enemy.id ||
    partyTarget?.id === enemy.id ||
    !partyExecutionIntent
  );
}

function findProtectiveTauntTarget(
  state: GameState,
  caster: Companion,
  range: number,
  options: SkillTargetOptions,
): Enemy | undefined {
  return getProtectiveTauntCandidates(state, caster, range, options)[0];
}

function getProtectiveTauntCandidates(
  state: GameState,
  caster: Companion,
  range: number,
  options: SkillTargetOptions,
): Enemy[] {
  return Object.values(state.entities)
    .filter(
      (entity): entity is Enemy =>
        isLivingEnemy(entity) &&
        entity.currentTargetId !== caster.id &&
        isEnemyInRange(caster, entity, range) &&
        isAllowedEnemyTarget(entity, options) &&
        isProtectiveTauntTarget(state, entity),
    )
    .sort(
      (a, b) =>
        getProtectiveTauntPriority(state, a) -
          getProtectiveTauntPriority(state, b) ||
        getGridDistance(caster.position, a.position) -
          getGridDistance(caster.position, b.position) ||
        a.id.localeCompare(b.id),
    );
}

export function isProtectiveTauntSkillUse(
  state: GameState,
  skill: SkillDefinition,
  target: Enemy | Companion | undefined,
): target is Enemy {
  return skill.id === "throw_rock" && isLivingEnemy(target) && isProtectiveTauntTarget(state, target);
}

function isProtectiveTauntTarget(state: GameState, enemy: Enemy): boolean {
  const target = enemy.currentTargetId
    ? getEntityById(state, enemy.currentTargetId)
    : undefined;

  return isLivingCompanion(target) && isProtectiveTauntCompanion(target);
}

function isProtectiveTauntCompanion(companion: Companion): boolean {
  return (
    companion.role === "support" ||
    (companion.maxHealth > 0 &&
      (companion.health / companion.maxHealth) * 100 <=
        BEGINNER_THROW_ROCK_LOW_HEALTH_PROTECT_THRESHOLD_PERCENT)
  );
}

function getProtectiveTauntPriority(state: GameState, enemy: Enemy): number {
  const target = enemy.currentTargetId
    ? getEntityById(state, enemy.currentTargetId)
    : undefined;

  return isLivingCompanion(target) && target.role === "support" ? 0 : 1;
}

function findKickTarget(
  state: GameState,
  caster: Companion,
  skill: SkillDefinition,
  options: SkillTargetOptions,
): Enemy | undefined {
  if (skill.effect.type !== "lungeDamage") {
    return undefined;
  }

  const candidates = getReachableKickCandidates(
    state,
    caster,
    skill.range,
    skill.effect.lungeDistance,
    options,
  );

  if (caster.role === "support" || caster.role === "gatherer") {
    return candidates.find((enemy) => enemy.currentTargetId === caster.id);
  }

  if (options.forcedEnemyTargetId) {
    return candidates.find((enemy) => enemy.id === options.forcedEnemyTargetId);
  }

  return candidates.sort(
    (a, b) =>
      getKickTargetPriority(state, caster, a) -
        getKickTargetPriority(state, caster, b) ||
      getGridDistance(caster.position, a.position) -
        getGridDistance(caster.position, b.position) ||
      a.id.localeCompare(b.id),
  )[0];
}

function getReachableKickCandidates(
  state: GameState,
  caster: Companion,
  range: number,
  lungeDistance: number,
  options: SkillTargetOptions,
): Enemy[] {
  return Object.values(state.entities).filter(
    (entity): entity is Enemy =>
      isLivingEnemy(entity) &&
      isEnemyInRange(caster, entity, range) &&
      isAllowedEnemyTarget(entity, options) &&
      (hasLungeDamageContext(state, caster, entity) ||
        entity.currentTargetId === caster.id ||
        isEnemyAttackingRole(state, entity, "support")) &&
      !isEnemyInNormalAttackRange(caster, entity) &&
      Boolean(
        getClearLungePosition(
          state,
          caster,
          entity,
          lungeDistance,
        ),
      ),
  );
}

function getKickTargetPriority(
  state: GameState,
  caster: Companion,
  enemy: Enemy,
): number {
  if (isEnemyAttackingRole(state, enemy, "support")) {
    return 0;
  }

  return isLeaderOpeningKickTarget(state, caster, enemy) ? 1 : 2;
}

export function isSupportAttackerKickSkillUse(
  state: GameState,
  skill: SkillDefinition,
  target: Enemy | Companion | undefined,
): target is Enemy {
  return skill.id === "kick" && isLivingEnemy(target) && isEnemyAttackingRole(state, target, "support");
}

export function isLeaderOpeningKickSkillUse(
  state: GameState,
  caster: Companion,
  skill: SkillDefinition,
  target: Enemy | Companion | undefined,
): target is Enemy {
  return (
    skill.id === "kick" &&
    isLivingEnemy(target) &&
    isLeaderOpeningKickTarget(state, caster, target)
  );
}

function isEnemyAttackingRole(
  state: GameState,
  enemy: Enemy,
  role: Companion["role"],
): boolean {
  const target = enemy.currentTargetId
    ? getEntityById(state, enemy.currentTargetId)
    : undefined;

  return isLivingCompanion(target) && target.role === role;
}

function isLeaderOpeningKickTarget(
  state: GameState,
  caster: Companion,
  enemy: Enemy,
): boolean {
  const leader = getPartyLeader(state);

  return Boolean(
    leader &&
      getGridDistance(leader.position, enemy.position) <=
        BEGINNER_KICK_LEADER_OPENING_RANGE &&
      !(leader.state === "attack" && leader.currentTargetId === enemy.id) &&
      hasLungeDamageContext(state, caster, enemy),
  );
}

function findQuickStepTarget(
  state: GameState,
  caster: Companion,
  distance: number,
  options: SkillTargetOptions,
): Enemy | undefined {
  if (getCompanionSkillBehavior(caster).mobilitySkillUseMode === "offensive") {
    const enemy = findEnemyTarget(state, caster, 6, options);

    return enemy &&
      getSkillDashPosition(
        state,
        caster,
        getDirectionToward(caster, enemy),
        distance,
        { allowAngles: true },
      )
      ? enemy
      : undefined;
  }

  const threat = findQuickStepThreat(state, caster);

  return threat &&
    getSkillDashPosition(
      state,
      caster,
      getDirectionAwayFrom(caster, threat),
      distance,
      { allowAngles: true },
    )
    ? threat
    : undefined;
}

function findQuickStepThreat(
  state: GameState,
  caster: Companion,
): Enemy | undefined {
  return Object.values(state.entities)
    .filter(
      (entity): entity is Enemy =>
        isLivingEnemy(entity) &&
        entity.state === "attack" &&
        Boolean(entity.currentTargetId) &&
        getGridDistance(entity.position, caster.position) <= PARTY_DANGER_RANGE,
    )
    .sort(
      (a, b) =>
        (b.currentTargetId === caster.id ? 1 : 0) -
          (a.currentTargetId === caster.id ? 1 : 0) ||
        getGridDistance(caster.position, a.position) -
          getGridDistance(caster.position, b.position),
    )[0];
}

function findSkirmishShotTarget(
  state: GameState,
  caster: Companion,
  skill: SkillDefinition,
  options: SkillTargetOptions,
): Enemy | undefined {
  if (skill.effect.type !== "skirmishShot") {
    return undefined;
  }

  if (getCompanionSkillBehavior(caster).mobilitySkillUseMode === "offensive") {
    const enemy = findEnemyTarget(state, caster, skill.range, options);

    return enemy &&
      getSkillDashPosition(
        state,
        caster,
        getDirectionToward(caster, enemy),
        skill.effect.distance,
        { allowAngles: true },
      )
      ? enemy
      : undefined;
  }

  const threat = findQuickStepThreat(state, caster);

  return threat &&
    isEnemyInRange(caster, threat, skill.range) &&
    getSkillDashPosition(
      state,
      caster,
      getDirectionAwayFrom(caster, threat),
      skill.effect.distance,
      { allowAngles: true },
    )
    ? threat
    : undefined;
}

function findPounceTarget(
  state: GameState,
  caster: Companion,
  skill: SkillDefinition,
  options: SkillTargetOptions,
): Enemy | undefined {
  if (skill.effect.type !== "pounce") {
    return undefined;
  }

  if (getCompanionSkillBehavior(caster).mobilitySkillUseMode === "offensive") {
    const enemy = findEnemyTarget(state, caster, skill.range, options);

    return enemy &&
      getSkillDashPosition(
        state,
        caster,
        getDirectionToward(caster, enemy),
        skill.effect.distance,
        { allowAngles: true },
      )
      ? enemy
      : undefined;
  }

  const threat = findQuickStepThreat(state, caster);

  return threat &&
    isEnemyInRange(caster, threat, skill.range) &&
    getSkillDashPosition(
      state,
      caster,
      getDirectionAwayFrom(caster, threat),
      skill.effect.distance,
      { allowAngles: true },
    )
    ? threat
    : undefined;
}

function hasGatherBuffResourceContext(
  state: GameState,
  caster: Companion,
  resourceType?: ResourceType,
): boolean {
  const currentTarget = caster.currentTargetId
    ? getEntityById(state, caster.currentTargetId)
    : undefined;

  return Boolean(
    isActiveResource(currentTarget) &&
      (!resourceType || currentTarget.resourceType === resourceType) &&
      getGridDistance(caster.position, currentTarget.position) <=
        BEGINNER_FIELD_HANDS_RESOURCE_RANGE,
  );
}

function hasPartyDanger(state: GameState, caster: Companion): boolean {
  return Object.values(state.entities).some(
    (entity: GameEntity) =>
      entity.kind === "enemy" &&
      entity.state === "attack" &&
      entity.currentTargetId &&
      getGridDistance(entity.position, caster.position) <= PARTY_DANGER_RANGE,
  );
}

function hasActiveShield(state: GameState, caster: Companion): boolean {
  return Object.values(state.skillShieldBlocksById ?? {}).some(
    (shield) => shield.ownerId === caster.id,
  );
}

function hasActiveDamageMitigation(state: GameState, caster: Companion): boolean {
  return Boolean(state.skillDamageMitigationsByCompanionId?.[caster.id]);
}

function hasActiveAbsorbShield(state: GameState, caster: Companion): boolean {
  return Boolean(state.skillAbsorbShieldsByCompanionId?.[caster.id]);
}

function hasActiveLifestealBuff(state: GameState, caster: Companion): boolean {
  return Boolean(state.skillLifestealBuffsByCompanionId?.[caster.id]);
}

function hasActiveHoldFast(
  state: GameState,
  caster: Companion,
  skill: SkillDefinition,
): boolean {
  return (
    hasActiveAbsorbShield(state, caster) ||
    Object.values(state.statusEffectsById ?? {}).some(
      (status) => status.targetId === caster.id && status.sourceKey === skill.id,
    )
  );
}

function hasActiveStatusEffect(
  state: GameState,
  targetId: string,
  sourceKey: string,
): boolean {
  return Object.values(state.statusEffectsById ?? {}).some(
    (status) => status.targetId === targetId && status.sourceKey === sourceKey,
  );
}

function isHoldFastUseThresholdActive(caster: Companion): boolean {
  return isCompanionAtOrBelowHpThreshold(
    caster,
    getCompanionSkillBehavior(caster).holdFastUseHpThresholdPercent,
  );
}

function isFakeDeathUseThresholdActive(caster: Companion): boolean {
  return isCompanionAtOrBelowHpThreshold(
    caster,
    getCompanionSkillBehavior(caster).fakeDeathUseHpThresholdPercent,
  );
}

function isBloodFeastUseThresholdActive(caster: Companion): boolean {
  return isCompanionAtOrBelowHpThreshold(
    caster,
    getCompanionSkillBehavior(caster).bloodFeastUseHpThresholdPercent,
  );
}

function isHealingSkill(skill: SkillDefinition): boolean {
  return skill.effect.type === "heal" || skill.effect.type === "selfCostHeal";
}

function isSelfPercentHealPriorityActive(
  caster: Companion,
  skill: SkillDefinition,
): boolean {
  const thresholdPercent =
    skill.id === "second_wind"
      ? getCompanionSkillBehavior(caster).secondWindSelfHealHpThresholdPercent
      : null;

  return (
    thresholdPercent !== null &&
    caster.maxHealth > 0 &&
    caster.health < caster.maxHealth &&
    (caster.health / caster.maxHealth) * 100 <= thresholdPercent
  );
}

function hasEnemyInRange(
  state: GameState,
  caster: Companion,
  range: number,
): boolean {
  return Object.values(state.entities).some(
    (entity): entity is Enemy =>
      isLivingEnemy(entity) &&
      getGridDistance(caster.position, entity.position) <= range,
  );
}

function canUseRefreshableRuntimeState(
  expiresAt: number | undefined,
  refreshWindowMs = 0,
  now = Date.now(),
): boolean {
  return expiresAt === undefined || expiresAt - now <= refreshWindowMs;
}

function canPayHpCost(caster: Companion, hpCost: number): boolean {
  return caster.health > hpCost + LOW_HEALTH_BUFFER;
}

function isEnemyInRange(
  caster: Companion,
  enemy: Enemy,
  range: number,
): boolean {
  return getGridDistance(caster.position, enemy.position) <= range;
}

function isEnemyInNormalAttackRange(
  caster: Companion,
  enemy: Enemy,
): boolean {
  return (
    getGridDistance(caster.position, enemy.position) <=
    getCompanionAttackRange(caster)
  );
}
