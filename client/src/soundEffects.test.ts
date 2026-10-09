import { describe, expect, it } from "vitest";
import {
  DEFAULT_SOUND_EFFECTS_PREFERENCES,
  SOUND_EFFECTS_STORAGE_KEY,
  SoundEffectsController,
  getEnemyDeathSoundSource,
  getGameSoundEffectEvents,
  parseSoundEffectsPreferences,
  readSoundEffectsPreferences,
  writeSoundEffectsPreferences,
  type GameSoundEffectsSnapshot,
} from "./soundEffects";

class MemoryStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

class FakeAudio {
  currentTime = 0;
  muted = false;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  preload = "";
  volume = 1;
  pauseCount = 0;
  playCount = 0;

  pause(): void {
    this.pauseCount += 1;
  }

  play(): Promise<void> {
    this.playCount += 1;
    return Promise.resolve();
  }
}

describe("sound effects preferences", () => {
  it("uses defaults for missing or malformed values", () => {
    expect(parseSoundEffectsPreferences(null)).toEqual(
      DEFAULT_SOUND_EFFECTS_PREFERENCES,
    );
    expect(parseSoundEffectsPreferences("not-json")).toEqual(
      DEFAULT_SOUND_EFFECTS_PREFERENCES,
    );
  });

  it("normalizes, writes, and restores independent preferences", () => {
    const storage = new MemoryStorage();

    expect(
      writeSoundEffectsPreferences(
        { volumePercent: 72.6, muted: true },
        storage,
      ),
    ).toBe(true);
    expect(storage.values.has(SOUND_EFFECTS_STORAGE_KEY)).toBe(true);
    expect(readSoundEffectsPreferences(storage)).toEqual({
      volumePercent: 73,
      muted: true,
    });
  });
});

describe("game sound event detection", () => {
  it("detects releases, completed flasks, mapped deaths, and completed quests", () => {
    const previous: GameSoundEffectsSnapshot = {
      companions: {
        fighter: { lastAttackAt: 100, flaskLastUsedAt: null },
        defender: { lastAttackAt: 100, flaskLastUsedAt: 50 },
      },
      enemies: {
        slime: { alive: true, enemyTypeId: "green_slime" },
        bat: { alive: true, enemyTypeId: "cave_bat" },
      },
      questStatuses: {
        quest_one: "ready_to_turn_in",
        quest_two: "active",
      },
    };
    const next: GameSoundEffectsSnapshot = {
      companions: {
        fighter: { lastAttackAt: 200, flaskLastUsedAt: 150 },
        defender: { lastAttackAt: 100, flaskLastUsedAt: 50 },
      },
      enemies: {
        slime: { alive: false, enemyTypeId: "green_slime" },
        bat: { alive: false, enemyTypeId: "cave_bat" },
      },
      questStatuses: {
        quest_one: "completed",
        quest_two: "active",
      },
    };

    const events = getGameSoundEffectEvents(previous, next);

    expect(events.companionAttackCount).toBe(1);
    expect(events.flaskUseCount).toBe(1);
    expect(events.enemyDeathSources).toHaveLength(1);
    expect(events.enemyDeathSources[0]).toContain("slime-death.wav");
    expect(events.questCompletionCount).toBe(1);
  });

  it("maps superior enemies through their unchanged base type and leaves others silent", () => {
    expect(getEnemyDeathSoundSource("slimeward_spitter_slime")).toContain(
      "slime-death.wav",
    );
    expect(getEnemyDeathSoundSource("ember_imp")).toContain("imp-death.wav");
    expect(getEnemyDeathSoundSource("orc_warmaster")).toContain(
      "orc-warmaster-death.wav",
    );
    expect(getEnemyDeathSoundSource("cave_bat")).toBeNull();
  });
});

