import { afterEach, describe, expect, it, vi } from "vitest";
import { createDebugMap, HUB_TWO_MAP_ID, HUB_TWO_QUEST_GIVER_NPC_ID } from "./debugMap";
import { resolveBasicAttackImpact } from "./combatBasicAttackResolution";
import { createCompanion, createEnemy, createNpc, createResource, damageEntity } from "./entities";
import { isEncounterQuestMilestoneComplete } from "./encounterQuestMilestones";
import { ORC_WARCAMP_CHEST_POSITION, ORC_WARCAMP_ENCOUNTER_ID } from "./orcWarcampLayout";
import { selectPoiTarget } from "./poiTargetSelection";
import { updatePoiSystem } from "./poiSystem";
import { recordEnemyDefeatedForQuests, reconcileStateDerivedQuestObjectivesForQuests } from "./questProgressionHooks";
import { acceptQuestFromQuestGiver, completeQuestObjective, createInitialQuestStates, finishReadyQuestForQuestGiver,
  getQuestGuidanceObjectives, getQuestTargetMapId, QUEST_DEFINITIONS, QUEST_ORDER, reconcileQuestAvailability, WARCAMP_MAIN_QUEST_ID } from "./questSystem";
import { sanitizeGameStateForSave, createSavedGame, restoreGameStateFromSave } from "./saveGame";
import { addEntity, updateEntity, type GameState } from "./state";
import { createTestGameState } from "./testState";
import { updateGame } from "./updateGame";
import { claimWarmasterChest, sanitizeWarmasterLifecycle, updateWarmasterLifecycle } from "./warmasterLifecycle";
import { createWarmasterLifecycle, rollWarmasterChest, WARMASTER_CHEST_ID } from "./warmasterLifecycleState";
import type { Enemy, EnemyTypeId, Companion } from "./types";
import type { QuestEncounterMilestone, QuestStatus } from "./questTypes";

const id = WARCAMP_MAIN_QUEST_ID;
const milestone = (kind: QuestEncounterMilestone["kind"]): QuestEncounterMilestone => ({ encounterId: ORC_WARCAMP_ENCOUNTER_ID, kind });
function setup(status: QuestStatus = "active"): GameState {
  const quests = createInitialQuestStates();
  quests.the_patrons_shadow.status = "completed";
  quests[id].status = status;
  const leader = createCompanion("leader", { x: 95, y: 44 }, "leader");
  const boss = createEnemy("boss", { x: 95, y: 32 }, "aggressive", { enemyTypeId: "orc_warmaster", subzoneId: "orc-warcamp" });
  return createTestGameState({ currentMapId: "map-7", map: createDebugMap("map-7"), partyLeaderId: leader.id,
    entities: { leader, boss }, quests, warmasterLifecycle: createWarmasterLifecycle() });
}
function progress(state: GameState, objectiveId: string) { return state.quests[id].objectiveProgress[objectiveId]; }
function win(state = setup()) {
  const boss = state.entities.boss as Enemy;
  return reconcileStateDerivedQuestObjectivesForQuests(updateWarmasterLifecycle(updateEntity(state, damageEntity(boss, boss.maxHealth), 1000), 1000));
}
function hub(state: GameState): GameState {
  const giver = createNpc(HUB_TWO_QUEST_GIVER_NPC_ID, { x: 10, y: 10 }, "Quest Giver", "quest_giver");
  return { ...state, currentMapId: HUB_TWO_MAP_ID, map: createDebugMap(HUB_TWO_MAP_ID), entities: { ...state.entities, [giver.id]: giver } };
}
function claim(state: GameState): GameState {
  return claimWarmasterChest({ ...state, entities: { ...state.entities, leader: { ...state.entities.leader, position: ORC_WARCAMP_CHEST_POSITION } } });
}
function deadOrc(type: EnemyTypeId = "orc", variant?: "superior"): Enemy {
  return { ...createEnemy(`kill-${type}`, { x: 20, y: 20 }, "aggressive", { enemyTypeId: type, subzoneId: "orc-warcamp", variant }), health: 0, state: "dead" };
}
afterEach(() => vi.restoreAllMocks());

