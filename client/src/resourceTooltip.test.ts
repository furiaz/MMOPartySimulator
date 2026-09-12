import { describe, expect, it } from "vitest";
import { createResource } from "./game/entities";
import { getResourceTooltipDetails } from "./resourceTooltip";

describe("resource tooltip details", () => {
  it("shows the produced item name and current quantity", () => {
    const resource = createResource("wood-node", { x: 0, y: 0 }, {
      resourceType: "wood",
      tier: 1,
      durability: 3,
      maxDurability: 5,
      quantity: 7,
    });

    expect(getResourceTooltipDetails(resource)).toEqual({
      title: "Softwood",
      rows: [
        { label: "Type", value: "Wood" },
        { label: "Tier", value: "1" },
        { label: "Durability", value: "3/5" },
        { label: "Quantity", value: "7" },
      ],
    });
  });

  it("resolves tier-aware ore and herb item names", () => {
    expect(getResourceTooltipDetails(
      createResource("ore-node", { x: 0, y: 0 }, {
        resourceType: "ore",
        tier: 1,
      }),
    ).title).toBe("Copper Ore");
    expect(getResourceTooltipDetails(
      createResource("herb-node", { x: 0, y: 0 }, {
        resourceType: "herb",
        tier: 2,
      }),
    ).title).toBe("Redleaf Herb");
  });
});
