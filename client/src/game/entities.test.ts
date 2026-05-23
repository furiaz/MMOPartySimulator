import { describe, expect, it } from "vitest";
import { createResource, gatherResource } from "./entities";

describe("resource depletion", () => {
  it("creates zero-quantity resources as depleted with zero durability", () => {
    const resource = createResource("empty-resource", { x: 0, y: 0 }, {
      durability: 5,
      quantity: 0,
    });

    expect(resource).toMatchObject({
      durability: 0,
      quantity: 0,
      isDepleted: true,
    });
  });

  it("depletes after the final quantity yield", () => {
    let resource = createResource("wood", { x: 0, y: 0 }, {
      durability: 1,
      maxDurability: 1,
      quantity: 3,
    });

    resource = gatherResource(resource, 1);

    expect(resource).toMatchObject({
      durability: 1,
      quantity: 2,
      isDepleted: false,
    });

    resource = gatherResource(resource, 1);

    expect(resource).toMatchObject({
      durability: 1,
      quantity: 1,
      isDepleted: false,
    });

    resource = gatherResource(resource, 1);

    expect(resource).toMatchObject({
      durability: 0,
      quantity: 0,
      isDepleted: true,
    });
  });
});
