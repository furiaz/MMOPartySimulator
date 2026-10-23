import { afterEach, describe, expect, it, vi } from "vitest";
import { createCompanion, createEnemy, createResource } from "./entities";
import { updateGatherSystem } from "./gatherSystem";
import { ENEMY_TYPES } from "./enemyArchetypes";
import { createTierTwoBoardContract, FIRST_CLASS_BOARD_BOOKS, getBoardZoneMonsterTypes, getBoardZoneTuning, selectBoardDestination, TIER_TWO_BOARD_MAP_IDS } from "./guildNoticeBoardContracts";
import { cancelGuildNoticeBoardQuest, createInitialGuildNoticeBoardState, getGuildNoticeBoardPouchEntries, getGuildNoticeBoardRewardPreview, getGuildNoticeBoardState, openGuildNoticeBoard, recordEnemyDefeatedForGuildNoticeBoard, recordEnemyDefeatsForGuildNoticeBoard, recordResourceGatheredForGuildNoticeBoard, refreshGuildNoticeBoardState, rerollGuildNoticeBoard, restoreGuildNoticeBoard, sanitizeGuildNoticeBoardState, takeGuildNoticeBoardQuest } from "./guildNoticeBoard";
import { getCharacterXpToNextLevel, getSameLevelEnemyXp, MAX_CHARACTER_LEVEL } from "./leveling";
import { createInitialGuildUpgradesState } from "./guildRecruitUpgrades";
import { createSavedGame, restoreGameStateFromSave } from "./saveGame";
import { recordResourceGatheredForQuests } from "./questProgressionHooks";
import { createTestGameState } from "./testState";
import type { GameState } from "./state";
import type { Companion, DebugMapId, Enemy, GuildNoticeBoardQuest, GuildNoticeBoardQuestCategory } from "./types";
import { getQuestEntityIndicators } from "../questEntityIndicators";
import { getItemDefinition } from "./items";

const NOW = 1_000_000;
afterEach(() => vi.restoreAllMocks());
function rolls(...values: number[]) { let i = 0; return () => values[i++] ?? 0; }
function party(levels = [15], maps: DebugMapId[] = [...TIER_TWO_BOARD_MAP_IDS]) {
  const members = levels.map((level, i) => ({ ...createCompanion(`member-${i}`, { x: 10 + i, y: 10 }, `Member ${i}`, "fighter", i), characterLevel: level }));
  return createTestGameState({ currentMapId: "map-4", entities: Object.fromEntries(members.map(member => [member.id, member])), partyLeaderId: members[0]?.id ?? "missing", worldDiscovery: { visitedMapIds: maps, visitedSubzonesByMapId: {} } });
}
function contract(category: GuildNoticeBoardQuestCategory, map: typeof TIER_TWO_BOARD_MAP_IDS[number] = "map-4", sequence = 1) {
  return createTierTwoBoardContract(sequence, NOW, undefined, () => 0, map, category)!;
}
function withContracts(quests: GuildNoticeBoardQuest[], state = party()): GameState {
  return { ...state, guildNoticeBoard: { ...createInitialGuildNoticeBoardState(NOW, undefined, () => 0), questSequence: Math.max(0, ...quests.map(quest => quest.sequence)), starterContractAccepted: true, slots: quests } };
}
function taken(quest: GuildNoticeBoardQuest): GuildNoticeBoardQuest { return { ...quest, status: "taken", takenAtMs: NOW }; }
function done(quest: GuildNoticeBoardQuest): GuildNoticeBoardQuest { return { ...taken(quest), status: "done", objectives: quest.objectives.map(objective => ({ ...objective, currentCount: objective.requiredCount })) }; }
function dead(type: Enemy["enemyTypeId"] = "ash_wisp", extra: Partial<Enemy> = {}): Enemy {
  return { ...createEnemy("dead", { x: 10, y: 10 }, "aggressive", { enemyTypeId: type }), state: "dead", health: 0, ...extra };
}
function progress(state: GameState, slot = 0) { return state.guildNoticeBoard!.slots[slot]!.objectives[0].currentCount; }

