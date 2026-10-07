import { describe, expect, it } from "vitest";
import {
  CLASS_MENTOR_NPC_ID,
  createInitialGameState,
  createNpc,
  QUEST_DEFINITIONS,
  QUEST_ORDER,
  type GameState,
  type NpcEntity,
  type QuestId,
  type QuestStatus,
} from "./game";
import {
  canNpcShowSpeech,
  createNpcSpeech,
  getNpcSpeechObjectiveHint,
  getNpcSpeechOpacity,
  npcSpeechObjectiveHints,
  NPC_SPEECH_DURATION_MS,
  resolveNpcSpeechText,
} from "./npcSpeechPresentation";

function getQuestGiver(state: GameState): NpcEntity {
  const questGiver = Object.values(state.entities).find(
    (entity): entity is NpcEntity =>
      entity.kind === "npc" && entity.npcRole === "quest_giver",
  );

  if (!questGiver) {
    throw new Error("Expected the initial state to include a Quest Giver.");
  }

  return questGiver;
}

function withQuestStatuses(
  state: GameState,
  statuses: Partial<Record<QuestId, QuestStatus>>,
): GameState {
  return {
    ...state,
    quests: Object.fromEntries(
      QUEST_ORDER.map((questId) => [
        questId,
        {
          ...state.quests[questId],
          status: statuses[questId] ?? "locked",
        },
      ]),
    ) as GameState["quests"],
  };
}

