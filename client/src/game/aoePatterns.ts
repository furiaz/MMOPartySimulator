import type {
  AoeBounds,
  AoeCastTransform,
  AoePattern,
  Position,
  ResolvedAoeArea,
  ResolvedAoeCone,
  ResolvedAoePrimitive,
  ResolvedAoeRectangle,
  ResolvedAoeSquare,
} from "./types";

export const AOE_PATTERN_SQUARE_SIZE = 1.5;
export const DEFAULT_AOE_CIRCLE_DIAMETER = 1.125;
export const DEFAULT_AOE_CIRCLE_RADIUS = DEFAULT_AOE_CIRCLE_DIAMETER / 2;

const GEOMETRY_EPSILON = 1e-9;
const DEFAULT_DIRECTION: Position = { x: 1, y: 0 };

export function createAoeCastTransform(
  origin: Position,
  target: Position,
): AoeCastTransform {
  return {
    origin: { ...origin },
    direction: normalizeDirection({
      x: target.x - origin.x,
      y: target.y - origin.y,
    }),
  };
}

export function resolveAoePattern(
  pattern: AoePattern,
  castTransform: AoeCastTransform,
): ResolvedAoeArea {
  const lockedTransform = {
    origin: { ...castTransform.origin },
    direction: normalizeDirection(castTransform.direction),
  };
  const primitives = deduplicatePrimitives(
    resolvePatternPrimitives(pattern, lockedTransform),
  );

  return {
    castTransform: lockedTransform,
    primitives,
    bounds: getPrimitiveBounds(primitives, lockedTransform.origin),
  };
}

export function isPositionInsideAoe(
  area: ResolvedAoeArea,
  position: Position,
): boolean {
  return area.primitives.some((primitive) =>
    isPositionInsidePrimitive(primitive, position),
  );
}

export function doAoeBoundsIntersect(
  first: AoeBounds,
  second: AoeBounds,
): boolean {
  return !(
    first.maxX < second.minX ||
    first.minX > second.maxX ||
    first.maxY < second.minY ||
    first.minY > second.maxY
  );
}

/** Exact ground-rectangle intersection; unions are boolean to avoid duplicate hits. */
export function doesAoeIntersectFootprint(area: ResolvedAoeArea, bounds: AoeBounds): boolean {
  if (!doAoeBoundsIntersect(area.bounds, bounds)) return false;
  const corners = [
    { x: bounds.minX, y: bounds.minY }, { x: bounds.maxX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.maxY }, { x: bounds.minX, y: bounds.maxY },
  ];
  const inside = (point: Position) => point.x >= bounds.minX - GEOMETRY_EPSILON && point.x <= bounds.maxX + GEOMETRY_EPSILON &&
    point.y >= bounds.minY - GEOMETRY_EPSILON && point.y <= bounds.maxY + GEOMETRY_EPSILON;
  return area.primitives.some(primitive => {
    if (primitive.type === "circle" || primitive.type === "ring") {
      const center = primitive.center;
      const nearest = { x: clamp(center.x, bounds.minX, bounds.maxX), y: clamp(center.y, bounds.minY, bounds.maxY) };
      const minimum = getDistanceSquared(center, nearest);
      const maximum = Math.max(...corners.map(corner => getDistanceSquared(center, corner)));
      const outer = primitive.type === "circle" ? primitive.radius : primitive.outerRadius;
      const inner = primitive.type === "circle" ? 0 : primitive.innerRadius;
      return minimum <= outer * outer + GEOMETRY_EPSILON && maximum + GEOMETRY_EPSILON >= inner * inner;
    }
    if (corners.some(corner => isPositionInsidePrimitive(primitive, corner))) return true;
    if (primitive.type === "square" || primitive.type === "rectangle") {
      const polygon = primitive.type === "square" ? getSquareCorners(primitive) : getRectangleCorners(primitive);
      return polygon.some(inside) || polygon.some((point, index) =>
        corners.some((corner, cornerIndex) => segmentsIntersect(point, polygon[(index + 1) % 4], corner, corners[(cornerIndex + 1) % 4])));
    }
    if (inside(primitive.origin)) return true;
    const angle = Math.atan2(primitive.direction.y, primitive.direction.x);
    const ends = [-1, 1].map(sign => ({ x: primitive.origin.x + Math.cos(angle + sign * primitive.angleRadians / 2) * primitive.range,
      y: primitive.origin.y + Math.sin(angle + sign * primitive.angleRadians / 2) * primitive.range }));
    if (ends.some(inside)) return true;
    return corners.some((start, index) => {
      const end = corners[(index + 1) % 4];
      if (ends.some(point => segmentsIntersect(primitive.origin, point, start, end))) return true;
      const dx = end.x - start.x, dy = end.y - start.y;
      const ox = start.x - primitive.origin.x, oy = start.y - primitive.origin.y;
      const a = dx * dx + dy * dy, b = 2 * (dx * ox + dy * oy);
      const discriminant = b * b - 4 * a * (ox * ox + oy * oy - primitive.range * primitive.range);
      if (a <= GEOMETRY_EPSILON || discriminant < -GEOMETRY_EPSILON) return false;
      return [-1, 1].some(sign => {
        const t = (-b + sign * Math.sqrt(Math.max(0, discriminant))) / (2 * a);
        return t >= -GEOMETRY_EPSILON && t <= 1 + GEOMETRY_EPSILON &&
          isPositionInsidePrimitive(primitive, { x: start.x + t * dx, y: start.y + t * dy });
      });
    });
  });
}

