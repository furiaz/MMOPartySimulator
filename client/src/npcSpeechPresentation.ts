import {
  getFirstIncompleteObjective,
  getQuestDefinition,
  getQuestGiverAvailableQuests,
  getQuestGiverCurrentQuests,
  getQuestGiverReadyQuests,
  type GameState,
  type NpcEntity,
} from "./game";

export const NPC_SPEECH_DURATION_MS = 5_000;
export const NPC_SPEECH_FADE_DURATION_MS = 500;

export type ActiveNpcSpeech = {
  createdAt: number;
  expiresAt: number;
  mapId?: string;
  npcId: string;
  text: string;
};

export const npcSpeechObjectiveHints: Readonly<Record<string, string>> = {
  defeat_shore_fringe_slimes:
    "The Shore Fringe won’t be safe until those slimes are cleared out.",
  gather_shore_fringe_wood:
    "Gather some wood from the Shore Fringe. We’ll need it for the landing.",
  inspect_shore_fringe_marker:
    "Check the supply marker in the Shore Fringe before you return.",
  equip_training_sword:
    "Equip the Training Sword so the expedition is ready to fight.",
  equip_guard_coif: "Put on the Guard Coif I gave you.",
  equip_minor_recovery_flask:
    "Equip a Minor Recovery Flask before heading out.",
  buy_first_aid_skill_book:
    "The Merchant carries a First Aid skill book. Buy one for the party.",
  craft_plain_charm:
    "Take the materials to the Smith and have a Plain Charm crafted.",
  equip_plain_charm: "Equip the Plain Charm once the Smith is finished.",
  collect_mossy_glade_supplies:
    "The Cave Bats in Mossy Glade are carrying our stolen supplies.",
  inspect_lower_shore_wreckage:
    "Start by inspecting the webbed wreckage in the Lower Shore.",
  defeat_lower_shore_spiders:
    "Clear the Forest Spiders away from the Lower Shore.",
  escort_lower_shore_worker:
    "Find the Route Worker and escort them to the blockage.",
  repair_lower_shore_blockage:
    "Help repair the blockage once the route is secure.",
  unlock_map_two_route: "The way is repaired. Open the route onward.",
  collect_scout_rise_samples:
    "Search the outskirts for the samples our scouts need.",
  reach_grove_runner:
    "Find the missing Grove Runner in the southeast grove.",
  rescue_grove_runner: "Clear the enemies around the Grove Runner.",
  repair_old_grove_cache:
    "Repair the old field cache after the runner is safe.",
  defend_old_grove_cache:
    "Hold the field cache while the work is completed.",
  escort_causeway_worker:
    "Escort the Causeway Worker across the wolf territory.",
  defend_wolf_causeway:
    "Defend the worker while the causeway is opened.",
  defeat_causeway_elite:
    "A stronger wolf is blocking the route. Bring it down.",
  unlock_map_three_route:
    "The causeway is clear. Open the route into Azurefen Hollow.",
  inspect_broken_thicket_trail_marker:
    "Inspect the trail marker in the Broken Thicket.",
  collect_crawler_shell_fragments:
    "Stone Crawlers in the thicket carry the shell fragments we need.",
  gather_broken_thicket_herbs:
    "Gather a few herbs before leaving the Broken Thicket.",
  inspect_crawler_shelf_overlook: "Survey the overlook at Crawler Shelf.",
  collect_shelf_rune_scraps:
    "The goblins at Crawler Shelf are carrying rune scraps.",
  repair_crawler_shelf_route_marker:
    "Repair the route marker at Crawler Shelf.",
  inspect_slimeward_camp_teleporter:
    "Inspect the broken teleporter in Imp Fen.",
  defeat_imp_fen_mosslings:
    "Clear the Mosslings away from the teleporter.",
  collect_teleporter_stabilizers:
    "The nearby goblins have the stabilizers needed for the teleporter.",
  repair_slimeward_camp_teleporter:
    "Use the stabilizers to repair the Slimeward teleporter.",
  unlock_slimeward_camp_route:
    "The teleporter is ready. Open the route to Slimeward Camp.",
  enter_slimeward_floor_one: "Enter Slimeward and begin the Azure Trial.",
  defeat_azure_mass: "The Azure Mass waits below. Defeat it.",
  collect_slimeward_boss_chest:
    "Claim the chest beyond the Azure Mass to finish the trial.",
};

