import { describe, expect, it } from "vitest";
import { getItemDefinitionForResourceType } from "./items";

describe("prototype item definitions", () => {
  it("maps resource type and tier to the intended gathered item", () => {
    expect(getItemDefinitionForResourceType("wood", 1).id).toBe("softwood");
    expect(getItemDefinitionForResourceType("ore", 1).id).toBe("copper_ore");
    expect(getItemDefinitionForResourceType("herb", 1).id).toBe("field_herb");
    expect(getItemDefinitionForResourceType("wood", 2).id).toBe("hardwood");
    expect(getItemDefinitionForResourceType("ore", 2).id).toBe("iron_ore");
    expect(getItemDefinitionForResourceType("herb", 2).id).toBe("redleaf_herb");
  });
});
