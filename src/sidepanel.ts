import "./sidepanel.css";
import { deleteProfile, hasOpenRouterKey, loadActiveId, loadProfiles, removeOpenRouterKey, saveOpenRouterKey, saveProfile, setActiveId } from "./storage";
import type { Education, Experience, FillReport, ResumeProfile } from "./types";

const app = document.querySelector<HTMLElement>("#app")!;
let profiles: ResumeProfile[] = [];
let active: ResumeProfile | undefined;
let saveTimer: number | undefined;
let apiKeyConfigured = false;

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]!);
}

function field(label: string, path: string, value: string, options: { full?: boolean; area?: boolean; placeholder?: string } = {}): string {
  const className = options.full ? "field full" : "field";
  const placeholder = escapeHtml(options.placeholder ?? "");
  const control = options.area
    ? `<textarea data-path="${path}" dir="auto" placeholder="${placeholder}">${escapeHtml(value)}</textarea>`
    : `<input data-path="${path}" dir="auto" value="${escapeHtml(value)}" placeholder="${placeholder}">`;
  return `<label class="${className}"><span>${label}</span>${control}</label>`;
}

function apiKeyCard(): string {
  return `<section class="card">
    <div class="card-header"><h2>OpenRouter API key</h2><span class="hint">${apiKeyConfigured ? "Configured" : "Required for import"}</span></div>
    <p class="hint">Stored only in this Chrome profile. It is sent only to OpenRouter when extracting a résumé.</p>
    <div class="profile-row"><input id="openrouter-key" type="password" autocomplete="off" spellcheck="false" placeholder="sk-or-v1-…"><button id="save-api-key" class="secondary">Save key</button>${apiKeyConfigured ? '<button id="remove-api-key" class="icon-btn danger-link" title="Remove API key">×</button>' : ""}</div>
  </section>`;
}

function experienceCard(item: Experience, index: number): string {
  const base = `experiences.${index}`;
  return `<div class="entry">
    <div class="entry-title"><span>Experience ${index + 1}</span><button class="remove-entry" data-remove="experience" data-index="${index}" title="Remove">×</button></div>
    <div class="grid">
      ${field("Job title", `${base}.title`, item.title)}${field("Company", `${base}.company`, item.company)}
      ${field("Location", `${base}.location`, item.location)}${field("Start date", `${base}.startDate`, item.startDate)}
      ${field("End date", `${base}.endDate`, item.endDate)}${field("Description", `${base}.description`, item.description, { full: true, area: true })}
    </div>
  </div>`;
}

function educationCard(item: Education, index: number): string {
  const base = `education.${index}`;
  return `<div class="entry">
    <div class="entry-title"><span>Education ${index + 1}</span><button class="remove-entry" data-remove="education" data-index="${index}" title="Remove">×</button></div>
    <div class="grid">
      ${field("Institution", `${base}.institution`, item.institution)}${field("Degree", `${base}.degree`, item.degree)}
      ${field("Field of study", `${base}.field`, item.field)}${field("Start date", `${base}.startDate`, item.startDate)}
      ${field("End date", `${base}.endDate`, item.endDate)}${field("Description", `${base}.description`, item.description, { full: true, area: true })}
    </div>
  </div>`;
}

function persianExperienceCard(item: Experience, index: number): string {
  const base = `persian.experiences.${index}`;
  return `<div class="entry"><div class="entry-title"><span>ترجمه سابقه ${index + 1}</span></div><div class="grid">
    ${field("عنوان شغلی", `${base}.title`, item.title)}${field("شرکت", `${base}.company`, item.company)}
    ${field("موقعیت", `${base}.location`, item.location)}${field("توضیحات", `${base}.description`, item.description, { full: true, area: true })}
  </div></div>`;
}

