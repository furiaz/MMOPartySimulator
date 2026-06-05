import type { GameState } from "./state";
import type { Companion, GameEntity, PartyMemberRole, RoleBonusState } from "./types";

export const ROLE_BONUS_ASSIGNMENT_DELAY_MS = 5000;

export type RoleBonusDisplayState =
  | {
      status: "none";
      label: "No Role Bonus";
      remainingMs: 0;
      activeRole: null;
      pendingRole: null;
    }
  | {
      status: "pending";
      label: string;
      remainingMs: number;
      activeRole: null;
      pendingRole: Exclude<PartyMemberRole, "none">;
    }
  | {
      status: "assigned";
      label: "Role Bonus Assigned";
      remainingMs: 0;
      activeRole: Exclude<PartyMemberRole, "none">;
      pendingRole: null;
    };

type BonusRole = Exclude<PartyMemberRole, "none">;

export function createAssignedRoleBonusState(
  role: PartyMemberRole,
): RoleBonusState {
  if (role === "none") {
    return createEmptyRoleBonusState();
  }

  return {
    activeRole: role,
    pendingRole: null,
    changedAt: null,
    activatesAt: null,
  };
}

export function createPendingRoleBonusState(
  role: PartyMemberRole,
  nowMs: number,
): RoleBonusState {
  if (role === "none") {
    return createEmptyRoleBonusState();
  }

  return {
    activeRole: null,
    pendingRole: role,
    changedAt: nowMs,
    activatesAt: nowMs + ROLE_BONUS_ASSIGNMENT_DELAY_MS,
  };
}

export function createEmptyRoleBonusState(): RoleBonusState {
  return {
    activeRole: null,
    pendingRole: null,
    changedAt: null,
    activatesAt: null,
  };
}

export function getActiveRoleBonusRole(
  companion: Companion,
): BonusRole | null {
  return isBonusRole(companion.roleBonus.activeRole)
    ? companion.roleBonus.activeRole
    : null;
}

export function getRoleBonusDisplayState(
  companion: Companion,
  nowMs: number,
): RoleBonusDisplayState {
  if (companion.role === "none") {
    return createNoRoleBonusDisplayState();
  }

  const completedRole = getCompletedRoleBonusRole(companion.roleBonus, nowMs);

  if (completedRole === companion.role) {
    return {
      status: "assigned",
      label: "Role Bonus Assigned",
      remainingMs: 0,
      activeRole: completedRole,
      pendingRole: null,
    };
  }

  if (companion.roleBonus.pendingRole === companion.role && companion.roleBonus.activatesAt) {
    const remainingMs = Math.max(0, companion.roleBonus.activatesAt - nowMs);

    if (remainingMs > 0) {
      const remainingSeconds = Math.ceil(remainingMs / 1000);

      return {
        status: "pending",
        label: `Role bonus assigning: ${remainingSeconds}s`,
        remainingMs,
        activeRole: null,
        pendingRole: companion.roleBonus.pendingRole,
      };
    }

    return {
      status: "assigned",
      label: "Role Bonus Assigned",
      remainingMs: 0,
      activeRole: companion.roleBonus.pendingRole,
      pendingRole: null,
    };
  }

  return createNoRoleBonusDisplayState();
}

export function updateRoleBonusAssignments(
  state: GameState,
  nowMs: number,
): GameState {
  let entities: Record<string, GameEntity> | null = null;

  for (const entity of Object.values(state.entities)) {
    if (entity.kind !== "companion") {
      continue;
    }

    const nextRoleBonus = completeRoleBonusState(entity.roleBonus, nowMs);

    if (nextRoleBonus === entity.roleBonus) {
      continue;
    }

    entities = entities ?? { ...state.entities };
    entities[entity.id] = {
      ...entity,
      roleBonus: nextRoleBonus,
    };
  }

  return entities ? { ...state, entities } : state;
}

export function assignCurrentRoleBonuses(state: GameState): GameState {
  let entities: Record<string, GameEntity> | null = null;

  for (const entity of Object.values(state.entities)) {
    if (entity.kind !== "companion") {
      continue;
    }

    const nextRoleBonus = createAssignedRoleBonusState(entity.role);

    if (isSameRoleBonusState(entity.roleBonus, nextRoleBonus)) {
      continue;
    }

    entities = entities ?? { ...state.entities };
    entities[entity.id] = {
      ...entity,
      roleBonus: nextRoleBonus,
    };
  }

  return entities ? { ...state, entities } : state;
}

function completeRoleBonusState(
  roleBonus: RoleBonusState,
  nowMs: number,
): RoleBonusState {
  const completedRole = getCompletedRoleBonusRole(roleBonus, nowMs);

  if (!completedRole || roleBonus.activeRole === completedRole) {
    return roleBonus;
  }

  return createAssignedRoleBonusState(completedRole);
}

function getCompletedRoleBonusRole(
  roleBonus: RoleBonusState,
  nowMs: number,
): BonusRole | null {
  if (!roleBonus.pendingRole || !roleBonus.activatesAt) {
    return isBonusRole(roleBonus.activeRole) ? roleBonus.activeRole : null;
  }

  return roleBonus.activatesAt <= nowMs && isBonusRole(roleBonus.pendingRole)
    ? roleBonus.pendingRole
    : null;
}

function createNoRoleBonusDisplayState(): RoleBonusDisplayState {
  return {
    status: "none",
    label: "No Role Bonus",
    remainingMs: 0,
    activeRole: null,
    pendingRole: null,
  };
}

function isSameRoleBonusState(
  first: RoleBonusState,
  second: RoleBonusState,
): boolean {
  return (
    first.activeRole === second.activeRole &&
    first.pendingRole === second.pendingRole &&
    first.changedAt === second.changedAt &&
    first.activatesAt === second.activatesAt
  );
}

function isBonusRole(role: PartyMemberRole | null): role is BonusRole {
  return role !== null && role !== "none";
}
