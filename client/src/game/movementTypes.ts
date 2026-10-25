import type {
  DebugNavigationBlocker,
  DebugNavigationBlockerDetail,
  DebugNavigationPathFailureReason,
  DebugNavigationReason,
  GameEntity,
  Position,
  TravelFormationGoal,
  CombatFormationGoal,
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
  source?: NormalMovementSource;
  sourceReason?: string;
  acceptableRadius?: number;
  /** Producer-specific guard, evaluated before any position/bookkeeping commit. */
  isPositionAllowed?: (position: Position) => boolean;
  /** Producer's stop region; scoped party transit must end with standing clearance here. */
  isSettlingPosition?: (position: Position) => boolean;
  rejectedPositionOutcome?: "held" | "blocked";
  combatSlot?: { targetId: string; attackReach: number; position: Position };
  travelFormationGoal?: TravelFormationGoal;
  combatFormationGoal?: CombatFormationGoal;
  isFormationStaging?: boolean;
};

export type NormalMovementSource =
  | "compatibility" | "direct" | "teleport" | "resurrection"
  | "partyTravel" | "follow" | "defend" | "attack" | "gather" | "explore"
  | "enemyHome" | "enemyRoam" | "enemyQuest" | "enemyFlee" | "questGuide";

export type NormalMovementRequest = {
  entityId: string;
  source: NormalMovementSource;
  reason: string;
  priority: number;
  mode: "walk" | "step" | "hold";
  destination: Position;
  acceptableRadius: number;
  pathProfile?: MovementPathProfile;
  pathTargetKey?: string;
  pathTargetPosition?: Position;
  allowPartyPassThrough?: boolean;
  speedMultiplier?: number;
  combatSlot?: MovementOptions["combatSlot"];
  travelFormationGoal?: TravelFormationGoal;
  combatFormationGoal?: CombatFormationGoal;
  isFormationStaging?: boolean;
};

export type NormalMovementOutcome = "moved" | "held" | "blocked" | "invalid" | "deferred";

/** Simulation-only hysteresis, not saved formation or command state. */
export type LocalAvoidanceMemory = {
  requestKey: string;
  destination: Position;
  direction: Position;
  side: number;
  lastActiveAtMs: number;
};

export type OverlapRecoveryObservation = {
  position: Position;
  bodyKey: string;
  pending: boolean;
};

/** Transient producer context; never persisted or copied into a movement result. */
export type NormalMovementSubmission = {
  request: NormalMovementRequest;
  options: MovementOptions;
  target: GameEntity;
};

export type NormalMovementResult = {
  blockingEnemyIds?: string[];
  request: NormalMovementRequest;
  outcome: NormalMovementOutcome;
  reason: string;
  from: Position;
  to: Position;
  positionCommitCount: number;
  frameNumber: number;
  timeMs: number;
};

export type ExternalMovementOwner = { source: string; transactionId?: string; positionCommitted: boolean; released?: true };

/** Actual position publication, distinct from a normal hold or an active owner. */
export type MovementPositionCommit = {
  source: string;
  transactionId: string;
  from: Position;
  to: Position;
  frameNumber: number;
  timeMs: number;
};

export type MovementAuthorityResult = {
  state: import("./state").GameState;
  outcome: "acquired" | "released" | "moved" | "held" | "deferred" | "invalid";
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

/** Selected formation searches keep their budget even when steering succeeds. */
export type FormationPathSearch = {
  requestKey?: string;
  lastQueryAtMs: number;
  failed: boolean;
  temporaryBlockers?: boolean;
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
