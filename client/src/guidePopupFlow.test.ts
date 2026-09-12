import { describe, expect, it } from "vitest";

import {
  getGuidePopupsForQuestStatusChanges,
  shouldRenderNewsBroadcastOverlay,
} from "./guidePopupFlow";

describe("guide popup flow", () => {
  it("queues first quest, equipment, and smith guides when those quests become active", () => {
    expect(
      getGuidePopupsForQuestStatusChanges(
        {
          clear_the_shore: "available",
          outfit_the_expedition: "available",
          smiths_first_work: "available",
        },
        {
          clear_the_shore: "active",
          outfit_the_expedition: "active",
          smiths_first_work: "active",
        },
      ),
    ).toEqual([
      "first_quest_started",
      "equipment_setup",
      "first_smith_quest_started",
    ]);
  });

  it("queues the route unlock quest guide when Lowbank Blockage becomes active", () => {
    expect(
      getGuidePopupsForQuestStatusChanges(
        { break_lower_shore_blockage: "available" },
        { break_lower_shore_blockage: "active" },
      ),
    ).toEqual(["first_route_unlock_quest"]);
  });

  it("queues the first route unlocked guide when Lowbank Blockage becomes ready", () => {
    expect(
      getGuidePopupsForQuestStatusChanges(
        { break_lower_shore_blockage: "active" },
        { break_lower_shore_blockage: "ready_to_turn_in" },
      ),
    ).toEqual(["first_route_unlocked"]);
  });

  it("queues the class path guide when Azure Trial becomes available", () => {
    expect(
      getGuidePopupsForQuestStatusChanges(
        { azure_trial: "locked" },
        { azure_trial: "available" },
      ),
    ).toEqual(["first_class_path"]);
  });

  it("does not queue milestone guides for unrelated status changes", () => {
    expect(
      getGuidePopupsForQuestStatusChanges(
        { stolen_field_supplies: "active" },
        { stolen_field_supplies: "ready_to_turn_in" },
      ),
    ).toEqual([]);
  });

  it("holds news broadcasts until guide popup sequences finish", () => {
    expect(shouldRenderNewsBroadcastOverlay(null, [])).toBe(true);
    expect(shouldRenderNewsBroadcastOverlay("first_smith_quest_started", [])).toBe(
      false,
    );
    expect(shouldRenderNewsBroadcastOverlay(null, ["first_smith_quest_started"])).toBe(
      false,
    );
  });
});