describe("sound effects controller", () => {
  it("uses all three attack sounds without immediate repeats", () => {
    let currentTime = 0;
    const created: Array<{ audio: FakeAudio; source: string }> = [];
    const controller = new SoundEffectsController({
      createAudio: (source) => {
        const audio = new FakeAudio();
        created.push({ audio, source });
        return audio;
      },
      now: () => currentTime,
      random: () => 0,
    });
    controller.setPreferences({ volumePercent: 50, muted: false });
    controller.setEnabled(true);

    for (let index = 0; index < 6; index += 1) {
      expect(controller.playAttack()).toBe(true);
      created.at(-1)?.audio.onended?.();
      currentTime += 100;
    }

    expect(new Set(created.slice(0, 3).map((entry) => entry.source)).size).toBe(3);
    for (let index = 1; index < created.length; index += 1) {
      expect(created[index].source).not.toBe(created[index - 1].source);
    }
  });

  it("caps pooled attacks and suppresses rapid repeats of the same death sound", () => {
    let currentTime = 0;
    const created: Array<{ audio: FakeAudio; source: string }> = [];
    const controller = new SoundEffectsController({
      createAudio: (source) => {
        const audio = new FakeAudio();
        created.push({ audio, source });
        return audio;
      },
      now: () => currentTime,
      random: () => 0,
    });
    controller.setPreferences({ volumePercent: 50, muted: false });
    controller.setEnabled(true);

    for (let index = 0; index < 4; index += 1) {
      currentTime += 100;
      expect(controller.playAttack()).toBe(true);
    }
    currentTime += 100;
    expect(controller.playAttack()).toBe(false);

    const deathSource = getEnemyDeathSoundSource("wolf");
    expect(deathSource).not.toBeNull();
    expect(controller.playEnemyDeath(deathSource ?? "")).toBe(true);
    expect(controller.playEnemyDeath(deathSource ?? "")).toBe(false);
    currentTime += 75;
    expect(controller.playEnemyDeath(deathSource ?? "")).toBe(true);
  });

  it("queues quest cues at one-second intervals and appends new batches", () => {
    let currentTime = 0;
    let nextTimerId = 1;
    const scheduled = new Map<
      number,
      { callback: () => void; runAt: number }
    >();
    const created: FakeAudio[] = [];
    const controller = new SoundEffectsController({
      createAudio: () => {
        const audio = new FakeAudio();
        created.push(audio);
        return audio;
      },
      now: () => currentTime,
      schedule: (callback, delayMs) => {
        const timerId = nextTimerId;
        nextTimerId += 1;
        scheduled.set(timerId, { callback, runAt: currentTime + delayMs });
        return timerId;
      },
      cancelSchedule: (timerId) => {
        scheduled.delete(timerId);
      },
    });
    controller.setPreferences({ volumePercent: 50, muted: false });
    controller.setEnabled(true);

    controller.queueQuestCompletions(2);
    controller.queueQuestCompletions(1);
    expect(created).toHaveLength(1);
    expect(created[0].playCount).toBe(1);

    for (const expectedTime of [1_000, 2_000]) {
      const nextTimer = [...scheduled.entries()].sort(
        (left, right) => left[1].runAt - right[1].runAt,
      )[0];
      expect(nextTimer).toBeDefined();
      scheduled.delete(nextTimer[0]);
      currentTime = nextTimer[1].runAt;
      expect(currentTime).toBe(expectedTime);
      nextTimer[1].callback();
    }

    expect(created).toHaveLength(1);
    expect(created[0].playCount).toBe(3);
    expect(scheduled.size).toBe(0);
  });

  it("stops active and pending sounds when muted", () => {
    let nextTimerId = 1;
    const canceledTimerIds: number[] = [];
    const created: FakeAudio[] = [];
    const controller = new SoundEffectsController({
      createAudio: () => {
        const audio = new FakeAudio();
        created.push(audio);
        return audio;
      },
      schedule: () => nextTimerId++,
      cancelSchedule: (timerId) => canceledTimerIds.push(timerId),
    });
    controller.setPreferences({ volumePercent: 50, muted: false });
    controller.setEnabled(true);
    controller.playFlaskBatch(2);
    controller.queueQuestCompletions(2);

    controller.setPreferences({ volumePercent: 50, muted: true });

    expect(created.every((audio) => audio.pauseCount > 0)).toBe(true);
    expect(canceledTimerIds.length).toBeGreaterThan(0);
    expect(controller.playMenuToggle()).toBe(false);
  });
});
