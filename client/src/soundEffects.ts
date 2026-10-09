import { useCallback, useEffect, useRef } from "react";
import type { EnemyTypeId, GameState, QuestStatus } from "./game";
import { PUBLIC_ASSET_ROOT } from "./publicAssetUrl";

export const SOUND_EFFECTS_STORAGE_KEY =
  "mmo-party-simulator.sound-effects.v1";

export type SoundEffectsPreferences = {
  volumePercent: number;
  muted: boolean;
};

export const DEFAULT_SOUND_EFFECTS_PREFERENCES: SoundEffectsPreferences = {
  volumePercent: 50,
  muted: false,
};

const SOUND_EFFECT_SOURCES = {
  attacks: [
    `${PUBLIC_ASSET_ROOT}/sounds/effects/basic-attack-1.wav`,
    `${PUBLIC_ASSET_ROOT}/sounds/effects/basic-attack-2.wav`,
    `${PUBLIC_ASSET_ROOT}/sounds/effects/basic-attack-3.wav`,
  ],
  flask: `${PUBLIC_ASSET_ROOT}/sounds/effects/flask-use.wav`,
  menu: `${PUBLIC_ASSET_ROOT}/sounds/effects/menu-toggle.wav`,
  merchant: `${PUBLIC_ASSET_ROOT}/sounds/effects/merchant-sell.wav`,
  quest: `${PUBLIC_ASSET_ROOT}/sounds/effects/quest-complete.wav`,
  deaths: {
    goblin: `${PUBLIC_ASSET_ROOT}/sounds/enemies/goblin-scout-death.wav`,
    imp: `${PUBLIC_ASSET_ROOT}/sounds/enemies/imp-death.wav`,
    orcGrunt: `${PUBLIC_ASSET_ROOT}/sounds/enemies/orc-grunt-death.wav`,
    orcRaider: `${PUBLIC_ASSET_ROOT}/sounds/enemies/orc-raider-death.wav`,
    orcShieldbearer: `${PUBLIC_ASSET_ROOT}/sounds/enemies/orc-shieldbearer-death.wav`,
    orcWarmaster: `${PUBLIC_ASSET_ROOT}/sounds/enemies/orc-warmaster-death.wav`,
    slime: `${PUBLIC_ASSET_ROOT}/sounds/enemies/slime-death.wav`,
    wolf: `${PUBLIC_ASSET_ROOT}/sounds/enemies/wolf-death.wav`,
  },
} as const;

const CATEGORY_CAPS = {
  attack: 4,
  death: 3,
  flask: 3,
} as const;
const REPEAT_GUARD_MS = 75;
const FLASK_STAGGER_MS = 175;
const QUEST_CADENCE_MS = 1_000;

type SoundEffectsStorage = Pick<Storage, "getItem" | "setItem">;
type PooledSoundCategory = keyof typeof CATEGORY_CAPS;

type SoundEffectAudio = {
  currentTime: number;
  muted: boolean;
  onended: ((event: Event) => void) | null;
  onerror: ((event: Event) => void) | null;
  preload: string;
  volume: number;
  pause: () => void;
  play: () => Promise<void> | void;
};

type SoundEffectsControllerOptions = {
  createAudio?: (source: string) => SoundEffectAudio;
  now?: () => number;
  random?: () => number;
  schedule?: (callback: () => void, delayMs: number) => number;
  cancelSchedule?: (timerId: number) => void;
};

export type GameSoundEffectsSnapshot = {
  companions: Record<
    string,
    { lastAttackAt: number; flaskLastUsedAt: number | null }
  >;
  enemies: Record<
    string,
    { alive: boolean; enemyTypeId: EnemyTypeId | undefined }
  >;
  questStatuses: Record<string, QuestStatus>;
};

export type GameSoundEffectEvents = {
  companionAttackCount: number;
  enemyDeathSources: string[];
  flaskUseCount: number;
  questCompletionCount: number;
};

export function normalizeSoundEffectsPreferences(
  preferences: Partial<SoundEffectsPreferences>,
): SoundEffectsPreferences {
  const volumePercent =
    typeof preferences.volumePercent === "number" &&
    Number.isFinite(preferences.volumePercent)
      ? Math.min(100, Math.max(0, Math.round(preferences.volumePercent)))
      : DEFAULT_SOUND_EFFECTS_PREFERENCES.volumePercent;

  return {
    volumePercent,
    muted:
      typeof preferences.muted === "boolean"
        ? preferences.muted
        : DEFAULT_SOUND_EFFECTS_PREFERENCES.muted,
  };
}

