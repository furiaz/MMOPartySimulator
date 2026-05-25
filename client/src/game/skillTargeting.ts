import { getPartyLeader, getPartyMembers } from "./partySystem";
import { getLeaderEnemyTarget } from "./roleSystem";
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
import type { Companion, Enemy, GameEntity, SkillDefinition } from "./types";

const LOW_HEALTH_BUFFER = 1;
const DEFAULT_ENEMY_CONTEXT_RANGE = 5;
const PARTY_DANGER_RANGE = 5;

export function getSkillTarget(
  state: GameState,
  caster: Companion,
  skill: SkillDefinition,
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
    return hasValidEnemyContext(state, caster) &&
      canPayHpCost(caster, skill.effect.hpCost) &&
      !state.skillSelfBuffsByCompanionId?.[caster.id]
      ? caster
      : undefined;
  }

  if (skill.effect.type === "allyBuff") {
    return hasValidEnemyContext(state, caster)
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
    return findQuickStepTarget(state, caster, skill.effect.distance);
  }

  if (skill.effect.type === "shieldBlock") {
    return hasPartyDanger(state, caster) && !hasActiveShield(state, caster)
      ? caster
      : undefined;
  }

  const enemy = findEnemyTarget(state, caster, skill.range);

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
): Enemy | undefined {
  const currentTarget = caster.currentTargetId
    ? getEntityById(state, caster.currentTargetId)
    : undefined;

  if (isLivingEnemy(currentTarget) && isEnemyInRange(caster, currentTarget, range)) {
    return currentTarget;
  }

  const leader = getPartyLeader(state);
  const leaderTarget = leader ? getLeaderEnemyTarget(state, leader) : undefined;

  if (leaderTarget && isEnemyInRange(caster, leaderTarget, range)) {
    return leaderTarget;
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

function hasValidEnemyContext(state: GameState, caster: Companion): boolean {
  return Boolean(findEnemyTarget(state, caster, DEFAULT_ENEMY_CONTEXT_RANGE));
}

function hasLungeDamageContext(
  state: GameState,
  caster: Companion,
  enemy: Enemy,
): boolean {
  const currentTarget = caster.currentTargetId
    ? getEntityById(state, caster.currentTargetId)
    : undefined;
  const leader = getPartyLeader(state);
  const leaderTarget = leader ? getLeaderEnemyTarget(state, leader) : undefined;
  const partyExecutionIntent = getPartyExecutionIntent(state);

  return (
    currentTarget?.id === enemy.id ||
    leaderTarget?.id === enemy.id ||
    partyExecutionIntent?.type === "attack" ||
    !partyExecutionIntent
  );
}

function findQuickStepTarget(
  state: GameState,
  caster: Companion,
  distance: number,
): Enemy | undefined {
  if (isFrontlineQuickStepRole(caster)) {
    const enemy = findEnemyTarget(state, caster, 6);

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
