import { getItemDefinitionForResourceType } from "./game/items";
import type { ResourceEntity } from "./game/types";

export type ResourceTooltipDetails = {
  title: string;
  rows: Array<{ label: string; value: string }>;
};

const resourceTypeLabels: Record<ResourceEntity["resourceType"], string> = {
  wood: "Wood",
  ore: "Ore",
  herb: "Herb",
};

export function getResourceTooltipDetails(
  resource: ResourceEntity,
): ResourceTooltipDetails {
  const resourceTypeLabel = resourceTypeLabels[resource.resourceType];
  const itemDefinition = getItemDefinitionForResourceType(
    resource.resourceType,
    resource.tier,
  );

  return {
    title: itemDefinition?.displayName ?? resourceTypeLabel,
    rows: [
      { label: "Type", value: resourceTypeLabel },
      { label: "Tier", value: resource.tier.toString() },
      {
        label: "Durability",
        value: `${resource.durability}/${resource.maxDurability}`,
      },
      { label: "Quantity", value: resource.quantity.toString() },
    ],
  };
}