describe("NPC speech presentation", () => {
  it("uses the approved role-specific service lines", () => {
    const state = createInitialGameState();
    const cases = [
      [
        "merchant",
        "Merchant",
        "I sell equipment, flasks, skill books—and even the occasional seed.",
      ],
      [
        "smith",
        "Smith",
        "Bring me materials and Crowns, and I can craft equipment for you.",
      ],
      [
        "farmer",
        "Farmer",
        "Keep an eye out for seeds. I can grow any new crops you discover.",
      ],
      [
        "livestock_keeper",
        "Livestock Keeper",
        "Wild creatures sometimes leave behind young I can raise here.",
      ],
    ] as const;

    for (const [role, displayName, expected] of cases) {
      const npc = createNpc(role, { x: 0, y: 0 }, displayName, role);

      expect(resolveNpcSpeechText(state, npc)).toBe(expected);
      expect(canNpcShowSpeech(npc)).toBe(true);
    }
  });

  it("selects deterministic generic greetings from the full pool", () => {
    const state = createInitialGameState();
    const coordinator = createNpc(
      "coordinator",
      { x: 0, y: 0 },
      "Guild Coordinator",
      "guild_coordinator",
    );

    expect(resolveNpcSpeechText(state, coordinator, () => 0)).toBe("Welcome.");
    expect(resolveNpcSpeechText(state, coordinator, () => 0.4)).toBe("Hello.");
    expect(resolveNpcSpeechText(state, coordinator, () => 0.999)).toBe(
      "What’s up, dood?",
    );
  });

  it("uses the approved bark for each current dog", () => {
    const state = createInitialGameState();

    expect(
      resolveNpcSpeechText(
        state,
        createNpc("dog", { x: 0, y: 0 }, "Dog", "dog"),
      ),
    ).toBe("Woof!");
    expect(
      resolveNpcSpeechText(
        state,
        createNpc("bastion-dog", { x: 0, y: 0 }, "Bastion Dog", "dog"),
      ),
    ).toBe("Arf!");
    expect(
      resolveNpcSpeechText(
        state,
        createNpc("gate-dog", { x: 0, y: 0 }, "Gate Dog", "dog"),
      ),
    ).toBe("Woof!");
    expect(
      resolveNpcSpeechText(
        state,
        createNpc("camp-dog", { x: 0, y: 0 }, "Camp Dog", "dog"),
      ),
    ).toBe("Arf!");
  });

  it("keeps chest and temporary objective NPC roles silent", () => {
    const state = createInitialGameState();

    for (const role of [
      "bank_chest",
      "dungeon_chest_closed",
      "dungeon_chest_open",
      "quest_guide",
    ] as const) {
      const npc = createNpc(role, { x: 0, y: 0 }, "Silent NPC", role);

      expect(canNpcShowSpeech(npc)).toBe(false);
      expect(resolveNpcSpeechText(state, npc)).toBeNull();
    }
  });

  it("prioritizes ready, available, and active quest speech", () => {
    const initialState = createInitialGameState();
    const questGiver = getQuestGiver(initialState);
    const activeState = withQuestStatuses(initialState, {
      clear_the_shore: "active",
    });
    const availableState = withQuestStatuses(activeState, {
      clear_the_shore: "active",
      outfit_the_expedition: "available",
    });
    const readyState = withQuestStatuses(availableState, {
      clear_the_shore: "active",
      outfit_the_expedition: "available",
      smiths_first_work: "ready_to_turn_in",
    });

    expect(resolveNpcSpeechText(activeState, questGiver)).toBe(
      npcSpeechObjectiveHints.defeat_shore_fringe_slimes,
    );
    expect(resolveNpcSpeechText(availableState, questGiver)).toBe(
      "I’ve got a quest for you.",
    );
    expect(resolveNpcSpeechText(readyState, questGiver)).toBe(
      "You’re back. How did it go?",
    );
  });

  it("uses canonical quest order and the first incomplete objective", () => {
    const initialState = createInitialGameState();
    const questGiver = getQuestGiver(initialState);
    const state = withQuestStatuses(initialState, {
      clear_the_shore: "active",
      outfit_the_expedition: "active",
    });
    const firstQuest = state.quests.clear_the_shore;
    const firstObjectiveId = QUEST_DEFINITIONS.clear_the_shore.objectives[0].id;
    const stateWithFirstObjectiveComplete = {
      ...state,
      quests: {
        ...state.quests,
        clear_the_shore: {
          ...firstQuest,
          objectiveProgress: {
            ...firstQuest.objectiveProgress,
            [firstObjectiveId]: {
              ...firstQuest.objectiveProgress[firstObjectiveId],
              completed: true,
            },
          },
        },
      },
    };

    expect(resolveNpcSpeechText(stateWithFirstObjectiveComplete, questGiver)).toBe(
      npcSpeechObjectiveHints.gather_shore_fringe_wood,
    );
  });

  it("uses Azure Trial state for the Class Mentor before its fallback", () => {
    const initialState = createInitialGameState();
    const mentor = createNpc(
      CLASS_MENTOR_NPC_ID,
      { x: 0, y: 0 },
      "Class Mentor",
      "class_mentor",
    );

    expect(resolveNpcSpeechText(initialState, mentor)).toBe(
      "When a Beginner is ready, I can help them choose their first class.",
    );
    expect(
      resolveNpcSpeechText(
        withQuestStatuses(initialState, { azure_trial: "available" }),
        mentor,
      ),
    ).toBe("I’ve got a quest for you.");
  });

  it("has an authored hint for every current quest objective", () => {
    const objectiveIds = Object.values(QUEST_DEFINITIONS).flatMap((quest) =>
      quest.objectives.map((objective) => objective.id),
    );

    expect(Object.keys(npcSpeechObjectiveHints).sort()).toEqual(
      [...objectiveIds].sort(),
    );
  });

  it("falls back safely for an unknown future objective", () => {
    expect(getNpcSpeechObjectiveHint("future_step", "Future Quest")).toBe(
      "Keep working on Future Quest.",
    );
  });

  it("creates a five-second speech record and fades only at the end", () => {
    const state = createInitialGameState();
    const merchant = createNpc(
      "merchant",
      { x: 0, y: 0 },
      "Merchant",
      "merchant",
    );
    const speech = createNpcSpeech(state, merchant, 1_000);

    expect(speech).toMatchObject({
      createdAt: 1_000,
      expiresAt: 1_000 + NPC_SPEECH_DURATION_MS,
      mapId: state.currentMapId,
      npcId: merchant.id,
    });
    expect(getNpcSpeechOpacity(speech!, 5_499)).toBe(1);
    expect(getNpcSpeechOpacity(speech!, 5_750)).toBe(0.5);
    expect(getNpcSpeechOpacity(speech!, 6_000)).toBe(0);
  });
});