export function parseSoundEffectsPreferences(
  value: string | null,
): SoundEffectsPreferences {
  if (!value) {
    return { ...DEFAULT_SOUND_EFFECTS_PREFERENCES };
  }

  try {
    const parsed: unknown = JSON.parse(value);

    return parsed && typeof parsed === "object"
      ? normalizeSoundEffectsPreferences(parsed as Partial<SoundEffectsPreferences>)
      : { ...DEFAULT_SOUND_EFFECTS_PREFERENCES };
  } catch {
    return { ...DEFAULT_SOUND_EFFECTS_PREFERENCES };
  }
}

export function readSoundEffectsPreferences(
  storage?: SoundEffectsStorage,
): SoundEffectsPreferences {
  try {
    const preferenceStorage = storage ?? window.localStorage;

    return parseSoundEffectsPreferences(
      preferenceStorage.getItem(SOUND_EFFECTS_STORAGE_KEY),
    );
  } catch {
    return { ...DEFAULT_SOUND_EFFECTS_PREFERENCES };
  }
}

export function writeSoundEffectsPreferences(
  preferences: SoundEffectsPreferences,
  storage?: SoundEffectsStorage,
): boolean {
  try {
    const preferenceStorage = storage ?? window.localStorage;
    const normalizedPreferences = normalizeSoundEffectsPreferences(preferences);

    preferenceStorage.setItem(
      SOUND_EFFECTS_STORAGE_KEY,
      JSON.stringify(normalizedPreferences),
    );
    return true;
  } catch {
    return false;
  }
}

export function getEnemyDeathSoundSource(
  enemyTypeId: EnemyTypeId | undefined,
): string | null {
  switch (enemyTypeId) {
    case "green_slime":
    case "slimeward_spitter_slime":
      return SOUND_EFFECT_SOURCES.deaths.slime;
    case "goblin_scout":
      return SOUND_EFFECT_SOURCES.deaths.goblin;
    case "bog_imp":
    case "ember_imp":
      return SOUND_EFFECT_SOURCES.deaths.imp;
    case "wolf":
      return SOUND_EFFECT_SOURCES.deaths.wolf;
    case "orc":
      return SOUND_EFFECT_SOURCES.deaths.orcGrunt;
    case "orc_raider":
      return SOUND_EFFECT_SOURCES.deaths.orcRaider;
    case "orc_shieldbearer":
      return SOUND_EFFECT_SOURCES.deaths.orcShieldbearer;
    case "orc_warmaster":
      return SOUND_EFFECT_SOURCES.deaths.orcWarmaster;
    default:
      return null;
  }
}

export function createGameSoundEffectsSnapshot(
  state: GameState,
): GameSoundEffectsSnapshot {
  const companions: GameSoundEffectsSnapshot["companions"] = {};
  const enemies: GameSoundEffectsSnapshot["enemies"] = {};

  for (const entity of Object.values(state.entities)) {
    if (entity.kind === "companion") {
      companions[entity.id] = {
        lastAttackAt: entity.lastAttackAt,
        flaskLastUsedAt: entity.consumables.flask?.lastUsedAt ?? null,
      };
    } else if (entity.kind === "enemy") {
      enemies[entity.id] = {
        alive: entity.state !== "dead" && entity.health > 0,
        enemyTypeId: entity.enemyTypeId,
      };
    }
  }

  return {
    companions,
    enemies,
    questStatuses: Object.fromEntries(
      Object.entries(state.quests).map(([questId, quest]) => [
        questId,
        quest.status,
      ]),
    ),
  };
}