function persianEducationCard(item: Education, index: number): string {
  const base = `persian.education.${index}`;
  return `<div class="entry"><div class="entry-title"><span>ترجمه تحصیلات ${index + 1}</span></div><div class="grid">
    ${field("دانشگاه", `${base}.institution`, item.institution)}${field("مقطع", `${base}.degree`, item.degree)}
    ${field("رشته", `${base}.field`, item.field)}${field("توضیحات", `${base}.description`, item.description, { full: true, area: true })}
  </div></div>`;
}

function englishExperienceCard(item: Experience, index: number): string {
  const base = `english.experiences.${index}`;
  return `<div class="entry"><div class="entry-title"><span>Translated experience ${index + 1}</span></div><div class="grid">
    ${field("Job title", `${base}.title`, item.title)}${field("Company", `${base}.company`, item.company)}
    ${field("Location", `${base}.location`, item.location)}${field("Description", `${base}.description`, item.description, { full: true, area: true })}
  </div></div>`;
}

function englishEducationCard(item: Education, index: number): string {
  const base = `english.education.${index}`;
  return `<div class="entry"><div class="entry-title"><span>Translated education ${index + 1}</span></div><div class="grid">
    ${field("Institution", `${base}.institution`, item.institution)}${field("Degree", `${base}.degree`, item.degree)}
    ${field("Field of study", `${base}.field`, item.field)}${field("Description", `${base}.description`, item.description, { full: true, area: true })}
  </div></div>`;
}

function layout(body: string, footer = ""): string {
  return `<div class="shell">
    <header class="topbar"><div class="brand"><div class="mark">R</div><div><h1>Resume Auto Filler</h1><p class="subtitle">JobVision · Jobinja</p></div></div></header>
    <div class="content">${body}<p class="privacy">Your résumé stays in this browser. Nothing is uploaded to a server.</p></div>
    ${footer}
  </div>`;
}

