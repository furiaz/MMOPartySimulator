import { describe, expect, it } from "vitest";
import { HUB_MAP_ID, HUB_TWO_MAP_ID } from "./game";
import {
  BACKGROUND_MUSIC_STORAGE_KEY,
  DEFAULT_BACKGROUND_MUSIC_PREFERENCES,
  isHubBackgroundMusicMap,
  parseBackgroundMusicPreferences,
  readBackgroundMusicPreferences,
  writeBackgroundMusicPreferences,
} from "./backgroundMusic";

class MemoryStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe("background music maps", () => {
  it("enables music only for the two current hub maps", () => {
    expect(isHubBackgroundMusicMap(HUB_MAP_ID)).toBe(true);
    expect(isHubBackgroundMusicMap(HUB_TWO_MAP_ID)).toBe(true);
    expect(isHubBackgroundMusicMap("map-1")).toBe(false);
    expect(isHubBackgroundMusicMap("slimeward-camp")).toBe(false);
    expect(isHubBackgroundMusicMap(undefined)).toBe(false);
  });
});

describe("background music preferences", () => {
  it("uses defaults when no preference is stored", () => {
    expect(parseBackgroundMusicPreferences(null)).toEqual(
      DEFAULT_BACKGROUND_MUSIC_PREFERENCES,
    );
  });

  it("reads valid volume and mute preferences independently", () => {
    expect(
      parseBackgroundMusicPreferences(
        JSON.stringify({ volumePercent: 37, muted: true }),
      ),
    ).toEqual({ volumePercent: 37, muted: true });
  });

  it("falls back safely for malformed and partial preferences", () => {
    expect(parseBackgroundMusicPreferences("not-json")).toEqual(
      DEFAULT_BACKGROUND_MUSIC_PREFERENCES,
    );
    expect(
      parseBackgroundMusicPreferences(JSON.stringify({ volumePercent: 65 })),
    ).toEqual({ volumePercent: 65, muted: false });
    expect(
      parseBackgroundMusicPreferences(JSON.stringify({ muted: true })),
    ).toEqual({ volumePercent: 50, muted: true });
  });

  it("rounds and clamps stored volume values", () => {
    expect(
      parseBackgroundMusicPreferences(
        JSON.stringify({ volumePercent: 140, muted: false }),
      ).volumePercent,
    ).toBe(100);
    expect(
      parseBackgroundMusicPreferences(
        JSON.stringify({ volumePercent: -12, muted: false }),
      ).volumePercent,
    ).toBe(0);
    expect(
      parseBackgroundMusicPreferences(
        JSON.stringify({ volumePercent: 42.6, muted: false }),
      ).volumePercent,
    ).toBe(43);
  });

  it("writes and restores the normalized preferences", () => {
    const storage = new MemoryStorage();

    expect(
      writeBackgroundMusicPreferences(
        { volumePercent: 73, muted: true },
        storage,
      ),
    ).toBe(true);
    expect(storage.values.has(BACKGROUND_MUSIC_STORAGE_KEY)).toBe(true);
    expect(readBackgroundMusicPreferences(storage)).toEqual({
      volumePercent: 73,
      muted: true,
    });
  });
});
