import { describe, expect, it } from "vitest";
import { createEnemy, createResource, gatherResource } from "./entities";

describe("enemy encounter bands", () => {
  it("defaults enemies to Standard and accepts each non-standard band", () => {
    expect(createEnemy("standard", { x: 0, y: 0 }).encounterBand).toBe(
      "standard",
    );
    expect(
      createEnemy("elite", { x: 0, y: 0 }, undefined, {
        encounterBand: "elite",
      }).encounterBand,
    ).toBe("elite");
    expect(
      createEnemy("champion", { x: 0, y: 0 }, undefined, {
        encounterBand: "champion",
      }).encounterBand,
    ).toBe("champion");
    expect(
      createEnemy("boss", { x: 0, y: 0 }, undefined, {
        encounterBand: "boss",
      }).encounterBand,
    ).toBe("boss");
  });
});

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

  it("records when a resource is depleted", () => {
    const resource = createResource("wood", { x: 0, y: 0 }, {
      durability: 1,
      maxDurability: 1,
      quantity: 1,
    });

    const depletedResource = gatherResource(resource, 1, 12_345);

    expect(depletedResource).toMatchObject({
      durability: 0,
      quantity: 0,
      isDepleted: true,
      depletedAtMs: 12_345,
    });
  });
});
