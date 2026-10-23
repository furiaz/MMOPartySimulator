import { handleEnemyDefeatedDrops } from "./dropSystem";
import { prepareCompanionSkillArea } from "./companionSkillAreas";
import { isEntityInsideCompanionAoe } from "./companionAoeVariants";
import { startForcedMovement } from "./forcedMovement";
import { isLivingHostileTarget } from "./combatStructures";
import type { HostileCombatTarget } from "./types";
import { isLivingCompanion, isLivingEnemy, isTargetDummyEnemy } from "./entityGuards";
import { grantCharacterXpToParty } from "./leveling";
import { recordEnemyDefeatedForQuests } from "./questSystem";
import { resolveAndApplyCombatDamage } from "./combatResolver";
import { applyStatusEffect } from "./statusEffects";
import { addCombatFeedback, updateEntity, type GameState } from "./state";
import type {
  Companion,
  CompanionAoeChannelState,
  SkillDefinition,
  Position,
} from "./types";

export const SHIELD_SHOCKWAVE_CHANNEL_MS = 200;

export function updateCompanionAoeChannelSystem(
  state: GameState,
  now = Date.now(),
): GameState {
  let nextState = state;

  for (const channel of Object.values(state.companionAoeChannelsByCasterId ?? {})) {
    nextState = updateActiveChannel(nextState, channel, now);
  }

  return nextState;
}
export function startShieldShockwaveChannel(
  state: GameState,
  caster: Companion,
  skill: SkillDefinition,
  now: number,
  facingTarget?: Position,
): GameState {
  if (
    skill.effect.type !== "shockwave" ||
    state.companionAoeChannelsByCasterId?.[caster.id]
  ) {
    return state;
  }

  const prepared = prepareCompanionSkillArea(state, caster, skill, facingTarget);
  if (!prepared || !Object.values(state.entities).some(entity => isLivingHostileTarget(entity) && isEntityInsideCompanionAoe(prepared.area, entity))) return state;

  const nextState = addCombatFeedback(state, {
    type: "attack",
    entityId: caster.id,
    text: skill.displayName,
    now,
  });

  return {
    ...nextState,
    companionAoeChannelsByCasterId: {
      ...(nextState.companionAoeChannelsByCasterId ?? {}),
      [caster.id]: {
        id: `shield_shockwave:${caster.id}:${now}`,
        abilityId: "shield_shockwave",
        casterId: caster.id,
        area: prepared.area,
        visualIntent: "partyOffensive",
        damageType: skill.effect.damageType,
        powerMultiplier: skill.effect.powerMultiplier * prepared.powerMultiplier,
        bindDurationMs: prepared.variantId === "cone" ? undefined : skill.effect.bindDurationMs,
        tauntDurationMs: prepared.variantId === "cone" ? 3000 : skill.effect.tauntDurationMs,
        knockbackDistance: prepared.variantId === "cone" ? 2 : undefined,
        stunDurationMs: prepared.variantId === "cone" ? 1000 : undefined,
        startedAt: now,
        channelEndsAt: now + SHIELD_SHOCKWAVE_CHANNEL_MS,
      },
    },
  };
}

export function startMaulSweepChannel(
  state: GameState,
  caster: Companion,
  skill: SkillDefinition,
  now: number,
  facingTarget?: Position,
): GameState {
  if (
    skill.effect.type !== "maulSweep" ||
    state.companionAoeChannelsByCasterId?.[caster.id]
  ) {
    return state;
  }

  const prepared = prepareCompanionSkillArea(state, caster, skill, facingTarget);
  if (!prepared || !Object.values(state.entities).some(entity => isLivingHostileTarget(entity) && isEntityInsideCompanionAoe(prepared.area, entity))) return state;

  const nextState = addCombatFeedback(state, {
    type: "attack",
    entityId: caster.id,
    text: skill.displayName,
    now,
  });

  return {
    ...nextState,
    companionAoeChannelsByCasterId: {
      ...(nextState.companionAoeChannelsByCasterId ?? {}),
      [caster.id]: {
        id: `maul_sweep:${caster.id}:${now}`,
        abilityId: "maul_sweep",
        casterId: caster.id,
        area: prepared.area,
        visualIntent: "partyOffensive",
        damageType: skill.effect.damageType,
        powerMultiplier: skill.effect.powerMultiplier * prepared.powerMultiplier,
        disarmDurationMs: skill.effect.disarmDurationMs,
        startedAt: now,
        channelEndsAt: now + SHIELD_SHOCKWAVE_CHANNEL_MS,
      },
    },
  };
}

function updateActiveChannel(
  state: GameState,
  channel: CompanionAoeChannelState,
  now: number,
): GameState {
  const caster = state.entities[channel.casterId];

  if (!isLivingCompanion(caster)) {
    return finishChannel(state, channel);
  }

  if (now < channel.channelEndsAt) {
    return state;
  }

  if (channel.abilityId === "shield_shockwave") {
    return resolveShieldShockwaveImpact(state, channel, caster, now);
  }

  if (channel.abilityId === "maul_sweep") {
    return resolveMaulSweepImpact(state, channel, caster, now);
  }

  return finishChannel(state, channel);
}

