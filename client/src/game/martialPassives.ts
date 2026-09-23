import { isLivingCompanion, isLivingEnemy } from "./entityGuards";
import { getLearnedPassiveRank, getHeadhunterStackCap } from "./passiveSkills";
import { getEuclideanDistance } from "./positionUtils";
import { getSkillScaleUnits } from "./skillProgression";
import type { GameState } from "./state";
import type {
  CombatDamageType,
  CombatEntity,
  Companion,
  Enemy,
  Position,
} from "./types";

const RIPOSTE_DURATION_MS = 10_000;
const ROOTED_BASTION_DELAY_MS = 5_000;
const HEADHUNTER_WINDOW_MS = 30_000;
const PACK_INSTINCT_RANGE = 2;
const CONTROLLED_STATUS_TYPES = new Set([
  "immobilized",
  "disarmed",
  "forcedEvasion",
  "silenced",
]);

export function getMartialPassiveDamageBonusPercent(
  state: GameState,
  attacker: CombatEntity,
  target: CombatEntity,
  damageType: CombatDamageType,
  source: "direct" | "dot",
  atTime = state.simulationTimeMs ?? Date.now(),
): number {
  if (!isLivingCompanion(attacker) || !isLivingEnemy(target)) {
    return 0;
  }

  let bonus = 0;

  if (source === "direct" && damageType === "physical") {
    const momentumRank = getLearnedPassiveRank(attacker, "duelists_momentum");
    const momentum = state.duelistsMomentumByCompanionId?.[attacker.id];
    if (momentumRank && momentum?.targetId === target.id) {
      bonus += momentum.stacks * getSkillScaleUnits(momentumRank);
    }

    const riposteRank = getLearnedPassiveRank(attacker, "riposte_training");
    const riposte = state.riposteTrainingByCompanionId?.[attacker.id];
    if (riposteRank && riposte && riposte.expiresAt > atTime) {
      bonus += 5 * getSkillScaleUnits(riposteRank);
    }

    const exploitRank = getLearnedPassiveRank(attacker, "exploit_the_snare");
    if (exploitRank && isEnemyControlled(state, target, atTime)) {
      bonus += 3 * getSkillScaleUnits(exploitRank);
    }
  }

  if (damageType === "physical") {
    const bloodScentRank = getLearnedPassiveRank(attacker, "blood_scent");
    if (
      bloodScentRank &&
      target.maxHealth > 0 &&
      target.health / target.maxHealth <= 0.3
    ) {
      bonus += 3 * getSkillScaleUnits(bloodScentRank);
    }
  }

  const packInstinctRank = getLearnedPassiveRank(attacker, "pack_instinct");
  if (packInstinctRank && hasNearbyPackmate(state, attacker, target)) {
    bonus += 2 * getSkillScaleUnits(packInstinctRank);
  }

  return bonus;
}

export function getUnbrokenLineDamageReductionPercent(
  state: GameState,
  attacker: CombatEntity,
  target: CombatEntity,
  atTime = state.simulationTimeMs ?? Date.now(),
): number {
  if (!isLivingEnemy(attacker) || !isLivingCompanion(target)) {
    return 0;
  }

  return Object.values(state.statusEffectsById ?? {}).reduce((strongest, status) => {
    if (
      status.type !== "taunted" ||
      status.expiresAt <= atTime ||
      status.targetId !== attacker.id ||
      !status.sourceId ||
      status.sourceId === target.id
    ) {
      return strongest;
    }

    const taunter = state.entities[status.sourceId];
    if (!isLivingCompanion(taunter)) {
      return strongest;
    }

    const rank = getLearnedPassiveRank(taunter, "unbroken_line");
    return rank
      ? Math.max(strongest, 3 * getSkillScaleUnits(rank))
      : strongest;
  }, 0);
}

export function getRootedBastionDefenseBonusPercent(
  state: GameState,
  companion: Companion,
): number {
  const rank = getLearnedPassiveRank(companion, "rooted_bastion");
  return rank && state.rootedBastionByCompanionId?.[companion.id]?.active
    ? 3 * getSkillScaleUnits(rank)
    : 0;
}

