import { useCallback, useEffect, useRef } from "react";
import { HUB_MAP_ID, HUB_TWO_MAP_ID } from "./game";
import { PUBLIC_ASSET_ROOT } from "./publicAssetUrl";

export const HUB_BACKGROUND_MUSIC_SRC = `${PUBLIC_ASSET_ROOT}/sounds/bg/hubs/hubs.ogg`;
export const BACKGROUND_MUSIC_STORAGE_KEY =
  "mmo-party-simulator.background-music.v1";

export type BackgroundMusicPreferences = {
  volumePercent: number;
  muted: boolean;
};

export const DEFAULT_BACKGROUND_MUSIC_PREFERENCES: BackgroundMusicPreferences = {
  volumePercent: 50,
  muted: false,
};

type BackgroundMusicStorage = Pick<Storage, "getItem" | "setItem">;

export function normalizeBackgroundMusicPreferences(
  preferences: Partial<BackgroundMusicPreferences>,
): BackgroundMusicPreferences {
  const volumePercent =
    typeof preferences.volumePercent === "number" &&
    Number.isFinite(preferences.volumePercent)
      ? Math.min(100, Math.max(0, Math.round(preferences.volumePercent)))
      : DEFAULT_BACKGROUND_MUSIC_PREFERENCES.volumePercent;

  return {
    volumePercent,
    muted:
      typeof preferences.muted === "boolean"
        ? preferences.muted
        : DEFAULT_BACKGROUND_MUSIC_PREFERENCES.muted,
  };
}

export function parseBackgroundMusicPreferences(
  value: string | null,
): BackgroundMusicPreferences {
  if (!value) {
    return { ...DEFAULT_BACKGROUND_MUSIC_PREFERENCES };
  }

  try {
    const parsed: unknown = JSON.parse(value);

    return parsed && typeof parsed === "object"
      ? normalizeBackgroundMusicPreferences(
          parsed as Partial<BackgroundMusicPreferences>,
        )
      : { ...DEFAULT_BACKGROUND_MUSIC_PREFERENCES };
  } catch {
    return { ...DEFAULT_BACKGROUND_MUSIC_PREFERENCES };
  }
}

export function readBackgroundMusicPreferences(
  storage?: BackgroundMusicStorage,
): BackgroundMusicPreferences {
  try {
    const preferenceStorage = storage ?? window.localStorage;

    return parseBackgroundMusicPreferences(
      preferenceStorage.getItem(BACKGROUND_MUSIC_STORAGE_KEY),
    );
  } catch {
    return { ...DEFAULT_BACKGROUND_MUSIC_PREFERENCES };
  }
}

export function writeBackgroundMusicPreferences(
  preferences: BackgroundMusicPreferences,
  storage?: BackgroundMusicStorage,
): boolean {
  try {
    const preferenceStorage = storage ?? window.localStorage;
    const normalizedPreferences = normalizeBackgroundMusicPreferences(preferences);

    preferenceStorage.setItem(
      BACKGROUND_MUSIC_STORAGE_KEY,
      JSON.stringify(normalizedPreferences),
    );
    return true;
  } catch {
    return false;
  }
}

export function isHubBackgroundMusicMap(mapId: string | undefined): boolean {
  return mapId === HUB_MAP_ID || mapId === HUB_TWO_MAP_ID;
}

export function useHubBackgroundMusic({
  enabled,
  mapId,
  preferences,
}: {
  enabled: boolean;
  mapId: string | undefined;
  preferences: BackgroundMusicPreferences;
}): void {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playbackWantedRef = useRef(false);
  const playbackPendingRef = useRef(false);
  const playbackWanted = enabled && isHubBackgroundMusicMap(mapId);

  playbackWantedRef.current = playbackWanted;

  const requestPlayback = useCallback(() => {
    const audio = audioRef.current;

    if (!audio || !playbackWantedRef.current) {
      return;
    }

    const playbackRequest = audio.play();

    if (!playbackRequest) {
      playbackPendingRef.current = false;
      return;
    }

    void playbackRequest.then(
      () => {
        playbackPendingRef.current = false;
      },
      () => {
        playbackPendingRef.current = playbackWantedRef.current;
      },
    );
  }, []);

  useEffect(() => {
    const audio = new Audio(HUB_BACKGROUND_MUSIC_SRC);
    audio.loop = true;
    audio.preload = "auto";
    audioRef.current = audio;

    function retryPendingPlayback() {
      if (playbackPendingRef.current) {
        requestPlayback();
      }
    }

    window.addEventListener("pointerdown", retryPendingPlayback);
    window.addEventListener("keydown", retryPendingPlayback);

    return () => {
      playbackWantedRef.current = false;
      playbackPendingRef.current = false;
      audio.pause();
      audio.currentTime = 0;
      audioRef.current = null;
      window.removeEventListener("pointerdown", retryPendingPlayback);
      window.removeEventListener("keydown", retryPendingPlayback);
    };
  }, [requestPlayback]);

  useEffect(() => {
    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    audio.volume = preferences.volumePercent / 100;
    audio.muted = preferences.muted;
  }, [preferences.muted, preferences.volumePercent]);

  useEffect(() => {
    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    playbackPendingRef.current = false;
    audio.pause();
    audio.currentTime = 0;

    if (playbackWanted) {
      requestPlayback();
    }
  }, [enabled, mapId, playbackWanted, requestPlayback]);
}
