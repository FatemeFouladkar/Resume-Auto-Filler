import type { ResumeProfile } from "./types";

const PROFILES_KEY = "resumeProfiles";
const ACTIVE_KEY = "activeResumeId";
const OPENROUTER_KEY = "openrouterApiKey";

export async function loadProfiles(): Promise<ResumeProfile[]> {
  const result = await chrome.storage.local.get(PROFILES_KEY);
  return (result[PROFILES_KEY] as ResumeProfile[] | undefined) ?? [];
}

export async function saveProfile(profile: ResumeProfile): Promise<void> {
  const profiles = await loadProfiles();
  const index = profiles.findIndex((item) => item.id === profile.id);
  if (index >= 0) profiles[index] = profile;
  else profiles.unshift(profile);
  await chrome.storage.local.set({ [PROFILES_KEY]: profiles, [ACTIVE_KEY]: profile.id });
}

export async function deleteProfile(id: string): Promise<void> {
  const profiles = (await loadProfiles()).filter((item) => item.id !== id);
  const activeId = await loadActiveId();
  await chrome.storage.local.set({
    [PROFILES_KEY]: profiles,
    [ACTIVE_KEY]: activeId === id ? profiles[0]?.id ?? "" : activeId,
  });
}

export async function loadActiveId(): Promise<string> {
  const result = await chrome.storage.local.get(ACTIVE_KEY);
  return (result[ACTIVE_KEY] as string | undefined) ?? "";
}

export async function setActiveId(id: string): Promise<void> {
  await chrome.storage.local.set({ [ACTIVE_KEY]: id });
}

export async function hasOpenRouterKey(): Promise<boolean> {
  const result = await chrome.storage.local.get(OPENROUTER_KEY);
  return typeof result[OPENROUTER_KEY] === "string" && Boolean(result[OPENROUTER_KEY].trim());
}

export async function saveOpenRouterKey(value: string): Promise<void> {
  const key = value.trim();
  if (!key) throw new Error("Enter an OpenRouter API key.");
  await chrome.storage.local.set({ [OPENROUTER_KEY]: key });
}

export async function removeOpenRouterKey(): Promise<void> {
  await chrome.storage.local.remove(OPENROUTER_KEY);
}
