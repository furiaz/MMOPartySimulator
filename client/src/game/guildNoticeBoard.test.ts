import { describe, expect, it } from "vitest";
import { createCompanion, createEnemy } from "./entities";
import {
  GUILD_NOTICE_BOARD_REFRESH_INTERVAL_MS,
  GUILD_NOTICE_BOARD_STARTER_QUEST_ID,
  createInitialGuildNoticeBoardState,
  getBoardObjectiveEnemyTypes,
  formatGuildNoticeBoardQuestTitle,
  cancelGuildNoticeBoardQuest,
  openGuildNoticeBoard,
  recordEnemyDefeatedForGuildNoticeBoard,
  refreshGuildNoticeBoardState,
  shouldShowGuildNoticeBoardSign,
  takeGuildNoticeBoardQuest,
} from "./guildNoticeBoard";
import { countInventoryItem } from "./inventory";
import { createTestGameState } from "./testState";
import type { GameState } from "./state";
import type { Enemy, GuildNoticeBoardQuest } from "./types";
import { getCurrencyBalance } from "./wallet";

const NOW_MS = 1_000_000;

describe("guild notice board", () => {
  it("formats reusable Assault and Extermination contract titles", () => {
    expect(
      formatGuildNoticeBoardQuestTitle("assault", "Ash Goblin Encampment"),
    ).toBe("Assault on Ash Goblin Encampment");
    expect(
      formatGuildNoticeBoardQuestTitle(
        "extermination",
        "Ash Goblin Encampment",
        "Ember Imp",
      ),
    ).toBe("Ember Imp Extermination in Ash Goblin Encampment");
  });

  it("creates one available quest in the initial board state", () => {
    const board = createInitialGuildNoticeBoardState(NOW_MS);

    expect(board.slots).toHaveLength(1);
    expect(board.slots[0]).toMatchObject({
      id: GUILD_NOTICE_BOARD_STARTER_QUEST_ID,
      title: "Assault on Ash Goblin Encampment",
      category: "assault",
      isStarterContract: true,
      status: "available",
      objectives: [
        { type: "zone_kills", eligibleEnemyTypeIds: ["goblin_shaman", "ash_wisp", "ember_imp"], requiredCount: 50, currentCount: 0 },
      ],
    });
    expect(board.starterContractAccepted).toBe(false);
    expect(board.hasSeenCurrentRefresh).toBe(false);
  });

  it("opening the board marks the current refresh seen", () => {
    const state = createNoticeBoardState();

    expect(shouldShowGuildNoticeBoardSign(state, NOW_MS)).toBe(true);

    const opened = openGuildNoticeBoard(state, NOW_MS);

    expect(opened.state.guildNoticeBoard?.hasSeenCurrentRefresh).toBe(true);
    expect(shouldShowGuildNoticeBoardSign(opened.state, NOW_MS)).toBe(false);
  });

  it("keeps the available starter contract pinned after three hours", () => {
    const state = createNoticeBoardState();
    const refreshed = refreshGuildNoticeBoardState(
      state,
      NOW_MS + GUILD_NOTICE_BOARD_REFRESH_INTERVAL_MS,
    );

    expect(refreshed.guildNoticeBoard?.slots[0]).toMatchObject({
      id: GUILD_NOTICE_BOARD_STARTER_QUEST_ID,
      status: "available",
      sequence: 0,
    });
    expect(refreshed.guildNoticeBoard?.hasSeenCurrentRefresh).toBe(false);
  });

  it("keeps a taken quest when the refresh timer expires", () => {
    const taken = takeGuildNoticeBoardQuest(createNoticeBoardState(), NOW_MS);

    expect(taken.ok).toBe(true);
    if (!taken.ok) {
      return;
    }

    const refreshed = refreshGuildNoticeBoardState(
      taken.state,
      NOW_MS + GUILD_NOTICE_BOARD_REFRESH_INTERVAL_MS,
    );

    expect(refreshed.guildNoticeBoard?.slots[0]).toMatchObject({
      id: taken.quest.id,
      status: "taken",
      sequence: taken.quest.sequence,
    });
  });

  it("cancels a taken board quest", () => {
    const taken = takeGuildNoticeBoardQuest(createNoticeBoardState(), NOW_MS);

    expect(taken.ok).toBe(true);
    if (!taken.ok) {
      return;
    }

    const canceled = cancelGuildNoticeBoardQuest(taken.state, NOW_MS);

    expect(canceled.ok).toBe(true);
    expect(canceled.state.guildNoticeBoard?.slots[0]).toBeNull();
    expect(canceled.state.guildNoticeBoard?.starterContractAccepted).toBe(true);
  });

  it("does not count kills before the quest is taken", () => {
    const state = createNoticeBoardState();
    const enemy = createDeadEnemy("ash_wisp", 10);
    const progressed = recordEnemyDefeatedForGuildNoticeBoard(state, enemy);

    expect(progressed.guildNoticeBoard?.slots[0]?.objectives[0].currentCount).toBe(0);
  });

  it("counts matching monster kills after taking the quest", () => {
    const taken = takeGuildNoticeBoardQuest(createNoticeBoardState(), NOW_MS);

    expect(taken.ok).toBe(true);
    if (!taken.ok) {
      return;
    }

    expect(taken.quest.levelAnchor).toBeNull();
    expect(taken.quest.levelRange).toBeNull();

    const progressed = recordEnemyDefeatedForGuildNoticeBoard(
      taken.state,
      createDeadEnemy("ash_wisp", 10),
    );

    expect(progressed.guildNoticeBoard?.slots[0]?.objectives[0]).toMatchObject({
      type: "zone_kills",
      currentCount: 1,
    });
  });

  it("ignores wrong monsters but counts matching monsters at any level", () => {
    const taken = takeGuildNoticeBoardQuest(createNoticeBoardState(), NOW_MS);

    expect(taken.ok).toBe(true);
    if (!taken.ok) {
      return;
    }

    let progressed = recordEnemyDefeatedForGuildNoticeBoard(
      taken.state,
      createDeadEnemy("mossling", 10),
    );
    expect(progressed.guildNoticeBoard?.slots[0]?.objectives).toEqual(
      taken.quest.objectives,
    );

    progressed = recordEnemyDefeatedForGuildNoticeBoard(
      progressed,
      createDeadEnemy("ash_wisp", 99),
    );

    expect(progressed.guildNoticeBoard?.slots[0]?.objectives[0]).toMatchObject({
      type: "zone_kills",
      currentCount: 1,
    });
  });

  it("grants two direct kill credits for a Superior enemy", () => {
    const taken = takeGuildNoticeBoardQuest(createNoticeBoardState(), NOW_MS);

    expect(taken.ok).toBe(true);
    if (!taken.ok) {
      return;
    }

    const progressed = recordEnemyDefeatedForGuildNoticeBoard(
      taken.state,
      {
        ...createDeadEnemy("ash_wisp", 11),
        variant: "superior",
      },
    );

    expect(progressed.guildNoticeBoard?.slots[0]?.objectives[0].currentCount)
      .toBe(2);
  });

  it("marks the quest done and claims rewards on board interaction", () => {
    const almostDone = createAlmostDoneQuestState();
    const completed = finishAlmostDoneQuest(almostDone);
    const completedQuest = completed.guildNoticeBoard?.slots[0];

    expect(completedQuest?.status).toBe("done");
    expect(completedQuest?.rewardClaimedAtMs).toBeNull();

    const opened = openGuildNoticeBoard(completed, NOW_MS);
    const reward = completedQuest?.rewards;

    expect(opened.claimedRewards).toHaveLength(1);
    expect(getCurrencyBalance(opened.state.wallet, "crowns")).toBe(150);
    expect(
      reward ? countInventoryItem(opened.state.inventory, reward.skillBookItemId) : 0,
    ).toBe(reward?.skillBookItemIds?.filter(id => id === reward.skillBookItemId).length);
    expect(opened.claimedRewards[0]?.skillBookItemIds).toEqual(reward?.skillBookItemIds);
    expect(opened.state.guildNoticeBoard?.slots[0]?.rewardClaimedAtMs).toBe(NOW_MS);
  });

  it("refreshes a claimed done quest into a different quest", () => {
    const almostDone = createAlmostDoneQuestState();
    const completed = finishAlmostDoneQuest(almostDone);
    const opened = openGuildNoticeBoard(completed, NOW_MS);
    const refreshed = refreshGuildNoticeBoardState(
      opened.state,
      NOW_MS + GUILD_NOTICE_BOARD_REFRESH_INTERVAL_MS,
    );

    expect(refreshed.guildNoticeBoard?.slots[0]).toMatchObject({
      status: "available",
    });
    expect(refreshed.guildNoticeBoard?.slots[0]?.isStarterContract).not.toBe(true);
    expect(refreshed.guildNoticeBoard?.slots[0]?.id).not.toBe(
      GUILD_NOTICE_BOARD_STARTER_QUEST_ID,
    );
  });
});

