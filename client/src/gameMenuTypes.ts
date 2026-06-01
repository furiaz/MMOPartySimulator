export type GameMenuTab =
  | "party"
  | "partyManagement"
  | "inventory"
  | "quests"
  | "world";

export type PartyMenuSection =
  | "stats"
  | "equipment"
  | "skills"
  | "skillPreferences";

export type PartyManagementSection =
  | "role"
  | "partyOrder"
  | "formation"
  | "behaviorSettings";

export type PartyShortcutTarget = PartyMenuSection;
