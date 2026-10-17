import { describe, expect, it } from "vitest";
import { createBarrackEntity, BARRACK_DEFINITIONS } from "../game/barrackDefinitions";
import { createDebugMap } from "../game/debugMap";
import { getEntityPointerHit, getNearestInteractableEntity } from "./PixiWorldRendererHelpers";

describe("Barrack pointer presentation", () => {
  const map = createDebugMap("map-7");
  const entity = createBarrackEntity(BARRACK_DEFINITIONS[0]);
  it("allows artwork selection while keeping damage geometry separate", () => {
    expect(getEntityPointerHit({ cellPixelSize: 32, entity, map, mapPosition: { x: 72.5, y: 24.5 } })).toEqual({ distanceSquared: 0 });
    expect(getEntityPointerHit({ cellPixelSize: 32, entity, map, mapPosition: { x: 75, y: 22 } })).toEqual({ distanceSquared: 0 });
    expect(getEntityPointerHit({ cellPixelSize: 32, entity, map, mapPosition: { x: 75, y: 20 } })).toBeNull();
    expect(getNearestInteractableEntity({ cellPixelSize: 32, entities: [entity], map, mapPosition: { x: 77, y: 26 } })?.id).toBe(entity.id);
  });
  it("does not expose a destroyed Barrack as a click target", () => {
    expect(getNearestInteractableEntity({ cellPixelSize: 32, entities: [{ ...entity, health: 0, state: "dead" }], map, mapPosition: entity.position })).toBeNull();
  });
});