const genericGreetings = ["Welcome.", "Hello.", "What’s up, dood?"] as const;

export function canNpcShowSpeech(npc: Pick<NpcEntity, "npcRole">): boolean {
  return (
    npc.npcRole === "quest_giver" ||
    npc.npcRole === "class_mentor" ||
    npc.npcRole === "merchant" ||
    npc.npcRole === "smith" ||
    npc.npcRole === "guild_coordinator" ||
    npc.npcRole === "tavern_keeper" ||
    npc.npcRole === "farmer" ||
    npc.npcRole === "livestock_keeper" ||
    npc.npcRole === "dog"
  );
}

export function createNpcSpeech(
  state: GameState,
  npc: NpcEntity,
  now = Date.now(),
  random = Math.random,
): ActiveNpcSpeech | null {
  const text = resolveNpcSpeechText(state, npc, random);

  return text
    ? {
        createdAt: now,
        expiresAt: now + NPC_SPEECH_DURATION_MS,
        mapId: state.currentMapId ?? state.map?.id,
        npcId: npc.id,
        text,
      }
    : null;
}

export function resolveNpcSpeechText(
  state: GameState,
  npc: NpcEntity,
  random = Math.random,
): string | null {
  if (npc.npcRole === "quest_giver") {
    return resolveQuestSpeech(state, npc.id, "No new work right now.");
  }

  if (npc.npcRole === "class_mentor") {
    return resolveQuestSpeech(
      state,
      npc.id,
      "When a Beginner is ready, I can help them choose their first class.",
    );
  }

  if (npc.npcRole === "merchant") {
    return "I sell equipment, flasks, skill books—and even the occasional seed.";
  }

  if (npc.npcRole === "smith") {
    return "Bring me materials and Crowns, and I can craft equipment for you.";
  }

  if (npc.npcRole === "farmer") {
    return "Keep an eye out for seeds. I can grow any new crops you discover.";
  }

  if (npc.npcRole === "livestock_keeper") {
    return "Wild creatures sometimes leave behind young I can raise here.";
  }

  if (
    npc.npcRole === "guild_coordinator" ||
    npc.npcRole === "tavern_keeper"
  ) {
    return genericGreetings[getRandomIndex(genericGreetings.length, random)];
  }

  if (npc.npcRole === "dog") {
    return npc.displayName === "Bastion Dog" || npc.displayName === "Camp Dog"
      ? "Arf!"
      : "Woof!";
  }

  return null;
}

export function getNpcSpeechOpacity(
  speech: ActiveNpcSpeech,
  now: number,
): number {
  if (now >= speech.expiresAt) {
    return 0;
  }

  const fadeStartsAt = speech.expiresAt - NPC_SPEECH_FADE_DURATION_MS;

  if (now <= fadeStartsAt) {
    return 1;
  }

  return Math.max(
    0,
    Math.min(1, (speech.expiresAt - now) / NPC_SPEECH_FADE_DURATION_MS),
  );
}

function resolveQuestSpeech(
  state: GameState,
  questGiverId: string,
  fallback: string,
): string {
  if (getQuestGiverReadyQuests(state, questGiverId).length > 0) {
    return "You’re back. How did it go?";
  }

  if (getQuestGiverAvailableQuests(state, questGiverId).length > 0) {
    return "I’ve got a quest for you.";
  }

  const currentQuest = getQuestGiverCurrentQuests(state, questGiverId)[0];

  if (!currentQuest) {
    return fallback;
  }

  const questDefinition = getQuestDefinition(currentQuest.questId);
  const objective = getFirstIncompleteObjective(state, currentQuest.questId);

  return getNpcSpeechObjectiveHint(
    objective?.id ?? "",
    questDefinition.displayName,
  );
}

export function getNpcSpeechObjectiveHint(
  objectiveId: string,
  questDisplayName: string,
): string {
  return (
    npcSpeechObjectiveHints[objectiveId] ??
    `Keep working on ${questDisplayName}.`
  );
}

function getRandomIndex(length: number, random: () => number): number {
  return Math.min(length - 1, Math.max(0, Math.floor(random() * length)));
}
