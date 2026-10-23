import { describe, expect, it } from "vitest";
import { createCompanion, createEnemy, createNpc } from "./game/entities";
import { createDebugMap } from "./game/debugMap";
import { createInitialQuestStates, QUEST_DEFINITIONS, WARCAMP_MAIN_QUEST_ID } from "./game/questSystem";
import { reconcileStateDerivedQuestObjectivesForQuests } from "./game/questProgressionHooks";
import { createTestGameState } from "./game/testState";
import { createWarmasterLifecycle, WARMASTER_CHEST_ID } from "./game/warmasterLifecycleState";
import { ORC_WARCAMP_CHEST_POSITION } from "./game/orcWarcampLayout";
import { getQuestEntityIndicators } from "./questEntityIndicators";
import { getNpcQuestRouteHintGroupsByMap, getObjectiveLabel } from "./questUiHelpers";

const id = WARCAMP_MAIN_QUEST_ID;
function setup() {
  const quests = createInitialQuestStates();
  quests[id].status = "active";
  const leader = createCompanion("leader", { x: 95, y: 44 }, "leader");
  const boss = createEnemy("boss", { x: 95, y: 32 }, "aggressive", { enemyTypeId: "orc_warmaster", subzoneId: "orc-warcamp" });
  const orc = createEnemy("orc", { x: 95, y: 42 }, "aggressive", { enemyTypeId: "orc", subzoneId: "orc-warcamp" });
  const chest = createNpc(WARMASTER_CHEST_ID, ORC_WARCAMP_CHEST_POSITION, "Chest", "dungeon_chest_closed");
  return createTestGameState({ currentMapId: "map-7", map: createDebugMap("map-7"), partyLeaderId: leader.id,
    entities: { leader, boss, orc, [chest.id]: chest }, quests, warmasterLifecycle: createWarmasterLifecycle() });
}
describe("Warcamp quest presentation", () => {
  it("shows authored objective names in the agreed order without quest-ID UI checks", () => {
    expect(QUEST_DEFINITIONS[id].objectives.map(objective => getObjectiveLabel(objective))).toEqual([
      "Defeat the Orc Warmaster", "Free the captive", "Fully collect the Warmaster's chest", "Defeat 150 Orcs in Orc Warcamp",
    ]);
    expect(getObjectiveLabel({ id: "unrelated", type: "defeat_enemy_count", displayName: "An authored label" })).toBe("An authored label");
  });
  it("marks only the guided encounter target, then the chest, then ordinary Orcs", () => {
    let state = setup();
    expect(getQuestEntityIndicators(state).filter(indicator => indicator.questId === id).map(indicator => indicator.entityId)).toEqual(["boss"]);
    state.warmasterLifecycle = { ...createWarmasterLifecycle(), rescued: true };
    state = reconcileStateDerivedQuestObjectivesForQuests(state);
    expect(getQuestEntityIndicators(state).filter(indicator => indicator.questId === id).map(indicator => indicator.entityId)).toEqual([WARMASTER_CHEST_ID]);
    state.warmasterLifecycle = { ...state.warmasterLifecycle!, chestCollectedOnce: true };
    state = reconcileStateDerivedQuestObjectivesForQuests(state);
    expect(getQuestEntityIndicators(state).filter(indicator => indicator.questId === id).map(indicator => indicator.entityId)).toEqual(["boss", "orc"]);
  });
  it("shows one prioritized route hint without hiding parallel tracker objectives", () => {
    let state = setup();
    const lines = () => getNpcQuestRouteHintGroupsByMap(state.quests)["map-7"]!.flatMap(group => group.hints.filter(hint => hint.questId === id).flatMap(hint => hint.objectiveLines));
    expect(lines()).toHaveLength(1);
    expect(lines()[0]).toContain("Defeat the Orc Warmaster");
    state.warmasterLifecycle = { ...createWarmasterLifecycle(), rescued: true };
    state = reconcileStateDerivedQuestObjectivesForQuests(state);
    expect(lines()).toHaveLength(1);
    expect(lines()[0]).toContain("Fully collect the Warmaster's chest");
    expect(QUEST_DEFINITIONS[id].objectives).toHaveLength(4);
  });
});