function render(): void {
  if (!active) {
    app.innerHTML = layout(`${apiKeyCard()}<section class="card empty">
      <label class="upload-zone" for="resume-file"><span><strong>Choose a résumé</strong><small>PDF, DOCX, or TXT · max 10 MB</small></span></label>
      <input id="resume-file" type="file" accept=".pdf,.docx,.txt,application/pdf" hidden>
      <h2>Import once, reuse anywhere</h2>
      <p class="hint">Extracted text keeps its original language. You can review every value before filling a site.</p>
      <div id="status" class="status"></div>
    </section>`);
    bindEvents();
    return;
  }

  const options = profiles.map((profile) => `<option value="${profile.id}" ${profile.id === active?.id ? "selected" : ""}>${escapeHtml(profile.fileName)}</option>`).join("");
  const p = active.personal;
  const fa = active.persian;
  const en = active.english;
  const body = `${apiKeyCard()}
    <section class="card">
      <div class="card-header"><h2>Saved résumé</h2><span class="hint">${new Date(active.importedAt).toLocaleDateString()}</span></div>
      <div class="profile-row"><select id="profile-select">${options}</select><button id="upload-button" class="icon-btn" title="Import another résumé">＋</button><button id="delete-button" class="icon-btn danger-link" title="Delete this résumé">×</button></div>
      <label class="language-choice"><span>Version to use on single-language sites</span><select id="resume-language">
        <option value="english" ${(active.preferredLanguage ?? "english") === "english" ? "selected" : ""} ${active.sourceLanguage === "persian" && !active.english ? "disabled" : ""}>English${active.sourceLanguage === "english" ? " / original" : ""}${active.sourceLanguage === "persian" && !active.english ? " — re-import required" : ""}</option>
        <option value="persian" ${active.preferredLanguage === "persian" ? "selected" : ""} ${active.persian ? "" : "disabled"}>Persian${active.persian ? "" : " — re-import required"}</option>
      </select></label>
      <input id="resume-file" type="file" accept=".pdf,.docx,.txt,application/pdf" hidden>
    </section>
    <div id="status" class="status"></div>
    <section class="card"><div class="card-header"><h2>Personal details</h2></div><div class="grid">
      ${field("First name", "personal.firstName", p.firstName)}${field("Last name", "personal.lastName", p.lastName)}
      ${field("Full name", "personal.fullName", p.fullName, { full: true })}${field("Professional title", "personal.headline", p.headline, { full: true })}
      ${field("Email", "personal.email", p.email)}${field("Phone", "personal.phone", p.phone)}
      ${field("Location", "personal.location", p.location, { full: true })}${field("Website", "personal.website", p.website, { full: true })}
      ${field("LinkedIn", "personal.linkedin", p.linkedin, { full: true })}${field("GitHub", "personal.github", p.github, { full: true })}
    </div></section>
    <section class="card"><div class="card-header"><h2>Summary</h2></div>${field("About you", "summary", active.summary, { full: true, area: true })}</section>
    <section class="card"><div class="card-header"><h2>Skills & languages</h2></div><div class="grid">
      ${field("Skills (one per line or comma)", "skillsText", active.skills.join("\n"), { full: true, area: true })}
      ${field("Languages (name - proficiency)", "languagesText", active.languages.map((item) => [item.name, item.proficiency].filter(Boolean).join(" - ")).join("\n"), { full: true, area: true })}
      ${field("Certificates (one per line)", "certificationsText", active.certifications.join("\n"), { full: true, area: true })}
    </div></section>
    <section class="card"><div class="card-header"><h2>Work experience</h2><button class="secondary" data-add="experience">+ Add</button></div>${active.experiences.map(experienceCard).join("") || `<p class="hint">No experience was detected. Add it here if needed.</p>`}</section>
    <section class="card"><div class="card-header"><h2>Education</h2><button class="secondary" data-add="education">+ Add</button></div>${active.education.map(educationCard).join("") || `<p class="hint">No education was detected. Add it here if needed.</p>`}</section>`;
  const englishTranslation = active.sourceLanguage === "persian" && en ? `
    <section class="card"><div class="card-header"><h2>English version</h2><span class="hint">Review the generated translation</span></div><div class="grid">
      ${field("First name", "english.personal.firstName", en.personal.firstName)}${field("Last name", "english.personal.lastName", en.personal.lastName)}
      ${field("Full name", "english.personal.fullName", en.personal.fullName, { full: true })}${field("Professional title", "english.personal.headline", en.personal.headline, { full: true })}
      ${field("Location", "english.personal.location", en.personal.location, { full: true })}${field("Summary", "english.summary", en.summary, { full: true, area: true })}
      ${field("Skills", "englishSkillsText", en.skills.join("\n"), { full: true, area: true })}
    </div></section>
    <section class="card"><div class="card-header"><h2>English work experience</h2></div>${en.experiences.map(englishExperienceCard).join("")}</section>
    <section class="card"><div class="card-header"><h2>English education</h2></div>${en.education.map(englishEducationCard).join("")}</section>` : "";
  const bilingualBody = fa ? `${body}
    <section class="card" dir="rtl"><div class="card-header"><h2>نسخه فارسی</h2><span class="hint">ترجمه تولیدشده را بازبینی کنید</span></div><div class="grid">
      ${field("نام", "persian.personal.firstName", fa.personal.firstName)}${field("نام خانوادگی", "persian.personal.lastName", fa.personal.lastName)}
      ${field("نام کامل", "persian.personal.fullName", fa.personal.fullName, { full: true })}${field("عنوان حرفه‌ای", "persian.personal.headline", fa.personal.headline, { full: true })}
      ${field("موقعیت", "persian.personal.location", fa.personal.location, { full: true })}${field("درباره من", "persian.summary", fa.summary, { full: true, area: true })}
      ${field("مهارت‌ها", "persianSkillsText", fa.skills.join("\n"), { full: true, area: true })}
    </div></section>
    <section class="card" dir="rtl"><div class="card-header"><h2>سوابق شغلی فارسی</h2></div>${fa.experiences.map(persianExperienceCard).join("")}</section>
    <section class="card" dir="rtl"><div class="card-header"><h2>تحصیلات فارسی</h2></div>${fa.education.map(persianEducationCard).join("")}</section>${englishTranslation}` : `${body}${englishTranslation}`;
  const footer = `<footer class="footer"><button id="fill-button" class="fill-button">Fill or sync this résumé page</button></footer>`;
  app.innerHTML = layout(bilingualBody, footer);
  bindEvents();
  void updateActionButton();
}