export function getHeadhunterCriticalChanceBonus(
  state: GameState,
  companion: Companion,
  now: number,
): number {
  const rank = getLearnedPassiveRank(companion, "headhunter");
  if (!rank) {
    return 0;
  }

  const count = getActiveHeadhunterKillTimestamps(state, companion.id, now).length;
  return Math.min(count, getHeadhunterStackCap(rank)) / 100;
}

export function prepareDuelistsMomentumForDirectAttack(
  state: GameState,
  attacker: CombatEntity,
  target: CombatEntity,
  damageType: CombatDamageType,
): GameState {
  if (!isLivingCompanion(attacker) || damageType !== "physical") {
    return state;
  }

  const momentum = state.duelistsMomentumByCompanionId?.[attacker.id];
  if (!momentum || momentum.targetId === target.id) {
    return state;
  }

  const duelistsMomentumByCompanionId = {
    ...(state.duelistsMomentumByCompanionId ?? {}),
  };
  delete duelistsMomentumByCompanionId[attacker.id];
  return { ...state, duelistsMomentumByCompanionId };
}

export function recordSuccessfulDirectPhysicalHit(
  state: GameState,
  attacker: CombatEntity,
  target: CombatEntity,
): GameState {
  if (!isLivingCompanion(attacker) || !isLivingEnemy(target)) {
    return state;
  }

  const nextState = consumeRiposteTrainingCharge(state, attacker.id);
  const rank = getLearnedPassiveRank(attacker, "duelists_momentum");
  if (!rank || target.health <= 0 || target.state === "dead") {
    return clearDuelistsMomentumForTarget(nextState, target.id);
  }

  const current = nextState.duelistsMomentumByCompanionId?.[attacker.id];
  return {
    ...nextState,
    duelistsMomentumByCompanionId: {
      ...(nextState.duelistsMomentumByCompanionId ?? {}),
      [attacker.id]: {
        companionId: attacker.id,
        targetId: target.id,
        stacks: Math.min(3, current?.targetId === target.id ? current.stacks + 1 : 1),
      },
    },
  };
}

export function grantRiposteTrainingCharge(
  state: GameState,
  companion: Companion,
  now: number,
): GameState {
  if (!getLearnedPassiveRank(companion, "riposte_training")) {
    return state;
  }

  return {
    ...state,
    riposteTrainingByCompanionId: {
      ...(state.riposteTrainingByCompanionId ?? {}),
      [companion.id]: {
        companionId: companion.id,
        expiresAt: now + RIPOSTE_DURATION_MS,
      },
    },
  };
}

export function recordHeadhunterPartyKill(
  state: GameState,
  now: number,
): GameState {
  let headhunterByCompanionId = state.headhunterByCompanionId ?? {};
  let changed = false;

  for (const entity of Object.values(state.entities)) {
    if (!isLivingCompanion(entity)) {
      continue;
    }
    const rank = getLearnedPassiveRank(entity, "headhunter");
    if (!rank) {
      continue;
    }
    const cap = getHeadhunterStackCap(rank);
    const current = getActiveHeadhunterKillTimestamps(state, entity.id, now);
    headhunterByCompanionId = {
      ...headhunterByCompanionId,
      [entity.id]: {
        companionId: entity.id,
        killTimestamps: [...current, now].slice(-cap),
      },
    };
    changed = true;
  }

  return changed ? { ...state, headhunterByCompanionId } : state;
}

