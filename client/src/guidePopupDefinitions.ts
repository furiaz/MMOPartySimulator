import { NPC_ICON_SRC } from "./assetIcons";
import type {
  AtlasSubpage,
  GameMenuTab,
  PartyManagementSection,
  PartyMenuSection,
} from "./gameMenuTypes";

export type GuidePopupId =
  | "welcome"
  | "first_quest_started"
  | "equipment_setup"
  | "first_smith_quest_started"
  | "first_equipment_crafted"
  | "first_route_unlock_quest"
  | "first_route_unlocked"
  | "first_class_path"
  | "first_class_selected"
  | "first_wipe_rescue";

export type GuidePopupMenuTarget = {
  tab: GameMenuTab;
  atlasSubpage?: AtlasSubpage;
  partySection?: PartyMenuSection;
  partyManagementSection?: PartyManagementSection;
};

export type GuidePopupPanel = {
  title: string;
  body: string;
  bodyIcon?: {
    src: string;
    alt: string;
  };
  menuTarget?: GuidePopupMenuTarget;
};

export type GuidePopupDefinition = {
  id: GuidePopupId;
  ariaLabel: string;
  panels: GuidePopupPanel[];
};

export const guidePopupDefinitions: Record<GuidePopupId, GuidePopupDefinition> = {
  welcome: {
    id: "welcome",
    ariaLabel: "Welcome guide",
    panels: [
      {
        title: "Welcome to MMO Party Simulator",
        body: "Start/Stop Simulation plays or pauses the game.",
      },
      {
        title: "Auto Combat",
        body: "Auto Combat handles nearby danger while you choose where the party travels.",
      },
      {
        title: "Get the First Quest",
        body: "Look for this quest marker, accept your first quest, then turn on Auto Combat and have fun.",
        bodyIcon: {
          src: NPC_ICON_SRC.quest_giver ?? "",
          alt: "Available quest marker",
        },
      },
      {
        title: "Party",
        body: "Party shows companion stats, equipment, skills, and skill preferences.",
        menuTarget: {
          tab: "party",
          partySection: "stats",
        },
      },
      {
        title: "Party Management",
        body: "Role Select changes companion priorities. Party Order chooses who leads, Formation is a placeholder, and Behavior Settings control party-wide options.",
        menuTarget: {
          tab: "partyManagement",
          partyManagementSection: "role",
        },
      },
      {
        title: "Inventory",
        body: "Inventory holds shared items, equipment, flasks, and skill books for the party.",
        menuTarget: {
          tab: "inventory",
        },
      },
      {
        title: "Atlas",
        body: "Atlas keeps early reference pages for Quests, Crafts, Bank, and AFK Estimate.",
        menuTarget: {
          tab: "atlas",
          atlasSubpage: "quests",
        },
      },
      {
        title: "World Travel",
        body: "World Travel routes the party toward known zones and quest destinations.",
        menuTarget: {
          tab: "world",
        },
      },
      {
        title: "Options",
        body: "Options has manual save, export, import, and other game controls.",
        menuTarget: {
          tab: "options",
        },
      },
    ],
  },
  first_quest_started: {
    id: "first_quest_started",
    ariaLabel: "First quest guide",
    panels: [
      {
        title: "Quest Helper",
        body: "The Quest Helper tracks your current quest and its next objective.",
      },
      {
        title: "Quest Menu",
        body: "Use the ? button on the Quest Helper to open the Atlas quest view.",
      },
      {
        title: "Finding New Zones",
        body: "Purple on the minimap marks the teleporter toward the next zone.",
      },
    ],
  },
  equipment_setup: {
    id: "equipment_setup",
    ariaLabel: "Equipment setup guide",
    panels: [
      {
        title: "First Aid Book",
        body: "Buy a First Aid skill book from the Merchant, then open Inventory and read it with an eligible companion.",
      },
    ],
  },
  first_smith_quest_started: {
    id: "first_smith_quest_started",
    ariaLabel: "Smithy guide",
    panels: [
      {
        title: "The Smithy",
        body: "The Smith can craft equipment when you have the required materials.",
      },
      {
        title: "Crafting Objectives",
        body: "Some quests ask you to craft or equip items instead of traveling to a zone.",
      },
    ],
  },
  first_equipment_crafted: {
    id: "first_equipment_crafted",
    ariaLabel: "First crafted equipment guide",
    panels: [
      {
        title: "First Crafted Equipment",
        body: "You just crafted your first equipment. Keep your gear updated as the party grows.",
      },
    ],
  },
  first_route_unlock_quest: {
    id: "first_route_unlock_quest",
    ariaLabel: "Route unlock quest guide",
    panels: [
      {
        title: "Quest Chains",
        body: "Some quests have steps that must be completed in order.",
      },
      {
        title: "Clearing Routes",
        body: "Inspect, escort, repair, and unlock objectives can open the way to new areas.",
      },
    ],
  },
  first_route_unlocked: {
    id: "first_route_unlocked",
    ariaLabel: "First route unlocked guide",
    panels: [
      {
        title: "Route Unlocked",
        body: "New routes become available as quests repair or unlock teleporters.",
      },
      {
        title: "World Travel",
        body: "Use World Travel or the Quest Helper route button to guide the party toward known zones.",
      },
    ],
  },
  first_class_path: {
    id: "first_class_path",
    ariaLabel: "First class path guide",
    panels: [
      {
        title: "Class Mentor",
        body: "The Class Mentor helps eligible Beginner companions choose a first class.",
      },
      {
        title: "First Class Requirements",
        body: "Beginner companions need level 10 and compatible equipment before choosing a first class.",
      },
    ],
  },
  first_class_selected: {
    id: "first_class_selected",
    ariaLabel: "First class selected guide",
    panels: [
      {
        title: "First Class Chosen",
        body: "Classes unlock new skills, stats, and equipment direction. Roles still decide how companions behave.",
      },
    ],
  },
  first_wipe_rescue: {
    id: "first_wipe_rescue",
    ariaLabel: "Party wipe rescue guide",
    panels: [
      {
        title: "Your party got wiped!",
        body: "But it's okay.",
      },
      {
        title: "Rescue Crew",
        body: "The dog rescue squad will always bring you back to safety.",
      },
    ],
  },
};
