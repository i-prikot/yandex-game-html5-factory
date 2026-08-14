import { gameLog } from "../logger";

export interface YandexPlayer {
  getData(keys?: string[]): Promise<Record<string, unknown>>;
  setData(data: Record<string, unknown>, flush?: boolean): Promise<void>;
}

interface YandexSdk {
  adv?: {
    showFullscreenAdv(options: { callbacks: AdCallbacks }): void;
    showRewardedVideo(options: { callbacks: RewardedAdCallbacks }): void;
  };
  features?: { LoadingAPI?: { ready(): void } };
  getPlayer(options?: { scopes?: boolean }): Promise<YandexPlayer>;
}

interface AdCallbacks {
  onOpen?(): void;
  onClose?(wasShown?: boolean): void;
  onError?(error: unknown): void;
}

interface RewardedAdCallbacks extends AdCallbacks {
  onRewarded?(): void;
}

declare global {
  interface Window {
    YaGames?: { init(): Promise<YandexSdk> };
  }
}

function createMockPlayer(): YandexPlayer {
  const storageKey = "yandex-games-factory-player-data";
  return {
    async getData(keys?: string[]) {
      const current = JSON.parse(localStorage.getItem(storageKey) ?? "{}") as Record<string, unknown>;
      if (!keys) return current;
      return Object.fromEntries(keys.filter((key) => key in current).map((key) => [key, current[key]]));
    },
    async setData(data: Record<string, unknown>) {
      const current = JSON.parse(localStorage.getItem(storageKey) ?? "{}") as Record<string, unknown>;
      localStorage.setItem(storageKey, JSON.stringify({ ...current, ...data }));
    },
  };
}

export class YandexGamesAdapter {
  private sdk: YandexSdk | null = null;
  private mockMode = false;
  private readonly mockPlayer = createMockPlayer();

  public constructor(
    private readonly lifecycle: { onPause?(): void; onResume?(): void } = {},
  ) {}

  public async init(): Promise<void> {
    gameLog("info", "Initializing Yandex Games SDK");
    const isEnabled = import.meta.env.VITE_YGG_SDK_ENABLED !== "false";
    if (!isEnabled || !window.YaGames) {
      this.mockMode = true;
      gameLog("warn", "Yandex SDK not found, using mock mode", { isEnabled });
      return;
    }

    try {
      this.sdk = await window.YaGames.init();
      gameLog("info", "Yandex Games SDK initialized");
    } catch (error) {
      this.mockMode = true;
      gameLog("warn", "Yandex SDK initialization failed, using mock mode", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  public gameReady(): void {
    gameLog("info", "Notifying Yandex LoadingAPI that the game is ready", { mockMode: this.mockMode });
    this.sdk?.features?.LoadingAPI?.ready();
  }

  public async showFullscreenAd(): Promise<boolean> {
    gameLog("info", "Requesting fullscreen advertisement", { mockMode: this.mockMode });
    if (this.mockMode || !this.sdk?.adv) return true;
    return new Promise((resolve) => {
      this.sdk?.adv?.showFullscreenAdv({
        callbacks: {
          onOpen: () => this.lifecycle.onPause?.(),
          onClose: (wasShown) => {
            this.lifecycle.onResume?.();
            resolve(wasShown ?? true);
          },
          onError: (error) => {
            this.lifecycle.onResume?.();
            gameLog("warn", "Fullscreen advertisement failed", { error: String(error) });
            resolve(false);
          },
        },
      });
    });
  }

  public async showRewardedAd(): Promise<boolean> {
    gameLog("info", "Requesting rewarded advertisement", { mockMode: this.mockMode });
    if (this.mockMode || !this.sdk?.adv) return true;
    return new Promise((resolve) => {
      let rewarded = false;
      this.sdk?.adv?.showRewardedVideo({
        callbacks: {
          onOpen: () => this.lifecycle.onPause?.(),
          onRewarded: () => {
            rewarded = true;
          },
          onClose: () => {
            this.lifecycle.onResume?.();
            resolve(rewarded);
          },
          onError: (error) => {
            this.lifecycle.onResume?.();
            gameLog("warn", "Rewarded advertisement failed", { error: String(error) });
            resolve(false);
          },
        },
      });
    });
  }

  public async getPlayer(): Promise<YandexPlayer> {
    gameLog("info", "Requesting Yandex player", { mockMode: this.mockMode });
    if (this.mockMode || !this.sdk) return this.mockPlayer;
    try {
      return await this.sdk.getPlayer({ scopes: false });
    } catch (error) {
      gameLog("warn", "Yandex player is unavailable, using local player", { error: String(error) });
      return this.mockPlayer;
    }
  }
}
