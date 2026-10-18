import { beforeEach, describe, expect, it, vi } from "vitest";
import { hasOpenRouterKey, removeOpenRouterKey, saveOpenRouterKey } from "./storage";

describe("OpenRouter key storage", () => {
  const values: Record<string, unknown> = {};

  beforeEach(() => {
    Object.keys(values).forEach((key) => delete values[key]);
    vi.stubGlobal("chrome", {
      storage: {
        local: {
          get: vi.fn(async (key: string) => ({ [key]: values[key] })),
          set: vi.fn(async (items: Record<string, unknown>) => { Object.assign(values, items); }),
          remove: vi.fn(async (key: string) => { delete values[key]; }),
        },
      },
    });
  });

  it("stores and removes a user-provided key", async () => {
    expect(await hasOpenRouterKey()).toBe(false);
    await saveOpenRouterKey("  test-key  ");
    expect(values.openrouterApiKey).toBe("test-key");
    expect(await hasOpenRouterKey()).toBe(true);
    await removeOpenRouterKey();
    expect(await hasOpenRouterKey()).toBe(false);
  });

  it("rejects an empty key", async () => {
    await expect(saveOpenRouterKey("   ")).rejects.toThrow(/enter an openrouter api key/i);
  });
});
