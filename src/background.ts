const supportedHosts = ["jobvision.ir", "jobinja.ir"];

function isSupported(url?: string): boolean {
  if (!url) return false;
  try {
    const host = new URL(url).hostname;
    return supportedHosts.some((domain) => host === domain || host.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

async function updateForTab(tabId: number, url?: string): Promise<void> {
  const enabled = isSupported(url);
  await chrome.sidePanel.setOptions({ tabId, path: "sidepanel.html", enabled });
  if (enabled) await chrome.action.enable(tabId);
  else await chrome.action.disable(tabId);
}

function handleTabError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  // Tab events can race with closing or replacing a tab. That is expected and
  // there is no longer any tab state to update in that case.
  if (message.includes("No tab with id")) return;
  console.error("Could not update the extension for this tab:", error);
}

async function updateActiveTab(tabId: number): Promise<void> {
  const tab = await chrome.tabs.get(tabId);
  await updateForTab(tabId, tab.url);
}

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.runtime.onStartup.addListener(async () => {
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.tabs.onUpdated.addListener((tabId, change, tab) => {
  if (change.url || change.status === "complete") {
    void updateForTab(tabId, change.url ?? tab.url).catch(handleTabError);
  }
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  void updateActiveTab(tabId).catch(handleTabError);
});

