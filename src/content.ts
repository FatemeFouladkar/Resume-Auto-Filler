import type { ContentMessage, FillReport, ResumeProfile } from "./types";

type BridgeResponse = { ok: boolean; result?: Omit<FillReport, "site" | "skipped">; error?: string };

function siteName(): string {
  if (location.hostname.endsWith("jobvision.ir")) return "JobVision";
  if (location.hostname.endsWith("jobinja.ir")) return "Jobinja";
  return location.hostname;
}

let bridgePromise: Promise<void> | undefined;

function ensurePageBridge(): Promise<void> {
  if (document.documentElement.dataset.resumeAutofillBridge === "ready") return Promise.resolve();
  if (bridgePromise) return bridgePromise;
  bridgePromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = chrome.runtime.getURL("page-bridge.js");
    script.onload = () => { script.remove(); resolve(); };
    script.onerror = () => { script.remove(); reject(new Error("Could not start the résumé sync engine.")); };
    (document.head || document.documentElement).append(script);
  });
  return bridgePromise;
}

async function syncThroughBridge(
  site: "JobVision" | "Jobinja",
  eventPrefix: "jobvision" | "jobinja",
  profile: ResumeProfile,
  timeoutMs: number,
): Promise<FillReport> {
  await ensurePageBridge();
  const requestId = crypto.randomUUID();
  const bridgeProfile: ResumeProfile = {
    ...profile,
    fileName: "",
    importedAt: "",
    sourceText: "",
    ...(site === "Jobinja" ? {
      personal: { ...profile.personal, email: "", website: "", linkedin: "", github: "" },
    } : {}),
  };
  const resultEvent = `resume-autofill:${eventPrefix}-result`;
  const response = await new Promise<BridgeResponse>((resolve, reject) => {
    const listener = (event: Event) => {
      try {
        const message = JSON.parse((event as CustomEvent<string>).detail) as BridgeResponse & { requestId?: string };
        if (message.requestId !== requestId) return;
        window.clearTimeout(timeout);
        window.removeEventListener(resultEvent, listener);
        resolve(message);
      } catch { /* Ignore unrelated page events. */ }
    };
    const timeout = window.setTimeout(() => {
      window.removeEventListener(resultEvent, listener);
      reject(new Error(`${site} sync timed out. Refresh the résumé page and try again.`));
    }, timeoutMs);
    window.addEventListener(resultEvent, listener);
    window.dispatchEvent(new CustomEvent(`resume-autofill:${eventPrefix}-sync`, {
      detail: JSON.stringify({ requestId, profile: bridgeProfile }),
    }));
  });
  if (!response.ok || !response.result) throw new Error(response.error ?? `${site} sync failed.`);
  const report: FillReport = { site, skipped: 0, ...response.result };
  showToast(report.warnings.length ? `${site} synced with ${report.warnings.length} warning(s).` : `${site} résumé synced.`, report.filled > 0);
  if (report.filled > 0) window.setTimeout(() => location.reload(), site === "JobVision" ? 1400 : 1200);
  return report;
}

async function fill(profile: ResumeProfile): Promise<FillReport> {
  if (location.hostname.endsWith("jobinja.ir") && location.pathname.startsWith("/app/cv-builder")) {
    return syncThroughBridge("Jobinja", "jobinja", profile, 30_000);
  }
  if (location.hostname.endsWith("jobvision.ir") && (location.pathname.startsWith("/my-cv") || location.pathname.startsWith("/cv-maker"))) {
    return syncThroughBridge("JobVision", "jobvision", profile, 45_000);
  }
  throw new Error("Open the JobVision or Jobinja résumé-builder page before syncing.");
}

function showToast(message: string, success: boolean): void {
  document.getElementById("resume-autofill-toast")?.remove();
  const toast = document.createElement("div");
  toast.id = "resume-autofill-toast";
  toast.textContent = message;
  Object.assign(toast.style, {
    position: "fixed", insetInlineEnd: "20px", bottom: "20px", zIndex: "2147483647",
    maxWidth: "360px", padding: "12px 16px", borderRadius: "10px", color: "white",
    background: success ? "#176b4d" : "#8a4f08", font: "14px/1.5 system-ui, sans-serif",
    boxShadow: "0 8px 30px rgba(0,0,0,.2)", direction: "auto",
  });
  document.body.append(toast);
  window.setTimeout(() => toast.remove(), 6000);
}

chrome.runtime.onMessage.addListener((message: ContentMessage, _sender, sendResponse) => {
  if (message.type === "PING") {
    sendResponse({ ok: true, site: siteName() });
    return false;
  }
  if (message.type === "FILL_RESUME") {
    void fill(message.profile)
      .then((report) => sendResponse({ ok: true, report }))
      .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }));
    return true;
  }
  return false;
});
