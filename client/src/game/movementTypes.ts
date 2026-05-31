import type {
  DebugNavigationBlocker,
  DebugNavigationBlockerDetail,
  DebugNavigationPathFailureReason,
  DebugNavigationReason,
  GameEntity,
  Position,
} from "./types";

export type FindAvailablePositionOptions = {
  blockedPositions?: Position[];
  ignoredEntityId?: string;
};

export type WalkablePositionOptions = {
  allowPartyPassThrough?: boolean;
};

export type MovementPathProfile =
  | "roam"
  | "home"
  | "gather"
  | "poi"
  | "teleport"
  | "resurrection"
  | "directCommand"
  | "explore"
  | "chase"
  | "combatSlot"
  | "follow"
  | "other";

export type EntityCollisionShape =
  | {
      kind: "circle";
      radius: number;
    }
  | {
      kind: "verticalCapsule";
      radius: number;
      height: number;
      anchorY: number;
    };

export type MovementOptions = WalkablePositionOptions & {
  pathProfile?: MovementPathProfile;
  pathTargetKey?: string;
  pathTargetPosition?: Position;
  speedMultiplier?: number;
};

export type NavigationBlockerLookup = {
  resourceKeys: Set<string>;
  reservedKeys: Set<string>;
  blockingEntityKeys: Set<string>;
};

export type MovementPath = {
  blockedCount?: number;
  lastRequestedAtMs?: number;
  profile?: MovementPathProfile;
  targetPosition?: Position;
  targetKey: string;
  waypoints: Position[];
};

export type MoveResolution = {
  movementPath?: MovementPath;
  position: Position;
  swapWithEntityId?: string;
  reason: DebugNavigationReason;
};

export type MovementFailureDetail = {
  targetId?: string | null;
  targetDistance?: number;
  intendedPosition?: Position | null;
  blockerId?: string;
  blockerKind?: GameEntity["kind"] | "wall" | "bounds" | "reserved" | "unknown";
  pathFailureReason?: DebugNavigationPathFailureReason;
  requestedTargetCell?: Position | null;
  resolvedGoalCells?: Position[];
  targetCellWalkable?: boolean;
  targetCellBlockedBy?: DebugNavigationBlockerDetail;
  startCellWalkable?: boolean;
  freshPathAttempted?: boolean;
  nearbyReachableCellCount?: number;
  nearbyBlockedCellSummary?: Partial<Record<DebugNavigationBlocker, number>>;
};