export function getGameSoundEffectEvents(
  previous: GameSoundEffectsSnapshot,
  next: GameSoundEffectsSnapshot,
): GameSoundEffectEvents {
  let companionAttackCount = 0;
  let flaskUseCount = 0;
  let questCompletionCount = 0;
  const enemyDeathSources: string[] = [];

  for (const [companionId, nextCompanion] of Object.entries(next.companions)) {
    const previousCompanion = previous.companions[companionId];

    if (!previousCompanion) {
      continue;
    }
    if (nextCompanion.lastAttackAt > previousCompanion.lastAttackAt) {
      companionAttackCount += 1;
    }
    if (
      nextCompanion.flaskLastUsedAt !== null &&
      (previousCompanion.flaskLastUsedAt === null ||
        nextCompanion.flaskLastUsedAt > previousCompanion.flaskLastUsedAt)
    ) {
      flaskUseCount += 1;
    }
  }

  for (const [enemyId, nextEnemy] of Object.entries(next.enemies)) {
    const previousEnemy = previous.enemies[enemyId];
    const source = getEnemyDeathSoundSource(nextEnemy.enemyTypeId);

    if (previousEnemy?.alive && !nextEnemy.alive && source) {
      enemyDeathSources.push(source);
    }
  }

  for (const [questId, nextStatus] of Object.entries(next.questStatuses)) {
    const previousStatus = previous.questStatuses[questId];

    if (previousStatus && previousStatus !== "completed" && nextStatus === "completed") {
      questCompletionCount += 1;
    }
  }

  return {
    companionAttackCount,
    enemyDeathSources,
    flaskUseCount,
    questCompletionCount,
  };
}

export class SoundEffectsController {
  private readonly createAudio: (source: string) => SoundEffectAudio;
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly schedule: (callback: () => void, delayMs: number) => number;
  private readonly cancelSchedule: (timerId: number) => void;
  private preferences = { ...DEFAULT_SOUND_EFFECTS_PREFERENCES };
  private enabled = false;
  private hidden = false;
  private attackBag: string[] = [];
  private lastAttackSource: string | null = null;
  private lastStartedAtBySource = new Map<string, number>();
  private readonly activeByCategory: Record<
    PooledSoundCategory,
    Set<SoundEffectAudio>
  > = {
    attack: new Set(),
    death: new Set(),
    flask: new Set(),
  };
  private readonly knownAudio = new Set<SoundEffectAudio>();
  private readonly dedicatedAudio = new Map<string, SoundEffectAudio>();
  private readonly scheduledTimerIds = new Set<number>();
  private questPendingCount = 0;
  private questTimerId: number | null = null;
  private lastQuestStartedAt: number | null = null;

