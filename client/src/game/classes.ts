import type { ClassDefinition, ClassId } from "./types";

export type FirstClassId = Exclude<ClassId, "beginner">;

export const FIRST_CLASS_IDS: FirstClassId[] = [
  "blade",
  "aegis",
  "hunter",
  "beast",
  "elementalist",
  "runecaster",
  "lightbearer",
  "penitent",
];

export function isFirstClassId(classId: ClassId): classId is FirstClassId {
  return classId !== "beginner";
}

export const CLASS_DEFINITIONS: Record<ClassId, ClassDefinition> = {
  beginner: {
    id: "beginner",
    path: null,
    displayName: "Beginner",
  },
  blade: {
    id: "blade",
    path: "honor",
    displayName: "Blade",
  },
  aegis: {
    id: "aegis",
    path: "honor",
    displayName: "Aegis",
  },
  hunter: {
    id: "hunter",
    path: "primal",
    displayName: "Hunter",
  },
  beast: {
    id: "beast",
    path: "primal",
    displayName: "Beast",
  },
  elementalist: {
    id: "elementalist",
    path: "arcane",
    displayName: "Elementalist",
  },
  runecaster: {
    id: "runecaster",
    path: "arcane",
    displayName: "Runecaster",
  },
  lightbearer: {
    id: "lightbearer",
    path: "holy",
    displayName: "Lightbearer",
  },
  penitent: {
    id: "penitent",
    path: "holy",
    displayName: "Penitent",
  },
};
