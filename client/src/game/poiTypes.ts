import type { DebugMapId, Position } from "./types";
import type { QuestId } from "./questTypes";

export type PoiCategory =
  | "npc"
  | "quest"
  | "combat"
  | "resource"
  | "teleport"
  | "exploration"
  | "idle"
  | "event";

export type PoiMapType = "hub" | "wild";

export type PoiAvailability = "available" | "active" | "completed" | "disabled";

export type PointOfInterest = {
  id: string;
  category: PoiCategory;
  mapId: DebugMapId;
  displayName: string;
  position: Position;
  availability?: PoiAvailability;
  linkedQuestId?: QuestId;
  linkedObjectiveId?: string;
  priorityWeight?: number;
  interactionRange?: number;
  targetEntityId?: string;
};