describe("Tier 2 Board generation", () => {
  it("does not invent an eligible zone; the fixed starter is the pre-visit exception", () => {
    expect(selectBoardDestination(party([15], ["hub", "map-1", "map-2", "map-3", "slimeward-floor-1"]))).toBeUndefined();
    expect(createTierTwoBoardContract(1, NOW, party([15], []))).toBeNull();
    const initial = createInitialGuildNoticeBoardState(NOW, party([15], []), () => 0);
    expect(initial.slots[0]).toMatchObject({ schemaVersion: 2, targetMapId: "map-4", isStarterContract: true, objectives: [{ type: "zone_kills", requiredCount: 50 }], rewards: { crowns: 150, characterXp: 575 } });
    const accepted = takeGuildNoticeBoardQuest({ ...party([10], []), guildNoticeBoard: initial }, NOW);
    expect(accepted.ok).toBe(true);
    expect(cancelGuildNoticeBoardQuest(accepted.state, NOW).state.guildNoticeBoard!.starterContractAccepted).toBe(true);
  });
  it("uses the exact 80/20 boundary and uniform destination selection", () => {
    const state = party([9]); // Z4 is preferred; Z5–7 are not.
    expect(selectBoardDestination(state, rolls(0.799999, 0))).toBe("map-4");
    expect(selectBoardDestination(state, rolls(0.8, 0))).toBe("map-5");
    expect(selectBoardDestination(state, rolls(0.8, 0.5))).toBe("map-6");
    expect(selectBoardDestination(state, rolls(0.8, 0.999))).toBe("map-7");
  });
  it("falls back entirely to either nonempty group and never uses unvisited maps", () => {
    expect(selectBoardDestination(party([200], ["map-5"]), () => 0)).toBe("map-5");
    expect(selectBoardDestination(party([11], ["map-4"]), () => 0.99)).toBe("map-4");
  });
  it("includes dead active companions but excludes Inn and Field Team rosters", () => {
    const state = party([30, 2], ["map-4", "map-7"]);
    state.entities["member-1"] = { ...state.entities["member-1"] as Companion, state: "dead", health: 0 };
    state.restingCompanionsById = { reserve: { ...createCompanion("reserve", { x: 1, y: 1 }, "Reserve", "none", 0), characterLevel: 200 } };
    // Mean 16 puts both visited zones within range. Uniform second choice selects Z7.
    expect(selectBoardDestination(state, rolls(0.99))).toBe("map-7");
    const recruited = party([30, 2, 1], ["map-4", "map-7"]);
    expect(selectBoardDestination(recruited, rolls(0.79, 0))).toBe("map-4");
  });
  it("treats ±5 as inclusive", () => {
    const state = party([16], ["map-4", "map-7"]); // Z4 mean 11: exact lower boundary.
    expect(selectBoardDestination(state, rolls(0))).toBe("map-4");
    const above = party([16.00001], ["map-4", "map-7"]);
    expect(selectBoardDestination(above, rolls(0.79, 0))).toBe("map-7");
    const mean7 = getBoardZoneMonsterTypes("map-7").reduce((sum, id) => sum + ENEMY_TYPES[id].level, 0) / 3;
    expect(selectBoardDestination(party([mean7 - 5], ["map-4", "map-7"]), rolls(0.79, 0.99))).toBe("map-7");
  });
  it.each(TIER_TWO_BOARD_MAP_IDS)("derives ordinary spawn types and exact tuning for %s", map => {
    const types = getBoardZoneMonsterTypes(map);
    expect(types).toHaveLength(3);
    expect(types).not.toContain("orc_warmaster");
    const offset = TIER_TWO_BOARD_MAP_IDS.indexOf(map);
    expect(getBoardZoneTuning(map)).toEqual({ kills: 50 + 20 * offset, rummage: 30 + 12 * offset, forage: 10 + 5 * offset, crowns: 150 + 50 * offset });
    for (const category of ["assault", "extermination", "rummage", "forage"] as const) {
      const quest = contract(category, map);
      const n = getBoardZoneTuning(map);
      expect(quest.objectives[0].requiredCount).toBe(category === "rummage" ? n.rummage : category === "forage" ? n.forage : n.kills);
      const xpSum = types.reduce((sum, id) => sum + getSameLevelEnemyXp(ENEMY_TYPES[id].level), 0);
      const xp = category === "extermination" ? 0.5 * n.kills * getSameLevelEnemyXp(ENEMY_TYPES[types[0]].level) : (category === "rummage" ? n.rummage : 0.5 * n.kills) * xpSum / types.length;
      expect(quest.rewards.characterXp).toBe(Math.floor(xp));
    }
  });
  it.each([[0, "assault"], [0.25, "extermination"], [0.5, "rummage"], [0.75, "forage"]] as const)("roll %s selects %s", (roll, category) => {
    const quest = createTierTwoBoardContract(1, NOW, party([11], ["map-4"]), rolls(0, roll))!;
    expect(quest.category).toBe(category);
    expect(quest.title).toMatch({ assault: /^Assault on /, extermination: / Extermination in /, rummage: /^Rummage of /, forage: /^Forage in / }[category]);
  });
  it("selects Extermination types uniformly and allows duplicate postings", () => {
    const ids = getBoardZoneMonsterTypes("map-7");
    for (let i = 0; i < 3; i++) {
      const quest = createTierTwoBoardContract(1, NOW, undefined, rolls(i / 3), "map-7", "extermination")!;
      expect(quest.objectives[0]).toMatchObject({ enemyTypeId: ids[i] });
    }
    const state = party([15], ["map-4"]);
    state.guildUpgrades = createInitialGuildUpgradesState();
    state.guildUpgrades.noticeBoard.notice_board_slots = 3;
    const board = createInitialGuildNoticeBoardState(NOW, state, () => 0);
    expect(board.slots[1]?.title).toBe(board.slots[2]?.title);
  });
});

