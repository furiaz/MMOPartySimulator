import type { GameMap, Position, ZoneSubzone } from "./types";

export function getSubzoneAtPosition(
  map: GameMap | undefined,
  position: Position | null | undefined,
): ZoneSubzone | null {
  if (!map?.subzones || !position) {
    return null;
  }

  return (
    map.subzones.find((subzone) => isPositionInsideSubzone(position, subzone)) ??
    null
  );
}

export function isPositionInsideSubzone(
  position: Position,
  subzone: ZoneSubzone,
): boolean {
  const { bounds } = subzone;

  return (
    position.x >= bounds.x &&
    position.x < bounds.x + bounds.width &&
    position.y >= bounds.y &&
    position.y < bounds.y + bounds.height
  );
}
