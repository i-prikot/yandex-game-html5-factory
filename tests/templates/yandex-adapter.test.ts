import { beforeEach, describe, expect, it, vi } from "vitest";

import { YandexGamesAdapter } from "../../templates/babylon-base/src/yandex/adapter.js";

const storage = new Map<string, string>();

beforeEach(() => {
  storage.clear();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  });
  vi.stubGlobal("window", {});
});

describe("YandexGamesAdapter", () => {
  it("uses a persistent mock player when SDK is absent", async () => {
    const adapter = new YandexGamesAdapter();
    await adapter.init();
    const player = await adapter.getPlayer();
    await player.setData({ score: 42 });

    await expect(player.getData(["score"])).resolves.toEqual({ score: 42 });
    await expect(adapter.showFullscreenAd()).resolves.toBe(true);
  });

  it("pauses for a rewarded ad and resolves the reward", async () => {
    const onPause = vi.fn();
    const onResume = vi.fn();
    const ready = vi.fn();
    vi.stubGlobal("window", {
      YaGames: {
        init: async () => ({
          features: { LoadingAPI: { ready } },
          getPlayer: vi.fn(),
          adv: {
            showFullscreenAdv: vi.fn(),
            showRewardedVideo: ({ callbacks }: { callbacks: Record<string, () => void> }) => {
              callbacks.onOpen?.();
              callbacks.onRewarded?.();
              callbacks.onClose?.();
            },
          },
        }),
      },
    });
    const adapter = new YandexGamesAdapter({ onPause, onResume });
    await adapter.init();
    adapter.gameReady();

    await expect(adapter.showRewardedAd()).resolves.toBe(true);
    expect(onPause).toHaveBeenCalledOnce();
    expect(onResume).toHaveBeenCalledOnce();
    expect(ready).toHaveBeenCalledOnce();
  });
});