function siteFromUrl(url?: string): "JobVision" | "Jobinja" | undefined {
  if (!url) return undefined;
  try {
    const hostname = new URL(url).hostname;
    if (hostname === "jobvision.ir" || hostname.endsWith(".jobvision.ir")) return "JobVision";
    if (hostname === "jobinja.ir" || hostname.endsWith(".jobinja.ir")) return "Jobinja";
  } catch { /* Ignore browser-internal or malformed URLs. */ }
  return undefined;
}

async function updateActionButton(): Promise<void> {
  const button = document.querySelector<HTMLButtonElement>("#fill-button");
  if (!button) return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const site = siteFromUrl(tab?.url);
  const label = site ? `Sync data with ${site}` : "Fill this résumé page";
  button.dataset.idleLabel = label;
  if (!button.disabled) button.textContent = label;
}

function setStatus(message: string, type: "success" | "error" | "info"): void {
  const status = document.querySelector<HTMLElement>("#status");
  if (!status) return;
  status.className = `status show ${type}`;
  status.textContent = message;
}

function setPath(path: string, value: string): void {
  if (!active) return;
  if (path === "skillsText") active.skills = value.split(/[\n,،]+/).map((item) => item.trim()).filter(Boolean);
  else if (path === "persianSkillsText" && active.persian) active.persian.skills = value.split(/[\n,،]+/).map((item) => item.trim()).filter(Boolean);
  else if (path === "englishSkillsText" && active.english) active.english.skills = value.split(/[\n,]+/).map((item) => item.trim()).filter(Boolean);
  else if (path === "languagesText") active.languages = value.split(/\n+/).map((line) => {
    const [name, proficiency = ""] = line.split(/\s*[-–—:]\s*/); return { name: name.trim(), proficiency: proficiency.trim() };
  }).filter((item) => item.name);
  else if (path === "certificationsText") active.certifications = value.split(/\n+/).map((item) => item.trim()).filter(Boolean);
  else {
    const parts = path.split(".");
    let target: unknown = active;
    for (let index = 0; index < parts.length - 1; index += 1) target = (target as Record<string, unknown>)[parts[index]];
    (target as Record<string, string>)[parts.at(-1)!] = value;
  }
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => { if (active) void saveProfile(active); }, 350);
}

async function importFile(file?: File): Promise<void> {
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) { setStatus("Please choose a file smaller than 10 MB.", "error"); return; }
  setStatus("Reading and extracting your résumé…", "info");
  try {
    const { parseResumeFile } = await import("./parser");
    const profile = await parseResumeFile(file);
    await saveProfile(profile);
    profiles = await loadProfiles();
    active = profile;
    render();
    setStatus("Résumé imported. Review the extracted fields below.", "success");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Could not read this file.", "error");
  }
}