function segmentsIntersect(a: Position, b: Position, c: Position, d: Position): boolean {
  const cross = (p: Position, q: Position, r: Position) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const abC = cross(a, b, c), abD = cross(a, b, d), cdA = cross(c, d, a), cdB = cross(c, d, b);
  return abC * abD <= GEOMETRY_EPSILON && cdA * cdB <= GEOMETRY_EPSILON &&
    Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x)) <= Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x)) + GEOMETRY_EPSILON &&
    Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y)) <= Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y)) + GEOMETRY_EPSILON;
}

export function getAoeAreaSignature(area: ResolvedAoeArea): string {
  return [
    pointSignature(area.castTransform.origin),
    pointSignature(area.castTransform.direction),
    ...area.primitives.map(getPrimitiveSignature),
    boundsSignature(area.bounds),
  ].join("|");
}

export function clipSquareAoeAreaToForwardDistance(
  area: ResolvedAoeArea,
  maximumDistance: number,
): ResolvedAoeArea {
  const distance = Math.max(0, maximumDistance);
  const origin = area.castTransform.origin;
  const forward = normalizeDirection(area.castTransform.direction);
  const right = { x: -forward.y, y: forward.x };
  const rotationRadians = Math.atan2(forward.y, forward.x);
  const primitives = area.primitives.flatMap<ResolvedAoePrimitive>((primitive) => {
    if (primitive.type !== "square") {
      return [];
    }

    const delta = {
      x: primitive.center.x - origin.x,
      y: primitive.center.y - origin.y,
    };
    const centerForward = delta.x * forward.x + delta.y * forward.y;
    const centerLateral = delta.x * right.x + delta.y * right.y;
    const start = centerForward - primitive.size / 2;
    const end = centerForward + primitive.size / 2;

    if (start >= distance - GEOMETRY_EPSILON) {
      return [];
    }

    if (end <= distance + GEOMETRY_EPSILON) {
      return [primitive];
    }

    const width = Math.max(0, distance - start);

    if (width <= GEOMETRY_EPSILON) {
      return [];
    }

    const centerDistance = start + width / 2;
    return [{
      type: "rectangle",
      center: {
        x: origin.x + forward.x * centerDistance + right.x * centerLateral,
        y: origin.y + forward.y * centerDistance + right.y * centerLateral,
      },
      width,
      height: primitive.size,
      rotationRadians,
    } satisfies ResolvedAoeRectangle];
  });

  return {
    castTransform: {
      origin: { ...area.castTransform.origin },
      direction: { ...area.castTransform.direction },
    },
    primitives,
    bounds: getPrimitiveBounds(primitives, origin),
  };
}

