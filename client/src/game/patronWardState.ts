import type {
  EnemyTypeId,
  MapVisualObjectId,
  Position,
} from "./types";
import type {
  PatronWardId,
  PatronWardRuntimeState,
  QuestState,
} from "./questTypes";

export const PATRON_WARD_QUEST_ID = "the_patrons_shadow" as const;
export const PATRON_WARD_INTERACTION_RANGE = 3;
export const PATRON_WARD_ARENA_CENTER: Position = { x: 96, y: 29 };
export const PATRON_WARD_ARENA_RADIUS = 18;
export const PATRON_WARD_RETREAT_RESET_DELAY_MS = 3_000;
export const PATRON_WARD_WAVE_DELAY_MS = 750;
export const PATRON_WARD_FADE_DURATION_MS = 1_000;
export const PATRON_FINALE_HOLD_DURATION_MS = 3_000;
export const PATRON_WARMASTER_FADE_DURATION_MS = 500;
export const PATRON_BARRIER_FADE_DURATION_MS = 750;
export const PATRON_AURA_FRAME_DURATION_MS = 100;
export const NIGHTMIRE_BARRIER_CENTER: Position = { x: 104, y: 29 };
export const NIGHTMIRE_BARRIER_RADIUS = 5;
export const NIGHTMIRE_ROUTE_TELEPORT_ID = "map-6-to-map-7";
export const PATRON_WARMASTER_SPEECH =
  "You have drawn the Patron's gaze. Come, then.";

export type PatronWardDefinition = {
  id: PatronWardId;
  objectiveId: string;
  displayName: string;
  position: Position;
  visualObjectId: string;
  visualId: MapVisualObjectId;
  enemyTypeId: EnemyTypeId;
  waveCounts: readonly number[];
};

export const PATRON_WARD_DEFINITIONS: readonly PatronWardDefinition[] = [
  {
    id: "night_bat_ward",
    objectiveId: "break_night_bat_ward",
    displayName: "Night Bat Ward",
    position: { x: 96, y: 20 },
    visualObjectId: "map-6-bat-roost",
    visualId: "nightmire_bat_roost_dead_tree",
    enemyTypeId: "night_bat",
    waveCounts: [3, 3],
  },
  {
    id: "elder_mossling_ward",
    objectiveId: "break_elder_mossling_ward",
    displayName: "Elder Mossling Ward",
    position: { x: 96, y: 29 },
    visualObjectId: "map-6-oldroot-stump",
    visualId: "nightmire_ancient_elder_moss_stump",
    enemyTypeId: "elder_mossling",
    waveCounts: [4, 4],
  },
  {
    id: "cinder_wisp_ward",
    objectiveId: "break_cinder_wisp_ward",
    displayName: "Cinder Wisp Ward",
    position: { x: 96, y: 38 },
    visualObjectId: "map-6-cinder-pool",
    visualId: "nightmire_cinder_veined_standing_stone",
    enemyTypeId: "cinder_wisp",
    waveCounts: [3, 3, 4],
  },
] as const;

export const PATRON_WARD_VISUAL_OBJECT_IDS = new Set(
  PATRON_WARD_DEFINITIONS.map((ward) => ward.visualObjectId),
);

export function getPatronWardDefinition(
  wardId: PatronWardId,
): PatronWardDefinition {
  return PATRON_WARD_DEFINITIONS.find((ward) => ward.id === wardId) ??
    PATRON_WARD_DEFINITIONS[0];
}

export function getPatronWardQuest(
  quests: Partial<Record<string, QuestState>>,
): QuestState | undefined {
  return quests[PATRON_WARD_QUEST_ID];
}

export function areAllPatronWardsCompleted(
  quest: QuestState | undefined,
): boolean {
  return Boolean(
    quest &&
      PATRON_WARD_DEFINITIONS.every(
        (ward) => quest.objectiveProgress[ward.objectiveId]?.completed,
      ),
  );
}

export function isNightmireRouteOpen(
  quests: Partial<
    Record<
      string,
      {
        runtime?: {
          patronWards?: Pick<
            PatronWardRuntimeState,
            "routeUnlocked" | "legacyRoutePreserved"
          >;
        };
      }
    >
  >,
): boolean {
  const runtime = quests[PATRON_WARD_QUEST_ID]?.runtime?.patronWards;

  return runtime?.routeUnlocked === true || runtime?.legacyRoutePreserved === true;
}

export function sanitizePersistentPatronWardRuntime(
  runtime: PatronWardRuntimeState | undefined,
  allWardsCompleted: boolean,
  preserveLegacyRoute: boolean,
): PatronWardRuntimeState | undefined {
  const routeUnlocked =
    preserveLegacyRoute || runtime?.routeUnlocked === true || allWardsCompleted;
  const legacyRoutePreserved =
    preserveLegacyRoute || runtime?.legacyRoutePreserved === true;

  if (!routeUnlocked && !legacyRoutePreserved) {
    return undefined;
  }

  return {
    ...(routeUnlocked ? { routeUnlocked: true as const } : {}),
    ...(legacyRoutePreserved
      ? { legacyRoutePreserved: true as const }
      : {}),
  };
}

export function createNightmireBarrierCollisionCells(): Position[] {
  const cells: Position[] = [];
  const minimumX = Math.floor(
    NIGHTMIRE_BARRIER_CENTER.x - NIGHTMIRE_BARRIER_RADIUS,
  );
  const maximumX = Math.ceil(
    NIGHTMIRE_BARRIER_CENTER.x + NIGHTMIRE_BARRIER_RADIUS,
  );
  const minimumY = Math.floor(
    NIGHTMIRE_BARRIER_CENTER.y - NIGHTMIRE_BARRIER_RADIUS,
  );
  const maximumY = Math.ceil(
    NIGHTMIRE_BARRIER_CENTER.y + NIGHTMIRE_BARRIER_RADIUS,
  );

  for (let y = minimumY; y <= maximumY; y += 1) {
    for (let x = minimumX; x <= maximumX; x += 1) {
      const cellCenter = { x: x + 0.5, y: y + 0.5 };

      if (
        Math.hypot(
          cellCenter.x - NIGHTMIRE_BARRIER_CENTER.x,
          cellCenter.y - NIGHTMIRE_BARRIER_CENTER.y,
        ) <= NIGHTMIRE_BARRIER_RADIUS
      ) {
        cells.push({ x, y });
      }
    }
  }

  return cells;
}