describe("The Evil Patron's Chosen", () => {
  it("authors one non-repeatable Hub 2 quest with ordered guidance and parallel objectives", () => {
    expect(QUEST_ORDER.at(-1)).toBe(id);
    expect(QUEST_DEFINITIONS.the_patrons_shadow.unlocksQuestIds).toContain(id);
    expect(QUEST_DEFINITIONS[id]).toMatchObject({ displayName: "The Evil Patron's Chosen", objectiveFlow: "parallel",
      objectiveGuidance: "first_incomplete", questGiverMapId: HUB_TWO_MAP_ID, questGiverPoiId: HUB_TWO_QUEST_GIVER_NPC_ID,
      requiresCompletedQuestIds: ["the_patrons_shadow"], rewards: { characterXp: 6000, crowns: 1500 } });
    expect(QUEST_DEFINITIONS[id].repeatable).not.toBe(true);
    expect(QUEST_DEFINITIONS[id].objectives.map(objective => objective.id)).toEqual([
      "defeat_orc_warmaster", "free_warmaster_captive", "collect_warmaster_chest", "defeat_orc_warcamp_enemies",
    ]);
  });
  it("unlocks only after The Patron's Shadow, including on restoration", () => {
    const state = setup("locked");
    state.quests.the_patrons_shadow.status = "active";
    expect(reconcileQuestAvailability(state).quests[id].status).toBe("locked");
    state.quests.the_patrons_shadow.status = "completed";
    expect(reconcileQuestAvailability(state).quests[id].status).toBe("available");
    const legacy = { ...state, quests: { ...state.quests } };
    delete (legacy.quests as Partial<GameState["quests"]>)[id];
    const restored = sanitizeGameStateForSave(legacy, 1000);
    expect(restored.quests[id].status).toBe("available");
    expect(progress(restored, "defeat_orc_warcamp_enemies").currentCount).toBe(0);
  });
  it("recognizes prior milestones on acceptance but never banks earlier Orc kills", () => {
    let state = setup("available");
    state = recordEnemyDefeatedForQuests(state, deadOrc(), "map-7");
    state.warmasterLifecycle = { ...createWarmasterLifecycle(), rescued: true, chestCollectedOnce: true };
    state = acceptQuestFromQuestGiver(hub(state), HUB_TWO_QUEST_GIVER_NPC_ID, id);
    expect(state.quests[id].status).toBe("active");
    for (const objectiveId of ["defeat_orc_warmaster", "free_warmaster_captive", "collect_warmaster_chest"]) expect(progress(state, objectiveId).completed).toBe(true);
    expect(progress(state, "defeat_orc_warcamp_enemies").currentCount).toBe(0);
  });
  it.each<EnemyTypeId>(["orc", "orc_raider", "orc_shieldbearer", "orc_warmaster"])("counts %s before victory with existing Superior credits", type => {
    let state = recordEnemyDefeatedForQuests(setup(), deadOrc(type), "map-7");
    state = recordEnemyDefeatedForQuests(state, deadOrc(type, "superior"), "map-7");
    expect(progress(state, "defeat_orc_warcamp_enemies").currentCount).toBe(3);
    expect(progress(state, "defeat_orc_warmaster").completed).toBe(false);
  });
  it("counts owned reinforcements and rejects wrong maps, subzones, types and live enemies", () => {
    const reinforcement = { ...deadOrc(), barrackSpawn: { barrackId: "map-7-route-barrack", sequence: 1 } };
    let state = recordEnemyDefeatedForQuests(setup(), reinforcement, "map-7");
    for (const [enemy, map] of [[deadOrc(), "map-6"], [{ ...deadOrc(), subzoneId: "wrong" }, "map-7"],
      [deadOrc("night_bat"), "map-7"], [{ ...deadOrc(), health: 100, state: "idle" }, "map-7"]] as const) {
      state = recordEnemyDefeatedForQuests(state, enemy as Enemy, map);
    }
    expect(progress(state, "defeat_orc_warcamp_enemies").currentCount).toBe(1);
  });
  it("caps credits without requiring another Boss victory", () => {
    let state = setup();
    for (let index = 0; index < 80; index++) state = recordEnemyDefeatedForQuests(state, deadOrc("orc", "superior"), "map-7");
    expect(progress(state, "defeat_orc_warcamp_enemies")).toMatchObject({ completed: true, currentCount: 150 });
    expect(state.quests[id].status).toBe("active");
    state = claim(win(state));
    expect(state.quests[id].status).toBe("ready_to_turn_in");
  });
  it("reconciles genuine victory/rescue in updateGame without duplicate actors or repeat credit", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    let state = setup();
    const boss = state.entities.boss as Enemy;
    state = addEntity(state, createEnemy("arena-orc", { x: 95, y: 35 }, "aggressive", { enemyTypeId: "orc", subzoneId: "orc-warcamp" }));
    state = resolveBasicAttackImpact(state, state.entities.leader as Companion, boss, 1000, { powerMultiplier: 10000 }).state;
    state = updateGame(state, { nowMs: 1100, deltaMs: 100 });
    expect(progress(state, "defeat_orc_warmaster")).toMatchObject({ completed: true, currentCount: 1 });
    expect(progress(state, "free_warmaster_captive").completed).toBe(true);
    expect(progress(state, "collect_warmaster_chest").completed).toBe(false);
    const count = progress(state, "defeat_orc_warcamp_enemies").currentCount;
    expect(count).toBe(1);
    expect(state.entities["arena-orc"]).toBeUndefined();
    state = updateGame(state, { nowMs: 1200, deltaMs: 100 });
    expect(progress(state, "defeat_orc_warcamp_enemies").currentCount).toBe(count);
    expect(Object.values(state.entities).filter(entity => entity.kind === "enemy" && entity.enemyTypeId === "orc_warmaster")).toHaveLength(1);
  });
  it("requires the entire manually claimed chest and completes immediately while the overlay is open", () => {
    let state = win();
    state.inventory = { capacity: 0, slots: [] };
    state = claim(state);
    expect(state.warmasterLifecycle?.chest?.crownsClaimed).toBe(true);
    expect(state.warmasterLifecycle?.chest?.pendingLoot.length).toBeGreaterThan(0);
    expect(progress(state, "collect_warmaster_chest").completed).toBe(false);
    state.inventory = { capacity: 30, slots: [] };
    state = claim(state);
    expect(state.warmasterInteraction?.chestOpen).toBe(true);
    expect(progress(state, "collect_warmaster_chest").completed).toBe(true);
    expect(state.warmasterLifecycle?.chestCollectedOnce).toBe(true);
    const wallet = state.wallet;
    expect(claim(state).wallet).toBe(wallet);
  });
  it("retains collection history beyond rearming, travel, and restoration", () => {
    let state = claim(win());
    state = updateWarmasterLifecycle({ ...state, warmasterInteraction: undefined,
      entities: { ...state.entities, leader: { ...state.entities.leader, position: { x: 25, y: 20 } } },
      warmasterLifecycle: { ...state.warmasterLifecycle!, recharge: 60 } }, 3000);
    expect(state.warmasterLifecycle).toMatchObject({ sequence: 2, phase: "ready", chestCollectedOnce: true });
    expect(state.warmasterLifecycle?.chest).toBeUndefined();
    const result = restoreGameStateFromSave(createSavedGame(hub(state), 3000));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(progress(result.state, "collect_warmaster_chest").completed).toBe(true);
    expect(result.state.warmasterLifecycle?.chestCollectedOnce).toBe(true);
  });
  it("keeps completed milestones sticky even after transient encounter changes", () => {
    const state = claim(win());
    const reconciled = reconcileStateDerivedQuestObjectivesForQuests({ ...state, warmasterLifecycle: createWarmasterLifecycle() });
    for (const objectiveId of ["defeat_orc_warmaster", "free_warmaster_captive", "collect_warmaster_chest"]) expect(progress(reconciled, objectiveId).completed).toBe(true);
  });
  it("separates post-victory quest credits from physical-death recharge", () => {
    let state = win();
    const enemy = createEnemy("owned", { x: 25, y: 20 }, "aggressive", { enemyTypeId: "orc", subzoneId: "orc-warcamp", variant: "superior" });
    state = addEntity(state, enemy);
    state = updateEntity(state, damageEntity(enemy, enemy.maxHealth), 2000);
    state = recordEnemyDefeatedForQuests(state, state.entities.owned as Enemy, "map-7");
    expect(state.warmasterLifecycle?.recharge).toBe(1);
    expect(progress(state, "defeat_orc_warcamp_enemies").currentCount).toBe(2);
    state = updateEntity(state, { ...state.entities.owned }, 2100);
    expect(state.warmasterLifecycle?.recharge).toBe(1);
  });
  it("rewards only eligible living current-party companions and pays the party once", () => {
    let state = setup();
    const dead = { ...createCompanion("dead", { x: 25, y: 20 }, "leader"), health: 0, state: "dead" as const };
    const maxed = { ...createCompanion("maxed", { x: 25, y: 22 }, "leader"), characterLevel: 200 };
    state = { ...state, entities: { ...state.entities, dead, maxed }, restingCompanionsById: { resting: createCompanion("resting", { x: 0, y: 0 }, "resting") } };
    for (const objective of QUEST_DEFINITIONS[id].objectives) {
      for (let count = 0; count < (objective.requiredCount ?? 1); count++) state = completeQuestObjective(state, id, objective.id);
    }
    state = hub(state);
    state = finishReadyQuestForQuestGiver(state, HUB_TWO_QUEST_GIVER_NPC_ID, id, 5000);
    expect(state.quests[id].status).toBe("completed");
    expect(state.wallet.balancesByCurrencyId.crowns).toBe(1500);
    expect((state.entities.leader as Companion).lastCharacterXpGained).toBe(6000);
    expect((state.entities.dead as Companion).characterXp).toBe(0);
    expect((state.entities.maxed as Companion).characterXp).toBe(0);
    expect(state.restingCompanionsById?.resting.characterXp).toBe(0);
    expect(finishReadyQuestForQuestGiver(state, HUB_TWO_QUEST_GIVER_NPC_ID, id, 6000).wallet).toBe(state.wallet);
  });
  it("guides to the Boss rather than nearby Orcs, then chest, then remaining Orcs", () => {
    let state = addEntity(setup(), createEnemy("nearby", { x: 94, y: 44 }, "aggressive", { enemyTypeId: "orc", subzoneId: "orc-warcamp" }));
    state = addEntity(state, createResource("resource", { x: 96, y: 44 }));
    const select = () => selectPoiTarget(state, { type: "complete_current_quest", questId: id, reason: "test" },
      { resourceIds: new Set(), resourceIdByGathererId: new Map(), gathererIdByResourceId: new Map() }).localTarget;
    expect(select()?.targetEntityId).toBe("boss");
    state = win(state);
    expect(getQuestGuidanceObjectives(state, id).map(objective => objective.id)).toEqual(["collect_warmaster_chest"]);
    expect(select()?.poiId).toBe(WARMASTER_CHEST_ID);
    expect(state.warmasterLifecycle?.chest?.crownsClaimed).toBe(false);
    state = claim(state);
    expect(getQuestGuidanceObjectives(state, id).map(objective => objective.id)).toEqual(["defeat_orc_warcamp_enemies"]);
    expect(getQuestTargetMapId(state, id)).toBe("map-7");
    for (let count = 0; count < 150; count++) state = completeQuestObjective(state, id, "defeat_orc_warcamp_enemies");
    expect(getQuestTargetMapId(state, id)).toBe(HUB_TWO_MAP_ID);
  });
  it("applies ordered guidance in the actual Auto Combat path and replaces stale farming caches", () => {
    let state = addEntity(setup(), createEnemy("field-orc", { x: 25, y: 20 }, "passive", { enemyTypeId: "orc", subzoneId: "orc-warcamp" }));
    state.autoModeEnabled = true;
    state.localPoiTarget = { poiId: "field-orc", targetEntityId: "field-orc", category: "combat", mapId: "map-7",
      position: { x: 25, y: 20 }, reason: "wild enemy fallback" };
    state.lastPoiDecision = { evaluatedAtMs: 0, consideredTargets: [], skippedReasons: {} };
    state = updatePoiSystem(state);
    expect(state.localPoiTarget?.targetEntityId).toBe("boss");
    state = win(state);
    expect(state.autoModeEnabled).toBe(false);
    state = updatePoiSystem({ ...state, autoModeEnabled: true });
    expect(state.localPoiTarget?.poiId).toBe(WARMASTER_CHEST_ID);
    expect(state.warmasterLifecycle?.chest?.crownsClaimed).toBe(false);
  });
  it("keeps manual orders and self-defense ahead of ordered quest guidance", () => {
    let state = setup();
    state.autoModeEnabled = true;
    state.leaderIntent = { type: "move", source: "player", targetId: null, targetPosition: { x: 90, y: 44 } };
    expect(updatePoiSystem(state).leaderIntent).toBe(state.leaderIntent);
    state.leaderIntent = null;
    const threat = { ...createEnemy("threat", { x: 95, y: 43 }, "aggressive", { enemyTypeId: "orc", subzoneId: "orc-warcamp" }), state: "attack" as const, currentTargetId: "leader" };
    state = updatePoiSystem(addEntity(state, threat));
    expect(state.localPoiTarget?.targetEntityId).toBe("threat");
  });
  it("keeps ordinary farming caches when the guided quest is on another map", () => {
    const state = addEntity(setup(), createEnemy("cached-orc", { x: 94, y: 44 }, "passive", { enemyTypeId: "orc" }));
    state.currentMapId = "map-6";
    state.map = createDebugMap("map-6");
    state.autoModeEnabled = true;
    state.localPoiTarget = { poiId: "cached-orc", targetEntityId: "cached-orc", category: "combat", mapId: "map-6",
      position: { x: 94, y: 44 }, reason: "wild enemy fallback" };
    state.lastPoiDecision = { evaluatedAtMs: 0, consideredTargets: [], skippedReasons: {} };
    expect(updatePoiSystem(state).lastPoiDecision).toBe(state.lastPoiDecision);
  });
});

