import { getPartyMembers } from "./partySystem";
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
import { getEntityById, getPartyExecutionIntent, type GameState } from "./state";
import { getPartyCombatTarget } from "./partyTargetSystem";
import type { Companion, Enemy, GameEntity, SkillDefinition } from "./types";

const LOW_HEALTH_BUFFER = 1;
const DEFAULT_ENEMY_CONTEXT_RANGE = 5;
const PARTY_DANGER_RANGE = 5;

export type SkillTargetOptions = {
  forcedEnemyTargetId?: string | null;
};

export function getSkillTarget(
  state: GameState,
  caster: Companion,
  skill: SkillDefinition,
  options: SkillTargetOptions = {},
): Enemy | Companion | undefined {
  if (isHealingSkill(skill)) {
    if (
      skill.effect.type === "selfCostHeal" &&
      !canPayHpCost(caster, skill.effect.hpCost)
    ) {
      return undefined;
    }

    return findHealingTarget(state, caster, skill.range);
  }

  if (skill.effect.type === "selfBuff") {
    return hasValidEnemyContext(state, caster, options) &&
      canPayHpCost(caster, skill.effect.hpCost) &&
      !state.skillSelfBuffsByCompanionId?.[caster.id]
      ? caster
      : undefined;
  }

  if (skill.effect.type === "allyBuff") {
    return hasValidEnemyContext(state, caster, options)
      ? findAllyBuffTarget(state, caster, skill.range)
      : undefined;
  }

  if (skill.effect.type === "gatherBuff") {
    return hasResourceContext(state, caster) &&
      !state.skillGatherBuffsByCompanionId?.[caster.id]
      ? caster
      : undefined;
  }

  if (skill.effect.type === "quickStep") {
    return findQuickStepTarget(state, caster, skill.effect.distance, options);
  }

  if (skill.effect.type === "shieldBlock") {
    return hasPartyDanger(state, caster) && !hasActiveShield(state, caster)
      ? caster
      : undefined;
  }

  const enemy = findEnemyTarget(state, caster, skill.range, options);

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

  if (skill.effect.type === "mark" && state.skillMarksByEnemyId?.[enemy.id]) {
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
      isEnemyInRange(caster, forcedTarget, range)
      ? forcedTarget
      : undefined;
  }

  const currentTarget = caster.currentTargetId
    ? getEntityById(state, caster.currentTargetId)
    : undefined;

  if (isLivingEnemy(currentTarget) && isEnemyInRange(caster, currentTarget, range)) {
    return currentTarget;
  }

  const partyTarget = getPartyCombatTarget(state);

  if (partyTarget && isEnemyInRange(caster, partyTarget, range)) {
    return partyTarget;
  }

  return Object.values(state.entities).find(
    (entity): entity is Enemy =>
      isLivingEnemy(entity) &&
      !isTargetDummyEnemy(entity) &&
      isEnemyInRange(caster, entity, range),
  );
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
        (a.id === caster.id ? 1 : 0) - (b.id === caster.id ? 1 : 0) ||
        getGridDistance(caster.position, a.position) -
          getGridDistance(caster.position, b.position),
    )[0];
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

function findQuickStepTarget(
  state: GameState,
  caster: Companion,
  distance: number,
  options: SkillTargetOptions,
): Enemy | undefined {
  if (isFrontlineQuickStepRole(caster)) {
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

function isFrontlineQuickStepRole(caster: Companion): boolean {
  return caster.role === "defender" || caster.role === "fighter";
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

function hasResourceContext(state: GameState, caster: Companion): boolean {
  const currentTarget = caster.currentTargetId
    ? getEntityById(state, caster.currentTargetId)
    : undefined;

  if (isActiveResource(currentTarget)) {
    return true;
  }

  return Object.values(state.entities).some(
    (entity) =>
      isActiveResource(entity) &&
      getGridDistance(caster.position, entity.position) <= DEFAULT_ENEMY_CONTEXT_RANGE,
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

function isHealingSkill(skill: SkillDefinition): boolean {
  return skill.effect.type === "heal" || skill.effect.type === "selfCostHeal";
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