function resolveMaulSweepImpact(
  state: GameState,
  channel: CompanionAoeChannelState,
  caster: Companion,
  now: number,
): GameState {
  let nextState = state;

  for (const enemy of Object.values(state.entities)) {
    const currentEnemy = nextState.entities[enemy.id];

    if (
      !isLivingHostileTarget(currentEnemy) ||
      !isEntityInsideCompanionAoe(channel.area, currentEnemy)
    ) {
      continue;
    }

    nextState = damageEnemy(
      nextState,
      caster,
      currentEnemy,
      "Maul Sweep",
      now,
      channel.damageType,
      channel.powerMultiplier,
    ).state;

    const damagedTarget = nextState.entities[currentEnemy.id];

    if (
      isLivingEnemy(damagedTarget) &&
      !isTargetDummyEnemy(damagedTarget) &&
      channel.disarmDurationMs
    ) {
      nextState = applyStatusEffect(
        nextState,
        {
          type: "disarmed",
          targetId: damagedTarget.id,
          durationMs: channel.disarmDurationMs,
          sourceId: caster.id,
          sourceKey: "maul_sweep",
        },
        now,
      );
    }
  }

  return finishChannel(nextState, channel);
}

function resolveShieldShockwaveImpact(
  state: GameState,
  channel: CompanionAoeChannelState,
  caster: Companion,
  now: number,
): GameState {
  let nextState = state;

  for (const enemy of Object.values(state.entities)) {
    const currentEnemy = nextState.entities[enemy.id];

    if (
      !isLivingHostileTarget(currentEnemy) ||
      !isEntityInsideCompanionAoe(channel.area, currentEnemy)
    ) {
      continue;
    }

    const result = damageEnemy(
      nextState,
      caster,
      currentEnemy,
      "Shield Shockwave",
      now,
      channel.damageType,
      channel.powerMultiplier,
    );
    nextState = result.state;

    const damagedTarget = nextState.entities[currentEnemy.id];

    if (channel.knockbackDistance && isLivingEnemy(damagedTarget) && !isTargetDummyEnemy(damagedTarget)) {
      if (result.evaded) continue;
      nextState = applyStatusEffect(nextState, { type: "incapacitated", targetId: damagedTarget.id,
        durationMs: channel.stunDurationMs ?? 1000, sourceId: caster.id, sourceKey: "shield_shockwave" }, now);
      const origin = channel.area.castTransform.origin;
      const direction = { x: damagedTarget.position.x - origin.x, y: damagedTarget.position.y - origin.y };
      nextState = startForcedMovement(nextState, damagedTarget.id, caster.id,
        Math.hypot(direction.x, direction.y) > 0 ? direction : channel.area.castTransform.direction,
        channel.knockbackDistance, channel.knockbackDistance * 1000 / 16, now,
        { type: "taunted", durationMs: channel.tauntDurationMs ?? 3000, sourceKey: "shield_shockwave" });
      continue;
    }

    if (
      isLivingEnemy(damagedTarget) &&
      !isTargetDummyEnemy(damagedTarget) &&
      channel.bindDurationMs
    ) {
      nextState = updateEntity(nextState, {
        ...damagedTarget,
        state: "attack",
        currentTargetId: caster.id,
      });
      nextState = applyStatusEffect(
        nextState,
        {
          type: "taunted",
          targetId: damagedTarget.id,
          durationMs: channel.tauntDurationMs ?? channel.bindDurationMs,
          sourceId: caster.id,
          sourceKey: "shield_shockwave",
        },
        now,
      );
      nextState = {
        ...nextState,
        skillBindsByEnemyId: {
          ...(nextState.skillBindsByEnemyId ?? {}),
          [damagedTarget.id]: {
            sourceId: caster.id,
            targetId: damagedTarget.id,
            expiresAt: now + channel.bindDurationMs,
          },
        },
      };
    }
  }

  return finishChannel(nextState, channel);
}

function damageEnemy(
  state: GameState,
  caster: Companion,
  target: HostileCombatTarget,
  label: string,
  now: number,
  damageType: "physical" | "magic",
  powerMultiplier: number,
): { state: GameState; evaded: boolean } {
  const combatResult = resolveAndApplyCombatDamage(state, caster, target, {
    damageType,
    powerMultiplier,
    allowEvasion: true,
    allowPassiveBlock: damageType === "physical",
    now,
    label,
  });
  let nextState = combatResult.state;
  const damagedTarget = combatResult.target;

  if (damagedTarget.kind === "enemy" && damagedTarget.state === "dead") {
    nextState = grantCharacterXpToParty(nextState, damagedTarget, caster.id, now);
    nextState = recordEnemyDefeatedForQuests(
      nextState,
      damagedTarget,
      nextState.currentMapId,
      Math.random,
      now,
    );
    if (!damagedTarget.questSpawn?.suppressNormalDrops) {
      nextState = handleEnemyDefeatedDrops(nextState, damagedTarget, caster.id, now);
    }
  }

  if (damagedTarget.kind === "enemy" && damagedTarget.state !== "dead") {
    nextState = updateEntity(nextState, {
      ...damagedTarget,
      state: "attack",
      currentTargetId: caster.id,
    });
  }

  return { state: nextState, evaded: combatResult.evaded };
}

function finishChannel(
  state: GameState,
  channel: CompanionAoeChannelState,
): GameState {
  const companionAoeChannelsByCasterId = {
    ...(state.companionAoeChannelsByCasterId ?? {}),
  };
  delete companionAoeChannelsByCasterId[channel.casterId];

  return {
    ...state,
    companionAoeChannelsByCasterId,
  };
}
