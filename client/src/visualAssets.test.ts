import { describe, expect, it } from "vitest";
import {
  CLASS_DEFINITIONS,
  createCompanion,
  createEnemy,
  createNpc,
  FIRST_CLASS_IDS,
} from "./game";
import {
  entityVisualAssets,
  firstClassCharacterVisualAssets,
  getEntityVisualAsset,
  getClassIdleFrameSrc,
  getEnemyWalkingAnimation,
  getSpriteAnimation,
  TICKET_0501_ENEMY_SPRITE_SRC,
  type SpriteDirection,
} from "./visualAssets";
import {
  MAP_VISUAL_OBJECT_SRC,
  TICKET_0501_HUD_CONTROL_SRC,
} from "./assetIcons";

const azureMassDirections = [
  "north",
  "northEast",
  "east",
  "southEast",
  "south",
  "southWest",
  "west",
  "northWest",
] satisfies SpriteDirection[];

const azureMassFrames = {
  north: "/assets/Characters/BossSlimeTest/TheAzureMassNorth.png",
  northEast: "/assets/Characters/BossSlimeTest/TheAzureMassNorthEast.png",
  east: "/assets/Characters/BossSlimeTest/TheAzureMassEast.png",
  southEast: "/assets/Characters/BossSlimeTest/TheAzureMassSouthEast.png",
  south: "/assets/Characters/BossSlimeTest/TheAzureMassSouth.png",
  southWest: "/assets/Characters/BossSlimeTest/TheAzureMassSouthWest.png",
  west: "/assets/Characters/BossSlimeTest/TheAzureMassWest.png",
  northWest: "/assets/Characters/BossSlimeTest/TheAzureMassNorthWest.png",
} satisfies Record<SpriteDirection, string>;