  constructor(options: SoundEffectsControllerOptions = {}) {
    this.createAudio = options.createAudio ?? ((source) => new Audio(source));
    this.now = options.now ?? (() => Date.now());
    this.random = options.random ?? (() => Math.random());
    this.schedule =
      options.schedule ??
      ((callback, delayMs) => window.setTimeout(callback, delayMs));
    this.cancelSchedule =
      options.cancelSchedule ?? ((timerId) => window.clearTimeout(timerId));
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.stopAll();
    }
  }

  setHidden(hidden: boolean): void {
    this.hidden = hidden;
    if (hidden) {
      this.stopAll();
    }
  }

  setPreferences(preferences: SoundEffectsPreferences): void {
    this.preferences = normalizeSoundEffectsPreferences(preferences);

    for (const audio of this.knownAudio) {
      audio.volume = this.preferences.volumePercent / 100;
      audio.muted = this.preferences.muted;
    }

    if (this.preferences.muted || this.preferences.volumePercent === 0) {
      this.stopAll();
    }
  }

  playAttack(): boolean {
    if (
      !this.canPlay() ||
      this.activeByCategory.attack.size >= CATEGORY_CAPS.attack
    ) {
      return false;
    }

    return this.playPooled(this.getNextAttackSource(), "attack");
  }

  playEnemyDeath(source: string): boolean {
    return this.playPooled(source, "death");
  }

  playFlaskBatch(count: number): void {
    if (!this.canPlay()) {
      return;
    }

    const soundCount = Math.max(0, Math.floor(count));
    for (let index = 0; index < soundCount; index += 1) {
      if (index === 0) {
        this.playPooled(SOUND_EFFECT_SOURCES.flask, "flask");
      } else {
        this.addScheduledCallback(() => {
          this.playPooled(SOUND_EFFECT_SOURCES.flask, "flask");
        }, index * FLASK_STAGGER_MS);
      }
    }
  }

  playMenuToggle(): boolean {
    return this.playDedicated("menu", SOUND_EFFECT_SOURCES.menu);
  }

  playMerchantTransaction(): boolean {
    return this.playDedicated("merchant", SOUND_EFFECT_SOURCES.merchant);
  }

  queueQuestCompletions(count: number): void {
    if (!this.canPlay()) {
      return;
    }

    this.questPendingCount += Math.max(0, Math.floor(count));
    this.scheduleNextQuestCue();
  }

  stopAll(): void {
    for (const timerId of this.scheduledTimerIds) {
      this.cancelSchedule(timerId);
    }
    this.scheduledTimerIds.clear();
    this.questTimerId = null;
    this.questPendingCount = 0;
    this.lastQuestStartedAt = null;

    const retainedAudio = new Set(this.dedicatedAudio.values());
    for (const audio of this.knownAudio) {
      this.pauseAndReset(audio);
      if (!retainedAudio.has(audio)) {
        this.knownAudio.delete(audio);
      }
    }
    for (const category of Object.keys(this.activeByCategory) as PooledSoundCategory[]) {
      this.activeByCategory[category].clear();
    }
  }

  destroy(): void {
    this.stopAll();
    this.knownAudio.clear();
    this.dedicatedAudio.clear();
  }

  private canPlay(): boolean {
    return (
      this.enabled &&
      !this.hidden &&
      !this.preferences.muted &&
      this.preferences.volumePercent > 0
    );
  }

  private getNextAttackSource(): string {
    if (this.attackBag.length === 0) {
      this.attackBag = [...SOUND_EFFECT_SOURCES.attacks];
      for (let index = this.attackBag.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(this.random() * (index + 1));
        [this.attackBag[index], this.attackBag[swapIndex]] = [
          this.attackBag[swapIndex],
          this.attackBag[index],
        ];
      }
      if (
        this.attackBag.length > 1 &&
        this.attackBag[0] === this.lastAttackSource
      ) {
        [this.attackBag[0], this.attackBag[1]] = [
          this.attackBag[1],
          this.attackBag[0],
        ];
      }
    }

    const source = this.attackBag.shift() ?? SOUND_EFFECT_SOURCES.attacks[0];
    this.lastAttackSource = source;
    return source;
  }

  private playPooled(source: string, category: PooledSoundCategory): boolean {
    if (!this.canPlay()) {
      return false;
    }

    const now = this.now();
    const lastStartedAt = this.lastStartedAtBySource.get(source);
    if (lastStartedAt !== undefined && now - lastStartedAt < REPEAT_GUARD_MS) {
      return false;
    }
    if (this.activeByCategory[category].size >= CATEGORY_CAPS[category]) {
      return false;
    }

    const audio = this.makeAudio(source);
    if (!audio) {
      return false;
    }

    this.lastStartedAtBySource.set(source, now);
    this.activeByCategory[category].add(audio);
    const cleanup = () => {
      this.activeByCategory[category].delete(audio);
      this.knownAudio.delete(audio);
    };
    audio.onended = cleanup;
    audio.onerror = cleanup;

    return this.startAudio(audio, cleanup);
  }

  private playDedicated(channel: string, source: string): boolean {
    if (!this.canPlay()) {
      return false;
    }

    let audio = this.dedicatedAudio.get(channel);
    if (!audio) {
      audio = this.makeAudio(source) ?? undefined;
      if (!audio) {
        return false;
      }
      this.dedicatedAudio.set(channel, audio);
    }

    this.pauseAndReset(audio);
    audio.onended = null;
    audio.onerror = null;
    return this.startAudio(audio, () => undefined);
  }

  private makeAudio(source: string): SoundEffectAudio | null {
    try {
      const audio = this.createAudio(source);
      audio.preload = "auto";
      audio.volume = this.preferences.volumePercent / 100;
      audio.muted = this.preferences.muted;
      this.knownAudio.add(audio);
      return audio;
    } catch {
      return null;
    }
  }

  private startAudio(audio: SoundEffectAudio, onFailure: () => void): boolean {
    try {
      audio.currentTime = 0;
      const playback = audio.play();
      if (playback) {
        void playback.catch(() => {
          this.pauseAndReset(audio);
          onFailure();
        });
      }
      return true;
    } catch {
      this.pauseAndReset(audio);
      onFailure();
      return false;
    }
  }

  private pauseAndReset(audio: SoundEffectAudio): void {
    audio.pause();
    try {
      audio.currentTime = 0;
    } catch {
      // Some browsers reject resetting media before metadata is available.
    }
  }

  private addScheduledCallback(callback: () => void, delayMs: number): number {
    let timerId = 0;
    timerId = this.schedule(() => {
      this.scheduledTimerIds.delete(timerId);
      callback();
    }, delayMs);
    this.scheduledTimerIds.add(timerId);
    return timerId;
  }

  private scheduleNextQuestCue(): void {
    if (this.questPendingCount <= 0 || this.questTimerId !== null) {
      return;
    }

    const delayMs =
      this.lastQuestStartedAt === null
        ? 0
        : Math.max(0, this.lastQuestStartedAt + QUEST_CADENCE_MS - this.now());

    if (delayMs === 0) {
      this.playNextQuestCue();
      return;
    }

    this.questTimerId = this.addScheduledCallback(() => {
      this.questTimerId = null;
      this.playNextQuestCue();
    }, delayMs);
  }

  private playNextQuestCue(): void {
    if (!this.canPlay()) {
      this.questPendingCount = 0;
      return;
    }

    this.questPendingCount -= 1;
    this.playDedicated("quest", SOUND_EFFECT_SOURCES.quest);
    this.lastQuestStartedAt = this.now();
    this.scheduleNextQuestCue();
  }
}