describe("Board progression and quest pouch", () => {
  it("requires acceptance, map and an eligible Standard target; gives Superior combat credit", () => {
    const quest = contract("assault");
    expect(progress(recordEnemyDefeatedForGuildNoticeBoard(withContracts([quest]), dead()))).toBe(0);
    let state = withContracts([taken(quest), taken(contract("extermination"))]);
    for (const enemy of [dead("orc_warmaster", { encounterBand: "boss" }), dead("ash_wisp", { encounterBand: "elite" }), dead("ash_wisp", { encounterBand: "champion" }), dead("ash_wisp", { isTargetDummy: true }), dead("wolf")]) {
      expect(recordEnemyDefeatedForGuildNoticeBoard(state, enemy)).toBe(state);
    }
    expect(recordEnemyDefeatedForGuildNoticeBoard(state, dead(), "map-5")).toBe(state);
    state = recordEnemyDefeatedForGuildNoticeBoard(state, dead("goblin_shaman", { variant: "superior" }));
    expect(progress(state)).toBe(2);
    expect(progress(state, 1)).toBe(2);
  });
  it("progresses all matching contracts, including ordinary reinforcements, and caps counters", () => {
    const quest = taken(contract("assault", "map-7"));
    let state = withContracts([quest, { ...quest, id: "other" }]);
    const orc = dead("orc", { barrackSpawn: { barrackId: "map-7-route-barrack", sequence: 1 } });
    state = recordEnemyDefeatedForGuildNoticeBoard(state, orc, "map-7");
    expect([progress(state), progress(state, 1)]).toEqual([1, 1]);
    for (let i = 0; i < 60; i++) state = recordEnemyDefeatedForGuildNoticeBoard(state, dead("orc", { variant: "superior" }), "map-7");
    expect(progress(state)).toBe(110);
    expect(state.guildNoticeBoard!.slots[0]!.status).toBe("done");
  });
  it("uses independent exact 50% Rummage rolls with no pity and one roll per Superior", () => {
    const quests = [taken(contract("rummage")), taken(contract("rummage", "map-4", 2))];
    let state = withContracts(quests);
    state = recordEnemyDefeatedForGuildNoticeBoard(state, dead("ash_wisp", { variant: "superior" }), "map-4", rolls(0.499999, 0.5), NOW);
    expect([progress(state), progress(state, 1)]).toEqual([1, 0]);
    for (let i = 0; i < 100; i++) state = recordEnemyDefeatedForGuildNoticeBoard(state, dead(), "map-4", () => 0.99, NOW);
    expect([progress(state), progress(state, 1)]).toEqual([1, 0]);
    expect(state.dropVisualEvents?.[0]).toMatchObject({ kind: "quest_item", boardContractId: quests[0].id, displayName: "Recovered Supplies — Ash Goblin Encampment" });
    expect(state.dropVisualEvents?.[0].questId).toBeUndefined();
    expect(getGuildNoticeBoardPouchEntries(state.guildNoticeBoard)).toHaveLength(1);
    expect(state.inventory.slots).toHaveLength(0);
    expect(getGuildNoticeBoardPouchEntries(cancelGuildNoticeBoardQuest(state, NOW, 0).state.guildNoticeBoard)).toHaveLength(0);
    const completed = withContracts([done(contract("rummage"))]);
    expect(getGuildNoticeBoardPouchEntries(openGuildNoticeBoard(completed, NOW).state.guildNoticeBoard)).toHaveLength(0);
  });
  it("deduplicates a corpse without suppressing later deaths of the same respawned ID", () => {
    let state = withContracts([taken(contract("rummage")), taken(contract("assault"))]);
    const corpse = dead();
    state.entities[corpse.id] = corpse;
    const random = vi.fn(() => 0);
    state = recordEnemyDefeatedForGuildNoticeBoard(state, corpse, "map-4", random, NOW);
    expect([progress(state), progress(state, 1)]).toEqual([1, 1]);
    expect(recordEnemyDefeatedForGuildNoticeBoard(state, corpse, "map-4", random, NOW + 1)).toBe(state);
    expect(random).toHaveBeenCalledTimes(1);
    // Respawn replaces the old record; its subsequent corpse carries no marker.
    state = { ...state, entities: { ...state.entities, [corpse.id]: dead() } };
    state = recordEnemyDefeatedForGuildNoticeBoard(state, dead(), "map-4", random, NOW + 30_000);
    expect([progress(state), progress(state, 1)]).toEqual([2, 2]);
  });
  it("counts only mapped successful resource quantities, mixing wood/ore/herbs", () => {
    let state = withContracts([taken(contract("forage"))]);
    expect(recordResourceGatheredForGuildNoticeBoard(state, "map-5", "wood", 3)).toBe(state);
    expect(recordResourceGatheredForGuildNoticeBoard(state, "map-4", "wood", 0)).toBe(state);
    state = recordResourceGatheredForQuests(state, "wood", "map-4", 2);
    state = recordResourceGatheredForQuests(state, "ore", "map-4", 3);
    state = recordResourceGatheredForQuests(state, "herb", "map-4", 20);
    expect(progress(state)).toBe(10);
    expect(state.guildNoticeBoard!.slots[0]!.status).toBe("done");
  });
  it("does not count resource depletion with full inventory and counts only successfully added units", () => {
    const resource = createResource("wood", { x: 10, y: 10 }, { durability: 1, quantity: 3, resourceType: "wood" });
    const collector = { ...createCompanion("collector", { x: 9, y: 10 }, "Collector", "fighter", 0), state: "gather" as const, currentTargetId: resource.id, commandPriority: "direct" as const, lastGatherAt: 0 };
    const state = withContracts([taken(contract("forage"))]);
    state.entities = { collector, wood: resource };
    state.partyLeaderId = collector.id;
    state.inventory = { capacity: 0, slots: [] };
    expect(progress(updateGatherSystem(state, new Set(), 1000))).toBe(0);
    const space = { ...state, inventory: { capacity: 1, slots: [] } };
    expect(progress(updateGatherSystem(space, new Set(), 1000))).toBeGreaterThan(0);
  });
  it("keeps Field Team kills map-scoped and one-credit; never simulates Rummage or Forage", () => {
    const state = withContracts([taken(contract("assault")), taken(contract("extermination")), taken(contract("rummage")), taken(contract("forage"))]);
    const kills = [{ enemyTypeId: "goblin_shaman" as const, quantity: 3 }];
    expect(recordEnemyDefeatsForGuildNoticeBoard(state, kills, "map-5")).toBe(state);
    const next = recordEnemyDefeatsForGuildNoticeBoard(state, kills, "map-4");
    expect([0, 1, 2, 3].map(i => progress(next, i))).toEqual([3, 3, 0, 0]);
  });
  it("shows map-scoped enemy targets for combat/Rummage and resource targets for Forage", () => {
    const state = withContracts([taken(contract("rummage"))]);
    state.entities = { wisp: { ...dead(), id: "wisp", health: 1, state: "idle" }, boss: { ...dead("orc_warmaster", { encounterBand: "boss" }), id: "boss", health: 1, state: "idle" } };
    expect(getQuestEntityIndicators(state).filter(i => i.source === "notice_board").map(i => i.entityId)).toEqual(["wisp"]);
    state.currentMapId = "map-5";
    expect(getQuestEntityIndicators(state).filter(i => i.source === "notice_board")).toHaveLength(0);
  });
});