function bindEvents(): void {
  document.querySelector("#save-api-key")?.addEventListener("click", async () => {
    const input = document.querySelector<HTMLInputElement>("#openrouter-key");
    try {
      await saveOpenRouterKey(input?.value ?? "");
      apiKeyConfigured = true;
      if (input) input.value = "";
      render();
      setStatus("OpenRouter API key saved in this Chrome profile.", "success");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save the API key.", "error");
    }
  });
  document.querySelector("#remove-api-key")?.addEventListener("click", async () => {
    await removeOpenRouterKey();
    apiKeyConfigured = false;
    render();
    setStatus("OpenRouter API key removed.", "success");
  });
  document.querySelector<HTMLInputElement>("#resume-file")?.addEventListener("change", (event) => void importFile((event.currentTarget as HTMLInputElement).files?.[0]));
  document.querySelector("#upload-button")?.addEventListener("click", () => document.querySelector<HTMLInputElement>("#resume-file")?.click());
  document.querySelector<HTMLSelectElement>("#profile-select")?.addEventListener("change", async (event) => {
    const id = (event.currentTarget as HTMLSelectElement).value;
    active = profiles.find((profile) => profile.id === id);
    await setActiveId(id); render();
  });
  document.querySelector<HTMLSelectElement>("#resume-language")?.addEventListener("change", async (event) => {
    if (!active) return;
    active.preferredLanguage = (event.currentTarget as HTMLSelectElement).value === "persian" ? "persian" : "english";
    await saveProfile(active);
    setStatus(`${active.preferredLanguage === "persian" ? "Persian" : "English"} will be used on single-language sites.`, "success");
  });
  document.querySelector("#delete-button")?.addEventListener("click", async () => {
    if (!active || !confirm(`Delete “${active.fileName}” from this browser?`)) return;
    await deleteProfile(active.id); profiles = await loadProfiles(); active = profiles[0]; render();
  });
  document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("[data-path]").forEach((control) => control.addEventListener("input", () => setPath(control.dataset.path!, control.value)));
  document.querySelectorAll<HTMLButtonElement>("[data-add]").forEach((button) => button.addEventListener("click", () => {
    if (!active) return;
    if (button.dataset.add === "experience") active.experiences.push({ title: "", company: "", location: "", startDate: "", endDate: "", description: "" });
    else active.education.push({ institution: "", degree: "", field: "", startDate: "", endDate: "", description: "" });
    void saveProfile(active); render();
  }));
  document.querySelectorAll<HTMLButtonElement>("[data-remove]").forEach((button) => button.addEventListener("click", () => {
    if (!active) return;
    const index = Number(button.dataset.index);
    if (button.dataset.remove === "experience") active.experiences.splice(index, 1); else active.education.splice(index, 1);
    void saveProfile(active); render();
  }));
  document.querySelector<HTMLButtonElement>("#fill-button")?.addEventListener("click", fillPage);
}

async function fillPage(): Promise<void> {
  if (!active) return;
  const button = document.querySelector<HTMLButtonElement>("#fill-button");
  if (button) { button.disabled = true; button.textContent = "Filling…"; }
  try {
    await saveProfile(active);
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab.id) throw new Error("No active browser tab was found.");
    const response = await chrome.tabs.sendMessage(tab.id, { type: "FILL_RESUME", profile: active }) as { ok: boolean; report?: FillReport; error?: string };
    if (!response.ok || !response.report) throw new Error(response.error ?? "The page could not be filled.");
    const { report } = response;
    const warning = report.warnings[0] ? ` ${report.warnings[0]}` : "";
    setStatus(report.site === "Jobinja" || report.site === "JobVision" ? `${report.filled} values synced and saved on ${report.site}.${warning}` : `${report.filled} fields filled on ${report.site}. Review the page before saving.${warning}`, report.filled ? "success" : "info");
  } catch (error) {
    setStatus(error instanceof Error && error.message.includes("Receiving end") ? "Open a supported résumé-builder page, refresh it once, and try again." : error instanceof Error ? error.message : "Could not contact this page.", "error");
  } finally {
    if (button) { button.disabled = false; button.textContent = button.dataset.idleLabel ?? "Fill this résumé page"; }
  }
}

async function init(): Promise<void> {
  [profiles, apiKeyConfigured] = await Promise.all([loadProfiles(), hasOpenRouterKey()]);
  const activeId = await loadActiveId();
  active = profiles.find((profile) => profile.id === activeId) ?? profiles[0];
  render();
}

chrome.tabs.onActivated.addListener(() => { void updateActionButton(); });
chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
  if (tab.active && (changeInfo.url || changeInfo.status === "complete")) void updateActionButton();
});

void init();