export function updateMartialPassiveRuntime(
  state: GameState,
  now: number,
  movedEntityIds: ReadonlySet<string> = new Set(),
): GameState {
  const duelistsMomentumByCompanionId = Object.fromEntries(
    Object.entries(state.duelistsMomentumByCompanionId ?? {}).filter(
      ([companionId, momentum]) =>
        isLivingCompanion(state.entities[companionId]) &&
        isLivingEnemy(state.entities[momentum.targetId]),
    ),
  );
  const riposteTrainingByCompanionId = Object.fromEntries(
    Object.entries(state.riposteTrainingByCompanionId ?? {}).filter(
      ([companionId, charge]) =>
        charge.expiresAt > now && isLivingCompanion(state.entities[companionId]),
    ),
  );
  const headhunterByCompanionId = Object.fromEntries(
    Object.entries(state.headhunterByCompanionId ?? {}).flatMap(
      ([companionId, headhunter]) => {
        const companion = state.entities[companionId];
        if (!isLivingCompanion(companion)) {
          return [];
        }
        const killTimestamps = headhunter.killTimestamps.filter(
          (timestamp) => timestamp + HEADHUNTER_WINDOW_MS > now,
        );
        return killTimestamps.length > 0
          ? [[companionId, { ...headhunter, killTimestamps }]]
          : [];
      },
    ),
  );
  const rootedBastionByCompanionId = { ...(state.rootedBastionByCompanionId ?? {}) };

  for (const [companionId] of Object.entries(rootedBastionByCompanionId)) {
    if (!isLivingCompanion(state.entities[companionId])) {
      delete rootedBastionByCompanionId[companionId];
    }
  }

  for (const entity of Object.values(state.entities)) {
    if (!isLivingCompanion(entity) || !getLearnedPassiveRank(entity, "rooted_bastion")) {
      continue;
    }
    const current = rootedBastionByCompanionId[entity.id];
    const moved =
      movedEntityIds.has(entity.id) ||
      !current ||
      current.mapId !== state.currentMapId ||
      !positionsMatch(current.position, entity.position);
    rootedBastionByCompanionId[entity.id] = moved
      ? {
          companionId: entity.id,
          mapId: state.currentMapId,
          position: entity.position,
          stationarySince: now,
          active: false,
        }
      : {
          ...current,
          active: now - current.stationarySince >= ROOTED_BASTION_DELAY_MS,
        };
  }

  return {
    ...state,
    duelistsMomentumByCompanionId,
    riposteTrainingByCompanionId,
    rootedBastionByCompanionId,
    headhunterByCompanionId,
  };
}

export function getActiveHeadhunterKillTimestamps(
  state: GameState,
  companionId: string,
  now: number,
): number[] {
  return (state.headhunterByCompanionId?.[companionId]?.killTimestamps ?? []).filter(
    (timestamp) => timestamp + HEADHUNTER_WINDOW_MS > now,
  );
}

function isEnemyControlled(
  state: GameState,
  enemy: Enemy,
  atTime: number,
): boolean {
  if ((state.skillBindsByEnemyId?.[enemy.id]?.expiresAt ?? 0) > atTime) {
    return true;
  }
  return Object.values(state.statusEffectsById ?? {}).some(
    (status) =>
      status.targetId === enemy.id &&
        status.expiresAt > atTime &&
        CONTROLLED_STATUS_TYPES.has(status.type),
  );
}

function hasNearbyPackmate(
  state: GameState,
  attacker: Companion,
  target: CombatEntity,
): boolean {
  return Object.values(state.entities).some(
    (entity) =>
      isLivingCompanion(entity) &&
      entity.id !== attacker.id &&
      getEuclideanDistance(entity.position, target.position) <= PACK_INSTINCT_RANGE,
  );
}

function consumeRiposteTrainingCharge(
  state: GameState,
  companionId: string,
): GameState {
  if (!state.riposteTrainingByCompanionId?.[companionId]) {
    return state;
  }
  const riposteTrainingByCompanionId = {
    ...state.riposteTrainingByCompanionId,
  };
  delete riposteTrainingByCompanionId[companionId];
  return { ...state, riposteTrainingByCompanionId };
}

function clearDuelistsMomentumForTarget(
  state: GameState,
  targetId: string,
): GameState {
  const entries = Object.entries(state.duelistsMomentumByCompanionId ?? {}).filter(
    ([, momentum]) => momentum.targetId !== targetId,
  );
  return {
    ...state,
    duelistsMomentumByCompanionId: Object.fromEntries(entries),
  };
}

function positionsMatch(first: Position, second: Position): boolean {
  return Math.abs(first.x - second.x) < 0.001 && Math.abs(first.y - second.y) < 0.001;
}