describe("Stored Board rewards and atomic claims", () => {
  it("rolls two books and a third independently across all first classes, never Beginner", () => {
    expect(FIRST_CLASS_BOARD_BOOKS).toHaveLength(80);
    const quest = createTierTwoBoardContract(1, NOW, undefined, rolls(0, 0.5, 0.99, 0.15), "map-4", "assault")!;
    expect(quest.rewards.skillBookItemIds).toEqual([FIRST_CLASS_BOARD_BOOKS[0], FIRST_CLASS_BOARD_BOOKS[40]]);
    expect(quest.rewards.bonusSkillBookItemId).toBe(FIRST_CLASS_BOARD_BOOKS[79]);
    expect(getGuildNoticeBoardRewardPreview(quest, 100)).toMatchObject({ crowns: 150, characterXp: 575, skillBookItemIds: quest.rewards.skillBookItemIds });
    expect(getGuildNoticeBoardRewardPreview(quest, 110).skillBookItemIds).toHaveLength(2);
    expect(getGuildNoticeBoardRewardPreview(quest, 120)).toMatchObject({ crowns: 180, characterXp: 575, skillBookItemIds: [...quest.rewards.skillBookItemIds!, FIRST_CLASS_BOARD_BOOKS[79]] });
  });
  it.each([100, 110, 120])("uses a strict bonus boundary at quality %s", percent => {
    const quest = contract("assault");
    quest.rewards.bonusBookRoll = (percent - 100) / 100;
    expect(getGuildNoticeBoardRewardPreview(quest, percent).skillBookItemIds).toHaveLength(2);
    if (percent > 100) {
      quest.rewards.bonusBookRoll -= 0.00001;
      expect(getGuildNoticeBoardRewardPreview(quest, percent).skillBookItemIds).toHaveLength(3);
    }
  });
  it("grants nothing when all books cannot fit, preserves the done contract, and retries exactly once", () => {
    const quest = done(createTierTwoBoardContract(1, NOW, undefined, rolls(0, 0.5, 0.99, 0), "map-4", "assault")!);
    let state = withContracts([quest]);
    state.inventory = { capacity: 1, slots: [] };
    const book = quest.rewards.skillBookItemId;
    state.inventory = { capacity: 1, slots: [{ itemId: book, quantity: getItemDefinition(book).maxStack - 1 }] };
    const blocked = openGuildNoticeBoard(state, NOW);
    expect(blocked.claimedRewards).toHaveLength(0);
    expect(blocked.state.inventory).toEqual(state.inventory);
    state.inventory = { capacity: 1, slots: [] };
    const failed = openGuildNoticeBoard(state, NOW);
    expect(failed.failedClaims).toEqual([quest.title]);
    expect(failed.claimedRewards).toHaveLength(0);
    expect(failed.state.inventory).toEqual(state.inventory);
    expect(failed.state.wallet).toEqual(state.wallet);
    expect(failed.state.entities).toEqual(state.entities);
    expect(failed.state.guildNoticeBoard!.slots[0]!.rewardClaimedAtMs).toBeNull();
    state = { ...failed.state, inventory: { capacity: 3, slots: [] } };
    const claimed = openGuildNoticeBoard(state, NOW + 1);
    expect(claimed.claimedRewards).toHaveLength(1);
    expect(claimed.state.inventory.slots).toHaveLength(2);
    expect(openGuildNoticeBoard(claimed.state, NOW + 2).claimedRewards).toHaveLength(0);
  });
  it("preflights duplicate stack overflow and includes the independently rolled bonus", () => {
    const quest = done(contract("assault"));
    const state = withContracts([quest]);
    state.guildUpgrades = createInitialGuildUpgradesState();
    state.guildUpgrades.noticeBoard.notice_board_reward_quality = 3;
    state.inventory = { capacity: 0, slots: [] };
    expect(openGuildNoticeBoard(state, NOW).claimedRewards).toHaveLength(0);
    state.inventory = { capacity: 1, slots: [] };
    const result = openGuildNoticeBoard(state, NOW);
    expect(result.claimedRewards[0].skillBookItemIds).toHaveLength(3);
    expect(result.state.inventory.slots[0].quantity).toBe(3);
  });
  it("awards XP only to living active members, honoring max level and debug multiplier", () => {
    const state = withContracts([done(contract("assault"))], party([10, 10, MAX_CHARACTER_LEVEL]));
    state.entities["member-1"] = { ...state.entities["member-1"] as Companion, state: "dead", health: 0 };
    const next = openGuildNoticeBoard(state, NOW).state;
    expect(next.entities["member-0"]).toMatchObject({ characterXp: 575 });
    expect(next.entities["member-1"]).toMatchObject({ characterXp: 0 });
    expect(next.entities["member-2"]).toMatchObject({ characterXp: 0, characterLevel: MAX_CHARACTER_LEVEL });
    const debug = { ...state, debugOptions: { superSpeedEnabled: false, superExpEnabled: true } };
    const debugNext = openGuildNoticeBoard(debug, NOW).state;
    expect(debugNext.entities["member-0"]).toMatchObject({ characterLevel: 11, characterXp: 775 });
    expect(getCharacterXpToNextLevel(10)).toBeGreaterThan(575);
  });
});