function resolvePatternPrimitives(
  pattern: AoePattern,
  castTransform: AoeCastTransform,
): ResolvedAoePrimitive[] {
  if (pattern.type === "union") {
    return pattern.patterns.flatMap((childPattern) =>
      resolvePatternPrimitives(childPattern, castTransform),
    );
  }

  const frame = createPatternFrame(castTransform, pattern.rotationRadians ?? 0);
  const origin = getWorldPosition(frame, pattern.offset ?? { x: 0, y: 0 });

  switch (pattern.type) {
    case "circle":
      return [{ type: "circle", center: origin, radius: Math.max(0, pattern.radius) }];
    case "ring":
      return [createRing(origin, pattern.innerRadius, pattern.outerRadius)];
    case "concentricRings":
      return pattern.rings.map((ring) =>
        createRing(origin, ring.innerRadius, ring.outerRadius),
      );
    case "line":
      return createLineSquares(frame, pattern.offset, pattern.squareCount);
    case "rectangle":
      return createRectangleSquares(
        frame,
        pattern.offset,
        pattern.columns,
        pattern.rows,
      );
    case "cross":
      return createCrossSquares(frame, pattern.offset, pattern.armLength);
    case "x":
      return createXSquares(frame, pattern.offset, pattern.armLength);
    case "cone":
      return [
        {
          type: "cone",
          origin,
          direction: { ...frame.forward },
          range: Math.max(0, pattern.range),
          angleRadians: clamp(pattern.angleRadians, 0, Math.PI * 2),
        },
      ];
  }
}

function createPatternFrame(
  castTransform: AoeCastTransform,
  rotationRadians: number,
): PatternFrame {
  const forward = rotate(normalizeDirection(castTransform.direction), rotationRadians);

  return {
    origin: castTransform.origin,
    forward,
    right: { x: -forward.y, y: forward.x },
    rotationRadians: Math.atan2(forward.y, forward.x),
  };
}

function createLineSquares(
  frame: PatternFrame,
  offset: Position | undefined,
  squareCount: number,
): ResolvedAoeSquare[] {
  const count = toWholeCount(squareCount);

  return Array.from({ length: count }, (_, index) =>
    createSquare(frame, {
      x:
        (offset?.x ?? 0) +
        index * AOE_PATTERN_SQUARE_SIZE +
        AOE_PATTERN_SQUARE_SIZE / 2,
      y: offset?.y ?? 0,
    }),
  );
}

function createRectangleSquares(
  frame: PatternFrame,
  offset: Position | undefined,
  columns: number,
  rows: number,
): ResolvedAoeSquare[] {
  const columnCount = toWholeCount(columns);
  const rowCount = toWholeCount(rows);
  const squares: ResolvedAoeSquare[] = [];

  for (let row = 0; row < rowCount; row += 1) {
    for (let column = 0; column < columnCount; column += 1) {
      squares.push(
        createSquare(frame, {
          x:
            (offset?.x ?? 0) +
            row * AOE_PATTERN_SQUARE_SIZE +
            AOE_PATTERN_SQUARE_SIZE / 2,
          y:
            (offset?.y ?? 0) +
            (column - (columnCount - 1) / 2) * AOE_PATTERN_SQUARE_SIZE,
        }),
      );
    }
  }

  return squares;
}

function createCrossSquares(
  frame: PatternFrame,
  offset: Position | undefined,
  armLength: number,
): ResolvedAoeSquare[] {
  const length = toWholeCount(armLength);
  const center = offset ?? { x: 0, y: 0 };
  const squares = [createSquare(frame, center)];

  for (let step = 1; step <= length; step += 1) {
    const distance = step * AOE_PATTERN_SQUARE_SIZE;
    squares.push(createSquare(frame, { x: center.x + distance, y: center.y }));
    squares.push(createSquare(frame, { x: center.x - distance, y: center.y }));
    squares.push(createSquare(frame, { x: center.x, y: center.y + distance }));
    squares.push(createSquare(frame, { x: center.x, y: center.y - distance }));
  }

  return squares;
}

function createXSquares(
  frame: PatternFrame,
  offset: Position | undefined,
  armLength: number,
): ResolvedAoeSquare[] {
  const length = toWholeCount(armLength);
  const center = offset ?? { x: 0, y: 0 };
  const squares = [createSquare(frame, center)];

  for (let step = 1; step <= length; step += 1) {
    const distance = step * AOE_PATTERN_SQUARE_SIZE;
    squares.push(createSquare(frame, {
      x: center.x + distance,
      y: center.y + distance,
    }));
    squares.push(createSquare(frame, {
      x: center.x + distance,
      y: center.y - distance,
    }));
    squares.push(createSquare(frame, {
      x: center.x - distance,
      y: center.y + distance,
    }));
    squares.push(createSquare(frame, {
      x: center.x - distance,
      y: center.y - distance,
    }));
  }

  return squares;
}

function createSquare(frame: PatternFrame, localPosition: Position): ResolvedAoeSquare {
  return createSquareAtWorldPosition(frame, getWorldPosition(frame, localPosition));
}