export function useGameSoundEffects({
  enabled,
  gameState,
  isGameMenuOpen,
  preferences,
}: {
  enabled: boolean;
  gameState: GameState;
  isGameMenuOpen: boolean;
  preferences: SoundEffectsPreferences;
}) {
  const controllerRef = useRef<SoundEffectsController | null>(null);
  const previousSnapshotRef = useRef(createGameSoundEffectsSnapshot(gameState));
  const previousEnabledRef = useRef(enabled);
  const previousMenuEnabledRef = useRef(enabled);
  const previousMenuOpenRef = useRef(isGameMenuOpen);

  if (!controllerRef.current) {
    controllerRef.current = new SoundEffectsController();
  }
  const controller = controllerRef.current;

  useEffect(() => {
    controller.setPreferences(preferences);
  }, [controller, preferences]);

  useEffect(() => {
    controller.setEnabled(enabled);
  }, [controller, enabled]);

  useEffect(() => {
    function syncVisibility() {
      controller.setHidden(document.visibilityState === "hidden");
    }

    syncVisibility();
    document.addEventListener("visibilitychange", syncVisibility);
    return () => {
      document.removeEventListener("visibilitychange", syncVisibility);
      controller.destroy();
    };
  }, [controller]);

  useEffect(() => {
    const nextSnapshot = createGameSoundEffectsSnapshot(gameState);
    const previousSnapshot = previousSnapshotRef.current;
    const wasEnabled = previousEnabledRef.current;
    previousSnapshotRef.current = nextSnapshot;
    previousEnabledRef.current = enabled;

    if (!enabled || !wasEnabled) {
      return;
    }

    const events = getGameSoundEffectEvents(previousSnapshot, nextSnapshot);
    for (let index = 0; index < events.companionAttackCount; index += 1) {
      controller.playAttack();
    }
    for (const source of events.enemyDeathSources) {
      controller.playEnemyDeath(source);
    }
    controller.playFlaskBatch(events.flaskUseCount);
    controller.queueQuestCompletions(events.questCompletionCount);
  }, [controller, enabled, gameState]);

  useEffect(() => {
    const wasEnabled = previousMenuEnabledRef.current;
    const wasOpen = previousMenuOpenRef.current;
    previousMenuEnabledRef.current = enabled;
    previousMenuOpenRef.current = isGameMenuOpen;

    if (enabled && wasEnabled && wasOpen !== isGameMenuOpen) {
      controller.playMenuToggle();
    }
  }, [controller, enabled, isGameMenuOpen]);

  const playMerchantTransaction = useCallback(() => {
    controller.playMerchantTransaction();
  }, [controller]);

  const queueQuestCompletions = useCallback(
    (count: number) => {
      controller.queueQuestCompletions(count);
    },
    [controller],
  );

  const resetGameTracking = useCallback(
    (state: GameState) => {
      previousSnapshotRef.current = createGameSoundEffectsSnapshot(state);
    },
    [],
  );

  return {
    playMerchantTransaction,
    queueQuestCompletions,
    resetGameTracking,
  };
}