describe("encounter milestone history", () => {
  it("rejects unknown/missing encounters and unknown milestone kinds", () => {
    const state = win();
    expect(isEncounterQuestMilestoneComplete({}, milestone("boss_defeated"))).toBe(false);
    expect(isEncounterQuestMilestoneComplete(state, undefined)).toBe(false);
    expect(isEncounterQuestMilestoneComplete(state, { encounterId: "unknown", kind: "boss_defeated" } as unknown as QuestEncounterMilestone)).toBe(false);
    expect(isEncounterQuestMilestoneComplete(state, { ...milestone("boss_defeated"), kind: "unknown" } as unknown as QuestEncounterMilestone)).toBe(false);
  });
  it.each(["ledger", "sequence"])("infers legacy collection from a valid %s", source => {
    const chest = rollWarmasterChest(1, () => 0.5);
    const lifecycle = sanitizeWarmasterLifecycle({ phase: "defeated", sequence: source === "sequence" ? 2 : 1, recharge: 0, rescued: true,
      ...(source === "ledger" ? { chest: { ...chest, crownsClaimed: true, pendingLoot: [], collectedLoot: chest.rolledLoot } } : {}) });
    expect(lifecycle.chestCollectedOnce).toBe(true);
  });
  it("does not infer a claim from missing, partial, malformed or merely opened chest data", () => {
    const chest = rollWarmasterChest(1, () => 0.5);
    for (const candidate of [undefined, chest, { ...chest, crownsClaimed: true },
      { ...chest, pendingLoot: [], crownsClaimed: true }, { ...chest, pendingLoot: [], collectedLoot: chest.rolledLoot }]) {
      const lifecycle = sanitizeWarmasterLifecycle({ phase: "defeated", sequence: 1, recharge: 0, rescued: true, chest: candidate });
      expect(lifecycle.chestCollectedOnce).not.toBe(true);
    }
    expect(sanitizeWarmasterLifecycle({ ...createWarmasterLifecycle(), sequence: Infinity }).chestCollectedOnce).not.toBe(true);
    expect(createWarmasterLifecycle().chestCollectedOnce).toBeUndefined();
  });
  it("sanitizes history before restored quest reconciliation and preserves kill progress", () => {
    const state = setup();
    state.quests[id].objectiveProgress.defeat_orc_warcamp_enemies.currentCount = 37;
    state.warmasterLifecycle = { ...createWarmasterLifecycle(), rescued: true, sequence: 2 };
    const restored = sanitizeGameStateForSave(state, 1000);
    expect(restored.warmasterLifecycle?.chestCollectedOnce).toBe(true);
    expect(progress(restored, "collect_warmaster_chest").completed).toBe(true);
    expect(progress(restored, "defeat_orc_warcamp_enemies").currentCount).toBe(37);
    const missing = sanitizeGameStateForSave({ ...setup(), warmasterLifecycle: undefined }, 1000);
    expect(progress(missing, "defeat_orc_warmaster").completed).toBe(false);
  });
});