describe("entity visual assets", () => {
  it("uses real-size Test-Character Idle and Run art for quest guide NPCs", () => {
    const questGuide = createNpc(
      "guide",
      { x: 0, y: 0 },
      "Glade Surveyor",
      "quest_guide",
    );
    const visualAsset = getEntityVisualAsset(questGuide);

    expect(visualAsset).toBe(entityVisualAssets.questGuideCharacter);

    if (visualAsset.kind !== "sprite") {
      throw new Error("Quest guide visual should be a sprite asset.");
    }

    expect(visualAsset.naturalSize).toEqual({ width: 92, height: 92 });

    const idleAnimation = getSpriteAnimation(visualAsset, false);
    const eastRunAnimation = getSpriteAnimation(visualAsset, true, "east");

    expect(idleAnimation.frames).toEqual([
      "/assets/Characters/Test-Character/Idle/Idle_000.png",
    ]);
    expect(eastRunAnimation.frames).toHaveLength(8);
    expect(eastRunAnimation.frames.every((frame) => frame.includes("/Run/"))).toBe(
      true,
    );
    expect(eastRunAnimation.frames.some((frame) => frame.includes("/Attack/"))).toBe(
      false,
    );
  });

  it("keeps other NPC-specific visuals unchanged", () => {
    const testBlade = createNpc(
      "test-blade",
      { x: 0, y: 0 },
      "Test Blade",
      "test_blade",
    );

    expect(getEntityVisualAsset(testBlade)).toBe(entityVisualAssets.testBlade);
  });

  it("uses the generated Class Mentor icon for class mentor NPCs", () => {
    const classMentor = createNpc(
      "class-mentor",
      { x: 0, y: 0 },
      "Class Mentor",
      "class_mentor",
    );
    const visualAsset = getEntityVisualAsset(classMentor);

    expect(visualAsset).toBe(entityVisualAssets.classMentor);

    if (visualAsset.kind !== "image") {
      throw new Error("Class Mentor visual should be an image asset.");
    }

    expect(visualAsset.naturalSize).toEqual({ width: 144, height: 144 });
    expect(visualAsset.contentBounds).toEqual({
      x: 40,
      y: 14,
      width: 65,
      height: 111,
    });
  });

  it("uses the Azure Mass eight-direction boss sprites", () => {
    const azureMass = createEnemy("azure-mass", { x: 0, y: 0 }, undefined, {
      enemyTypeId: "azure_mass",
    });
    const visualAsset = getEntityVisualAsset(azureMass);

    if (visualAsset.kind !== "sprite") {
      throw new Error("Azure Mass visual should be a sprite asset.");
    }

    if ("frames" in visualAsset.animations.idle) {
      throw new Error("Azure Mass idle animation should be directional.");
    }

    expect(visualAsset.naturalSize).toEqual({ width: 260, height: 260 });
    expect(Object.keys(visualAsset.animations.idle)).toEqual(azureMassDirections);
    expect(Object.keys(visualAsset.animations.run)).toEqual(azureMassDirections);

    for (const direction of azureMassDirections) {
      expect(visualAsset.animations.idle[direction]?.frames).toEqual([
        azureMassFrames[direction],
      ]);
      expect(visualAsset.animations.run[direction]?.frames).toEqual([
        azureMassFrames[direction],
      ]);
      expect(getSpriteAnimation(visualAsset, true, direction).frames).toEqual([
        azureMassFrames[direction],
      ]);
    }
  });

  it("uses narrow vertical angle bands for Beginner four-direction movement", () => {
    const visualAsset = entityVisualAssets.beginnerCharacter;

    const northAnimation = getSpriteAnimation(visualAsset, true, "northEast", 90);
    const southAnimation = getSpriteAnimation(visualAsset, true, "southEast", 270);
    const eastAnimation = getSpriteAnimation(visualAsset, true, "northEast", 45);
    const westAnimation = getSpriteAnimation(visualAsset, true, "northWest", 180);
    const nearNorthEastAnimation = getSpriteAnimation(
      visualAsset,
      true,
      "northEast",
      74.9,
    );
    const nearNorthWestAnimation = getSpriteAnimation(
      visualAsset,
      true,
      "northWest",
      105.1,
    );

    expect(northAnimation.frames[0]).toContain("BeginnerWalkingNorth");
    expect(southAnimation.frames[0]).toContain("BeginnerWalkingSouth");
    expect(eastAnimation.frames[0]).toContain("BeginnerWalkingEast");
    expect(westAnimation.frames[0]).toContain("BeginnerWalkingWest");
    expect(nearNorthEastAnimation.frames[0]).toContain("BeginnerWalkingEast");
    expect(nearNorthWestAnimation.frames[0]).toContain("BeginnerWalkingWest");
  });

  it("uses first-class character art after class selection", () => {
    const beginner = createCompanion(
      "beginner",
      { x: 0, y: 0 },
      "beginner",
      "fighter",
      0,
      "beginner",
    );

    expect(getEntityVisualAsset(beginner)).toBe(entityVisualAssets.beginnerCharacter);

    for (const classId of FIRST_CLASS_IDS) {
      const companion = createCompanion(
        classId,
        { x: 0, y: 0 },
        classId,
        "fighter",
        0,
        classId,
      );

      expect(getEntityVisualAsset(companion)).toBe(
        firstClassCharacterVisualAssets[classId],
      );
    }
  });

  it("defines complete first-class idle and running sprite paths", () => {
    for (const classId of FIRST_CLASS_IDS) {
      const visualAsset = firstClassCharacterVisualAssets[classId];

      expect(visualAsset.naturalSize).toEqual({ width: 172, height: 172 });

      if (!("north" in visualAsset.animations.idle)) {
        throw new Error(`${classId} should use directional idle frames.`);
      }

      expect(Object.keys(visualAsset.animations.idle)).toHaveLength(8);
      expect(Object.keys(visualAsset.animations.run)).toEqual([
        "north",
        "east",
        "south",
        "west",
      ]);

      for (const animation of Object.values(visualAsset.animations.idle)) {
        expect(animation?.frames).toHaveLength(1);
        expect(animation?.frames[0]).toMatch(/Idle_(North|South|East|West)/);
      }

      for (const animation of Object.values(visualAsset.animations.run)) {
        expect(animation?.frames).toHaveLength(7);
        expect(animation?.frames[0]).toMatch(
          /Running_(North|South|East|West)_0000\.png$/,
        );
      }
    }
  });

  it("resolves a recruit-style idle frame for every current class", () => {
    for (const classId of Object.keys(CLASS_DEFINITIONS)) {
      expect(getClassIdleFrameSrc(classId as keyof typeof CLASS_DEFINITIONS)).toMatch(
        /\.png$/,
      );
    }

    expect(getClassIdleFrameSrc("beginner")).toContain("BeginnerWalkingSouth");
  });

  it("maps the Guild Notice Board sign to the generated asset", () => {
    expect(MAP_VISUAL_OBJECT_SRC.guild_notice_board_new_quest_sign).toBe(
      "/assets/Generated/guild-tavern/notice-board-new-quest-sign.png",
    );
  });

  it("registers Ticket 0501 terrain and HUD asset paths", () => {
    expect(MAP_VISUAL_OBJECT_SRC.ash_goblin_charred_dead_tree_trunk).toBe(
      "/assets/Generated/ticket-0501/terrain/ash-goblin-encampment/charred_dead_tree_trunk.png",
    );
    expect(MAP_VISUAL_OBJECT_SRC.briar_burrow_mound_entrance).toBe(
      "/assets/Generated/ticket-0501/terrain/briar-burrows/burrow_mound_entrance.png",
    );
    expect(MAP_VISUAL_OBJECT_SRC.nightmire_bat_roost_dead_tree).toBe(
      "/assets/Generated/ticket-0501/terrain/nightmire-canopy/bat_roost_dead_tree.png",
    );
    expect(MAP_VISUAL_OBJECT_SRC.orc_warcamp_heavy_orc_spike_barricade).toBe(
      "/assets/Generated/ticket-0501/terrain/orc-warcamp/heavy_orc_spike_barricade.png",
    );
    expect(TICKET_0501_HUD_CONTROL_SRC.autoCombatOn).toBe(
      "/assets/Generated/ticket-0501/ui/controls/auto_combat_on.png",
    );
  });

  it("resolves east walking previews for Notice Board monster targets", () => {
    const shamanAnimation = getEnemyWalkingAnimation("goblin_shaman", "east");
    const wispAnimation = getEnemyWalkingAnimation("ash_wisp", "east");

    expect(shamanAnimation.frames[0]).toBe(TICKET_0501_ENEMY_SPRITE_SRC.goblinShaman);
    expect(wispAnimation.frames[0]).toBe(TICKET_0501_ENEMY_SPRITE_SRC.ashWisp);
  });

  it("uses Ticket 0501 south-facing enemy slices for post-Hub-2 enemies", () => {
    expect(getEnemyWalkingAnimation("ember_imp", "east").frames[0]).toBe(
      TICKET_0501_ENEMY_SPRITE_SRC.emberImp,
    );
    expect(getEnemyWalkingAnimation("tin_crawler", "east").frames[0]).toBe(
      TICKET_0501_ENEMY_SPRITE_SRC.tinCrawler,
    );
    expect(getEnemyWalkingAnimation("orc", "east").frames[0]).toBe(
      TICKET_0501_ENEMY_SPRITE_SRC.orcGrunt,
    );
    expect(getEnemyWalkingAnimation("orc_warmaster", "east").frames[0]).toBe(
      TICKET_0501_ENEMY_SPRITE_SRC.orcWarmaster,
    );
  });

  it("uses the Beginner cardinal movement fallback for first-class movement", () => {
    const visualAsset = firstClassCharacterVisualAssets.blade;

    const northAnimation = getSpriteAnimation(visualAsset, true, "northEast", 90);
    const southAnimation = getSpriteAnimation(visualAsset, true, "southEast", 270);
    const eastAnimation = getSpriteAnimation(visualAsset, true, "northEast", 45);
    const westAnimation = getSpriteAnimation(visualAsset, true, "northWest", 180);

    expect(northAnimation.frames[0]).toContain("BladeRunning_North");
    expect(southAnimation.frames[0]).toContain("BladeRunning_South");
    expect(eastAnimation.frames[0]).toContain("BladeRunning_East");
    expect(westAnimation.frames[0]).toContain("BladeRunning_West");
  });
});
