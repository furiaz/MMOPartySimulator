import { clearEnemyAbilityRuntimeForEnemy } from "./enemyAbilitySystem";
import { ENEMY_TYPES } from "./enemyArchetypes";
import { clearForcedMovements, isForcedMovementPositionAvailable } from "./forcedMovement";
import { isEnemyMovementPositionAllowed } from "./enemyMovementBounds";
import { updateEntity, type GameState } from "./state";
import { clearStatusEffectsForEntity } from "./statusEffects";
import { WARMASTER_ARENA, WARMASTER_MAX_POWER, WARMASTER_RETREAT_MS, isInsideWarmasterArena, isWarmaster, type WarmasterAttempt } from "./warmasterState";
import { ORC_WARCAMP_ENCOUNTER_ID } from "./orcWarcampLayout";
import type { Enemy } from "./types";
import { isWarmasterAvailable } from "./warmasterLifecycleState";
function configureBoss(boss: Enemy): Enemy {
  return {
    ...boss,
    maxHealth: ENEMY_TYPES.orc_warmaster.maxHealth ?? boss.maxHealth,
    combatSizeMultiplier: 1,
    movementBounds: WARMASTER_ARENA,
    minimumMovementBodyRadius: (boss.combatBodyRadius ?? 1.25) * 1.5
  };
}
export function getActiveWarmasterEncounterIds(state: GameState): ReadonlySet<string> {
  const boss = state.warmasterAttempt && state.entities[state.warmasterAttempt.bossId];
  return new Set(state.currentMapId === "map-7" && isWarmaster(boss) && boss.health > 0 && boss.state !== "dead" ? [ORC_WARCAMP_ENCOUNTER_ID] : []);
}
export function resetWarmasterAttempt(state: GameState, now: number): GameState {
  if (state.currentMapId !== "map-7")
    return { ...state, warmasterAttempt: undefined };
  const boss = Object.values(state.entities).find(isWarmaster);
  let next = state.warmasterAttempt ? clearForcedMovements(state, state.warmasterAttempt.bossId) : state;
  next = { ...next, warmasterAttempt: undefined };
  if (!boss)
    return next;
  next = clearEnemyAbilityRuntimeForEnemy(next, boss.id);
  next = clearStatusEffectsForEntity(next, boss.id);
  const skillBindsByEnemyId = { ...next.skillBindsByEnemyId };
  const skillMarksByEnemyId = { ...next.skillMarksByEnemyId };
  delete skillBindsByEnemyId[boss.id];
  delete skillMarksByEnemyId[boss.id];
  next = {
    ...next,
    skillBindsByEnemyId,
    skillMarksByEnemyId
  };
  const base = configureBoss(boss);
  if (boss.health <= 0 || boss.state === "dead")
    return updateEntity(next, base, now);
  let position = { ...boss.homePosition };
  // Only run this bounded placement search at reset, never per animation frame.
  const candidates = [position];
  for (let radius = 1;radius <= 8;radius++) {
    for (let x = -radius;x <= radius;x++)
      for (let y = -radius;y <= radius;y++) {
        if (Math.abs(x) === radius || Math.abs(y) === radius)
          candidates.push({ x: boss.homePosition.x + x, y: boss.homePosition.y + y });
      }
  }
  position = candidates.find(candidate => isEnemyMovementPositionAllowed(next, base, candidate) && isForcedMovementPositionAvailable(next, base, candidate, true)) ?? position;
  return updateEntity({
    ...next,
    attackSlotCacheByEntityId: {},
    movementPathsByEntityId: {}
  }, {
    ...base,
    position,
    health: base.maxHealth,
    state: "idle",
    currentTargetId: null,
    roamTargetPosition: null,
    nextRoamAt: now + 1000,
    lastAttackAt: now,
    attackWindupStartedAt: undefined,
    attackWindupDurationMs: undefined,
    attackWindupTargetId: undefined
  }, now);
}
export function updateWarmasterSystem(state: GameState, now: number): GameState {
  if (!isWarmasterAvailable(state)) return state.warmasterAttempt ? { ...state, warmasterAttempt: undefined } : state;
  if (state.currentMapId !== "map-7")
    return state.warmasterAttempt ? { ...state, warmasterAttempt: undefined } : state;
  const boss = Object.values(state.entities).find(isWarmaster);
  if (!boss || boss.health <= 0 || boss.state === "dead") {
    const next = state.warmasterAttempt ? { ...state, warmasterAttempt: undefined } : state;
    return boss && state.warmasterAttempt ? clearEnemyAbilityRuntimeForEnemy(next, boss.id) : next;
  }
  let next = state;
  if (!boss.movementBounds || boss.combatSizeMultiplier === undefined)
    next = updateEntity(next, configureBoss(boss), now);
  const livingParty = Object.values(next.entities).filter(entity => entity.kind === "companion" && entity.health > 0 && entity.state !== "dead");
  if (!livingParty.length)
    return next.warmasterAttempt ? resetWarmasterAttempt(next, now) : next;
  const occupied = livingParty.some(member => isInsideWarmasterArena(member.position));
  let attempt = next.warmasterAttempt;
  if (attempt?.bossId !== boss.id)
    attempt = undefined;
  if (!attempt) {
    if (!occupied)
      return next;
    attempt = {
      id: `${boss.id}:${now}`,
      bossId: boss.id,
      power: 0,
      transfers: [],
      transferSequence: 0
    };
  }
  if (!occupied) {
    const emptySince = attempt.emptySince ?? now;
    if (now - emptySince >= WARMASTER_RETREAT_MS)
      return resetWarmasterAttempt({ ...next, warmasterAttempt: attempt }, now);
    attempt = { ...attempt, emptySince };
  }
  else if (attempt.emptySince !== undefined)
    attempt = { ...attempt, emptySince: undefined };
  attempt = advancePatronPower(attempt, now);
  const scale = 1 + 0.05 * attempt.power;
  const currentBoss = next.entities[boss.id] as Enemy;
  next = { ...next, warmasterAttempt: attempt };
  if (currentBoss.combatSizeMultiplier !== scale)
    next = updateEntity({
      ...next,
      attackSlotCacheByEntityId: {},
      movementPathsByEntityId: {}
    }, { ...currentBoss, combatSizeMultiplier: scale }, now);
  return next;
}
export function advancePatronPower(attempt: WarmasterAttempt, now: number): WarmasterAttempt {
  let next = { ...attempt, power: Math.max(0, Math.min(WARMASTER_MAX_POWER, attempt.power)) };
  const arrivals = attempt.transfers.filter(transfer => transfer.bossId === attempt.bossId && transfer.attemptId === attempt.id && transfer.arrivesAt <= now).sort((a, b) => a.arrivesAt - b.arrivesAt || a.id.localeCompare(b.id));
  for (let index = 0; index < arrivals.length; index++) {
    next.power = Math.min(WARMASTER_MAX_POWER, next.power + 1);
    if (!next.speechShown)
      next = {
        ...next,
        speechShown: true,
        speechStartedAt: now
      };
  }
  next.transfers = attempt.transfers.filter(transfer => transfer.bossId === attempt.bossId && transfer.attemptId === attempt.id && transfer.arrivesAt > now);
  return next;
}
