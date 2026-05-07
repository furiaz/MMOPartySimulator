import type { ClassDefinition, ClassId } from "./types";

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