describe("Pure reads, refresh and compatibility", () => {
  it("reads/opening do not refresh overdue postings or reroll saved results", () => {
    const state = withContracts([contract("assault")]);
    state.guildNoticeBoard!.nextRefreshAtMs = NOW - 1;
    const random = vi.spyOn(Math, "random").mockImplementation(() => { throw new Error("read invoked RNG"); });
    expect(getGuildNoticeBoardState(state, NOW)).toBe(state.guildNoticeBoard);
    expect(openGuildNoticeBoard(state, NOW).state.guildNoticeBoard!.slots).toEqual(state.guildNoticeBoard!.slots);
    expect(sanitizeGuildNoticeBoardState(state.guildNoticeBoard, NOW)).toEqual(state.guildNoticeBoard);
    expect(random).not.toHaveBeenCalled();
  });
  it("clock refresh snapshots new state once, preserves taken/done and has no catch-up bursts", () => {
    let state = withContracts([taken(contract("assault")), done(contract("rummage")), contract("forage")]);
    state.guildNoticeBoard!.nextRefreshAtMs = NOW;
    state.worldDiscovery!.visitedMapIds = ["map-7"];
    state = refreshGuildNoticeBoardState(state, NOW + 100_000_000, () => 0);
    expect(state.guildNoticeBoard!.slots[0]!.category).toBe("assault");
    expect(state.guildNoticeBoard!.slots[1]!.category).toBe("rummage");
    expect(state.guildNoticeBoard!.slots[2]!.targetMapId).toBe("map-7");
    expect(state.guildNoticeBoard!.questSequence).toBe(2);
    expect(refreshGuildNoticeBoardState(state, NOW + 100_000_000)).toBe(state);
  });
  it("does not consume rerolls when there is no possible change and protects failed claims", () => {
    const state = withContracts([done(contract("rummage"))], party([15], []));
    state.inventory = { capacity: 0, slots: [] };
    state.guildUpgrades = createInitialGuildUpgradesState();
    state.guildUpgrades.noticeBoard.notice_board_scouts = 1;
    const result = rerollGuildNoticeBoard(state, NOW);
    expect(result).toMatchObject({ ok: false, reason: "no_change" });
    expect(result.state.guildNoticeBoard!.slots[0]).toEqual(state.guildNoticeBoard!.slots[0]);
    expect(result.state.guildNoticeBoard!.rerollsUsedToday).toBe(0);
  });
  it("preserves legacy taken/done rewards and migrates an untaken starter once", () => {
    const modern = contract("assault");
    const legacy: GuildNoticeBoardQuest = { ...modern, schemaVersion: undefined, targetMapId: undefined, rewards: { crowns: 100, skillBookItemId: "throw_rock_skill_book" }, objectives: [{ id: "old", enemyTypeId: "ash_wisp", requiredCount: 73, currentCount: 12 }] };
    const state = withContracts([taken(legacy), done({ ...legacy, id: "done" })]);
    const restored = restoreGuildNoticeBoard(state, NOW, () => 0);
    expect(restored.guildNoticeBoard!.slots[0]!.objectives).toEqual(legacy.objectives);
    expect(restored.guildNoticeBoard!.slots[0]!.rewards).toEqual(legacy.rewards);
    expect(getGuildNoticeBoardRewardPreview(restored.guildNoticeBoard!.slots[1]!, 100)).toMatchObject({ characterXp: 0, skillBookItemIds: ["throw_rock_skill_book"] });
    const oldStarter = { ...legacy, id: createInitialGuildNoticeBoardState(NOW).slots[0]!.id, isStarterContract: true as const };
    const migrated = restoreGuildNoticeBoard(withContracts([oldStarter]), NOW, () => 0.7);
    expect(migrated.guildNoticeBoard!.slots[0]).toMatchObject({ id: oldStarter.id, schemaVersion: 2, objectives: [{ requiredCount: 50, currentCount: 0 }] });
    expect(restoreGuildNoticeBoard(migrated, NOW, () => 0.1).guildNoticeBoard!.slots).toEqual(migrated.guildNoticeBoard!.slots);
  });
  it("keeps available legacy ordinary postings until an actual refresh", () => {
    const old = { ...contract("extermination"), schemaVersion: undefined, targetMapId: undefined, rewards: { crowns: 100, skillBookItemId: "throw_rock_skill_book" as const } };
    const state = withContracts([old]);
    expect(restoreGuildNoticeBoard(state, NOW).guildNoticeBoard!.slots[0]!.schemaVersion).toBeUndefined();
    state.guildNoticeBoard!.nextRefreshAtMs = NOW;
    expect(restoreGuildNoticeBoard(state, NOW, () => 0).guildNoticeBoard!.slots[0]!.schemaVersion).toBe(2);
  });
  it("rejects malformed new postings and clamps counters without inventing rewards", () => {
    const quest = taken(contract("assault"));
    const invalid = [
      { ...quest, rewards: { ...quest.rewards, bonusBookRoll: NaN } },
      { ...quest, targetMapId: "map-1" },
      { ...quest, objectives: [{ ...quest.objectives[0], eligibleEnemyTypeIds: ["orc_warmaster"] }] },
      { ...quest, rewards: { ...quest.rewards, skillBookItemIds: ["throw_rock_skill_book", "throw_rock_skill_book"] } },
      { ...quest, objectives: [{ ...quest.objectives[0], requiredCount: 0.5 }] },
      { ...quest, id: "" },
    ] as GuildNoticeBoardQuest[];
    const state = withContracts(invalid);
    expect(sanitizeGuildNoticeBoardState(state.guildNoticeBoard, NOW).slots).toEqual(invalid.map(() => null));
    const capped = { ...quest, objectives: [{ ...quest.objectives[0], currentCount: Infinity }] };
    expect(sanitizeGuildNoticeBoardState(withContracts([capped]).guildNoticeBoard, NOW).slots[0]!.objectives[0].currentCount).toBe(0);
  });
  it("persists targets, pouch progress and independent reward rolls through real save restoration", () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    const state = withContracts([taken(contract("rummage"))]);
    const progressed = recordEnemyDefeatedForGuildNoticeBoard(state, dead(), "map-4", () => 0, NOW);
    const saved = createSavedGame(progressed, NOW);
    const restored = restoreGameStateFromSave(saved);
    expect(restored.ok).toBe(true);
    if (restored.ok) expect(restored.state.guildNoticeBoard).toEqual(progressed.guildNoticeBoard);
  });
});