function createNoticeBoardState(): GameState {
  const leader = {
    ...createCompanion("leader", { x: 10, y: 10 }, "leader", "defender", 0),
    characterLevel: 10,
  };

  return createTestGameState({
    currentMapId: "map-4",
    worldDiscovery: { visitedMapIds: ["map-4"], visitedSubzonesByMapId: {} },
    entities: {
      [leader.id]: leader,
    },
    partyLeaderId: leader.id,
    guildNoticeBoard: createInitialGuildNoticeBoardState(NOW_MS),
  });
}

function finishAlmostDoneQuest(state: GameState): GameState {
  return state.guildNoticeBoard!.slots[0]!.objectives.reduce(
    (nextState, objective) =>
      recordEnemyDefeatedForGuildNoticeBoard(
        nextState,
        createDeadEnemy(getBoardObjectiveEnemyTypes(objective)[0], 11),
      ),
    state,
  );
}

function createAlmostDoneQuestState(): GameState {
  const taken = takeGuildNoticeBoardQuest(createNoticeBoardState(), NOW_MS);

  if (!taken.ok) {
    throw new Error("Expected Notice Board quest to be takeable");
  }

  return {
    ...taken.state,
    guildNoticeBoard: {
      ...taken.state.guildNoticeBoard!,
      slots: [createAlmostDoneQuest(taken.quest)],
    },
  };
}

function createAlmostDoneQuest(
  quest: GuildNoticeBoardQuest,
): GuildNoticeBoardQuest {
  return {
    ...quest,
    objectives: quest.objectives.map((objective) => ({
      ...objective,
      currentCount: objective.requiredCount - 1,
    })),
  };
}

function createDeadEnemy(enemyTypeId: Enemy["enemyTypeId"], level: number): Enemy {
  return {
    ...createEnemy("defeated-enemy", { x: 20, y: 20 }, "passive", {
      enemyTypeId,
      level,
    }),
    state: "dead",
    health: 0,
  };
}
