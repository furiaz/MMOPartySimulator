export type GuidePopupId = "welcome" | "equipment_setup" | "first_wipe_rescue";

type GuidePopupPanel = {
  title: string;
  body: string;
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
        title: "Auto Mode",
        body: "Auto Mode plays for you, but may pause at tutorial checkpoints to guide you.",
      },
      {
        title: "Have Fun",
        body: "Turn both on and have fun!",
      },
    ],
  },
  equipment_setup: {
    id: "equipment_setup",
    ariaLabel: "Equipment setup guide",
    panels: [
      {
        title: "You completed the first quest!",
        body: "Now it is time to set up the party.",
      },
      {
        title: "Visit the Merchant",
        body: "Sell monster parts and buy equipment from the Merchant.",
      },
      {
        title: "Open the Main Menu",
        body: "Open the Main Menu at the top right and equip items.",
      },
      {
        title: "Party Management",
        body: "Explore the Party Management settings before heading back out.",
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
