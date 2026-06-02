import type {
  Companion,
  Enemy,
  NpcEntity,
  Position,
} from "./game";
import type { SpriteDirection } from "./visualAssets";

export type ViewportSize = {
  width: number;
  height: number;
};

export type EntityVisualMovement = {
  direction: SpriteDirection;
  angleDegrees: number;
  expiresAt: number;
};

type FeedbackVisibilityEvent = {
  createdAt?: number;
  entityId: string;
  id?: string;
  sourceEntityId?: string;
  targetEntityId?: string;
  text?: string;
  type?: string;
  expiresAt: number;
};

type GetTrackedVisualMovementPositionsOptions = {
  cameraOffset: Position;
  cellPixelSize: number;
  combatFeedbackEvents: FeedbackVisibilityEvent[];
  currentTime: number;
  enemies: Enemy[];
  marginTiles: number;
  partyMembers: Companion[];
  questGuideNpcs: NpcEntity[];
  viewportSize: ViewportSize;
  visualMovementByEntityId: Record<string, EntityVisualMovement>;
};

export function getTrackedVisualMovementPositions({
  cameraOffset,
  cellPixelSize,
  combatFeedbackEvents,
  currentTime,
  enemies,
  marginTiles,
  partyMembers,
  questGuideNpcs,
  viewportSize,
  visualMovementByEntityId,
}: GetTrackedVisualMovementPositionsOptions): Record<string, Position> {
  const recentlyAffectedEntityIds = getRecentlyAffectedEntityIds(
    combatFeedbackEvents,
    currentTime,
  );
  const positionsById: Record<string, Position> = {};

  for (const member of partyMembers) {
    if (member.state !== "dead") {
      positionsById[member.id] = member.position;
    }
  }

  for (const npc of questGuideNpcs) {
    if (npc.state !== "dead") {
      positionsById[npc.id] = npc.position;
    }
  }

  for (const enemy of enemies) {
    if (
      shouldTrackEnemyVisualMovement({
        cameraOffset,
        cellPixelSize,
        currentTime,
        enemy,
        marginTiles,
        recentlyAffectedEntityIds,
        viewportSize,
        visualMovementByEntityId,
      })
    ) {
      positionsById[enemy.id] = enemy.position;
    }
  }

  return positionsById;
}

export function pruneVisualMovementEntries(
  visualMovementByEntityId: Record<string, EntityVisualMovement>,
  trackedEntityIds: Set<string>,
  currentTime: number,
): Record<string, EntityVisualMovement> {
  let nextVisualMovement: Record<string, EntityVisualMovement> | undefined;

  for (const [entityId, visualMovement] of Object.entries(visualMovementByEntityId)) {
    if (trackedEntityIds.has(entityId) && visualMovement.expiresAt > currentTime) {
      if (nextVisualMovement) {
        nextVisualMovement[entityId] = visualMovement;
      }
      continue;
    }

    nextVisualMovement = nextVisualMovement ??
      copyCurrentVisualMovementEntries(
        visualMovementByEntityId,
        trackedEntityIds,
        currentTime,
      );
    delete nextVisualMovement[entityId];
  }

  return nextVisualMovement ?? visualMovementByEntityId;
}

function shouldTrackEnemyVisualMovement({
  cameraOffset,
  cellPixelSize,
  currentTime,
  enemy,
  marginTiles,
  recentlyAffectedEntityIds,
  viewportSize,
  visualMovementByEntityId,
}: {
  cameraOffset: Position;
  cellPixelSize: number;
  currentTime: number;
  enemy: Enemy;
  marginTiles: number;
  recentlyAffectedEntityIds: Set<string>;
  viewportSize: ViewportSize;
  visualMovementByEntityId: Record<string, EntityVisualMovement>;
}): boolean {
  if (enemy.state === "dead") {
    return false;
  }

  if (
    enemy.state === "attack" ||
    enemy.currentTargetId ||
    enemy.attackWindupStartedAt !== undefined ||
    enemy.attackWindupTargetId ||
    recentlyAffectedEntityIds.has(enemy.id) ||
    (visualMovementByEntityId[enemy.id]?.expiresAt ?? 0) > currentTime
  ) {
    return true;
  }

  return isPositionInViewportMargin(
    enemy.position,
    cameraOffset,
    viewportSize,
    cellPixelSize,
    marginTiles,
  );
}

function getRecentlyAffectedEntityIds(
  combatFeedbackEvents: FeedbackVisibilityEvent[],
  currentTime: number,
): Set<string> {
  const entityIds = new Set<string>();

  for (const event of combatFeedbackEvents) {
    if (event.expiresAt <= currentTime) {
      continue;
    }

    entityIds.add(event.entityId);
    if (event.sourceEntityId) {
      entityIds.add(event.sourceEntityId);
    }
    if (event.targetEntityId) {
      entityIds.add(event.targetEntityId);
    }
  }

  return entityIds;
}

function isPositionInViewportMargin(
  position: Position,
  cameraOffset: Position,
  viewportSize: ViewportSize,
  cellPixelSize: number,
  marginTiles: number,
): boolean {
  const left = cameraOffset.x / cellPixelSize - marginTiles;
  const right = (cameraOffset.x + viewportSize.width) / cellPixelSize + marginTiles;
  const top = cameraOffset.y / cellPixelSize - marginTiles;
  const bottom = (cameraOffset.y + viewportSize.height) / cellPixelSize + marginTiles;

  return (
    position.x >= left &&
    position.x <= right &&
    position.y >= top &&
    position.y <= bottom
  );
}

function copyCurrentVisualMovementEntries(
  visualMovementByEntityId: Record<string, EntityVisualMovement>,
  trackedEntityIds: Set<string>,
  currentTime: number,
): Record<string, EntityVisualMovement> {
  const nextVisualMovement: Record<string, EntityVisualMovement> = {};

  for (const [entityId, visualMovement] of Object.entries(visualMovementByEntityId)) {
    if (trackedEntityIds.has(entityId) && visualMovement.expiresAt > currentTime) {
      nextVisualMovement[entityId] = visualMovement;
    }
  }

  return nextVisualMovement;
}