function createSquareAtWorldPosition(
  frame: PatternFrame,
  center: Position,
): ResolvedAoeSquare {
  return {
    type: "square",
    center,
    size: AOE_PATTERN_SQUARE_SIZE,
    rotationRadians: frame.rotationRadians,
  };
}

function createRing(
  center: Position,
  innerRadius: number,
  outerRadius: number,
): ResolvedAoePrimitive {
  const inner = Math.max(0, Math.min(innerRadius, outerRadius));
  const outer = Math.max(inner, innerRadius, outerRadius, 0);

  return {
    type: "ring",
    center,
    innerRadius: inner,
    outerRadius: outer,
  };
}

function isPositionInsidePrimitive(
  primitive: ResolvedAoePrimitive,
  position: Position,
): boolean {
  switch (primitive.type) {
    case "circle":
      return getDistanceSquared(position, primitive.center) <=
        primitive.radius * primitive.radius + GEOMETRY_EPSILON;
    case "ring": {
      const distanceSquared = getDistanceSquared(position, primitive.center);
      return (
        distanceSquared + GEOMETRY_EPSILON >=
          primitive.innerRadius * primitive.innerRadius &&
        distanceSquared <=
          primitive.outerRadius * primitive.outerRadius + GEOMETRY_EPSILON
      );
    }
    case "square": {
      const local = rotate(
        {
          x: position.x - primitive.center.x,
          y: position.y - primitive.center.y,
        },
        -primitive.rotationRadians,
      );
      const halfSize = primitive.size / 2 + GEOMETRY_EPSILON;
      return Math.abs(local.x) <= halfSize && Math.abs(local.y) <= halfSize;
    }
    case "rectangle": {
      const local = rotate(
        {
          x: position.x - primitive.center.x,
          y: position.y - primitive.center.y,
        },
        -primitive.rotationRadians,
      );
      return (
        Math.abs(local.x) <= primitive.width / 2 + GEOMETRY_EPSILON &&
        Math.abs(local.y) <= primitive.height / 2 + GEOMETRY_EPSILON
      );
    }
    case "cone":
      return isPositionInsideCone(primitive, position);
  }
}

function isPositionInsideCone(
  cone: ResolvedAoeCone,
  position: Position,
): boolean {
  const delta = {
    x: position.x - cone.origin.x,
    y: position.y - cone.origin.y,
  };
  const distanceSquared = delta.x * delta.x + delta.y * delta.y;

  if (distanceSquared <= GEOMETRY_EPSILON) {
    return true;
  }

  if (distanceSquared > cone.range * cone.range + GEOMETRY_EPSILON) {
    return false;
  }

  if (cone.angleRadians >= Math.PI * 2 - GEOMETRY_EPSILON) {
    return true;
  }

  const distance = Math.sqrt(distanceSquared);
  const cosine =
    (delta.x * cone.direction.x + delta.y * cone.direction.y) / distance;

  return cosine + GEOMETRY_EPSILON >= Math.cos(cone.angleRadians / 2);
}

function getPrimitiveBounds(
  primitives: ResolvedAoePrimitive[],
  fallback: Position,
): AoeBounds {
  if (primitives.length === 0) {
    return { minX: fallback.x, maxX: fallback.x, minY: fallback.y, maxY: fallback.y };
  }

  return primitives.reduce<AoeBounds>((bounds, primitive) => {
    const primitiveBounds = getSinglePrimitiveBounds(primitive);

    return {
      minX: Math.min(bounds.minX, primitiveBounds.minX),
      maxX: Math.max(bounds.maxX, primitiveBounds.maxX),
      minY: Math.min(bounds.minY, primitiveBounds.minY),
      maxY: Math.max(bounds.maxY, primitiveBounds.maxY),
    };
  }, getSinglePrimitiveBounds(primitives[0]));
}

function getSinglePrimitiveBounds(primitive: ResolvedAoePrimitive): AoeBounds {
  if (primitive.type === "circle") {
    return radiusBounds(primitive.center, primitive.radius);
  }

  if (primitive.type === "ring") {
    return radiusBounds(primitive.center, primitive.outerRadius);
  }

  if (primitive.type === "cone") {
    return radiusBounds(primitive.origin, primitive.range);
  }

  const corners = primitive.type === "square"
    ? getSquareCorners(primitive)
    : getRectangleCorners(primitive);

  return {
    minX: Math.min(...corners.map((corner) => corner.x)),
    maxX: Math.max(...corners.map((corner) => corner.x)),
    minY: Math.min(...corners.map((corner) => corner.y)),
    maxY: Math.max(...corners.map((corner) => corner.y)),
  };
}

function getRectangleCorners(rectangle: ResolvedAoeRectangle): Position[] {
  const halfWidth = rectangle.width / 2;
  const halfHeight = rectangle.height / 2;

  return [
    { x: -halfWidth, y: -halfHeight },
    { x: halfWidth, y: -halfHeight },
    { x: halfWidth, y: halfHeight },
    { x: -halfWidth, y: halfHeight },
  ].map((corner) => {
    const rotated = rotate(corner, rectangle.rotationRadians);
    return {
      x: rectangle.center.x + rotated.x,
      y: rectangle.center.y + rotated.y,
    };
  });
}

function getSquareCorners(square: ResolvedAoeSquare): Position[] {
  const halfSize = square.size / 2;

  return [
    { x: -halfSize, y: -halfSize },
    { x: halfSize, y: -halfSize },
    { x: halfSize, y: halfSize },
    { x: -halfSize, y: halfSize },
  ].map((corner) => {
    const rotated = rotate(corner, square.rotationRadians);
    return { x: square.center.x + rotated.x, y: square.center.y + rotated.y };
  });
}

function radiusBounds(center: Position, radius: number): AoeBounds {
  return {
    minX: center.x - radius,
    maxX: center.x + radius,
    minY: center.y - radius,
    maxY: center.y + radius,
  };
}

function getWorldPosition(frame: PatternFrame, localPosition: Position): Position {
  return {
    x:
      frame.origin.x +
      frame.forward.x * localPosition.x +
      frame.right.x * localPosition.y,
    y:
      frame.origin.y +
      frame.forward.y * localPosition.x +
      frame.right.y * localPosition.y,
  };
}

function normalizeDirection(direction: Position): Position {
  const length = Math.hypot(direction.x, direction.y);

  if (length <= GEOMETRY_EPSILON) {
    return { ...DEFAULT_DIRECTION };
  }

  return { x: direction.x / length, y: direction.y / length };
}

function rotate(position: Position, angleRadians: number): Position {
  const cosine = Math.cos(angleRadians);
  const sine = Math.sin(angleRadians);

  return {
    x: position.x * cosine - position.y * sine,
    y: position.x * sine + position.y * cosine,
  };
}

function getDistanceSquared(first: Position, second: Position): number {
  const deltaX = first.x - second.x;
  const deltaY = first.y - second.y;
  return deltaX * deltaX + deltaY * deltaY;
}

function toWholeCount(value: number): number {
  return Math.max(0, Math.floor(value));
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function deduplicatePrimitives(
  primitives: ResolvedAoePrimitive[],
): ResolvedAoePrimitive[] {
  const seen = new Set<string>();

  return primitives.filter((primitive) => {
    const signature = getPrimitiveSignature(primitive);

    if (seen.has(signature)) {
      return false;
    }

    seen.add(signature);
    return true;
  });
}

function getPrimitiveSignature(primitive: ResolvedAoePrimitive): string {
  switch (primitive.type) {
    case "circle":
      return `circle:${pointSignature(primitive.center)}:${numberSignature(primitive.radius)}`;
    case "ring":
      return `ring:${pointSignature(primitive.center)}:${numberSignature(primitive.innerRadius)}:${numberSignature(primitive.outerRadius)}`;
    case "square":
      return `square:${pointSignature(primitive.center)}:${numberSignature(primitive.size)}:${numberSignature(primitive.rotationRadians)}`;
    case "rectangle":
      return `rectangle:${pointSignature(primitive.center)}:${numberSignature(primitive.width)}:${numberSignature(primitive.height)}:${numberSignature(primitive.rotationRadians)}`;
    case "cone":
      return `cone:${pointSignature(primitive.origin)}:${pointSignature(primitive.direction)}:${numberSignature(primitive.range)}:${numberSignature(primitive.angleRadians)}`;
  }
}

function pointSignature(position: Position): string {
  return `${numberSignature(position.x)},${numberSignature(position.y)}`;
}

function boundsSignature(bounds: AoeBounds): string {
  return [bounds.minX, bounds.maxX, bounds.minY, bounds.maxY]
    .map(numberSignature)
    .join(",");
}

function numberSignature(value: number): string {
  return value.toFixed(9);
}

type PatternFrame = {
  origin: Position;
  forward: Position;
  right: Position;
  rotationRadians: number;
};
