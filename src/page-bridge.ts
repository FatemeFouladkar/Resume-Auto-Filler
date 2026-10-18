import type { Education, Experience, LanguageItem, ResumeProfile } from "./types";

const REQUEST_EVENT = "resume-autofill:jobinja-sync";
const RESULT_EVENT = "resume-autofill:jobinja-result";
const JOBVISION_REQUEST_EVENT = "resume-autofill:jobvision-sync";
const JOBVISION_RESULT_EVENT = "resume-autofill:jobvision-result";

type Dict = Record<string, any>;
type SyncResult = { filled: number; fields: string[]; warnings: string[] };

function normalize(value: unknown): string {
  return String(value ?? "").toLocaleLowerCase().replace(/[\u200c\u200f\u202a-\u202e]/g, " ").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function latinDigits(value: string): string {
  return value.replace(/[\u06f0-\u06f9]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/[\u0660-\u0669]/g, (digit) => String(digit.charCodeAt(0) - 0x0660));
}

function resumeDate(value: string): { year?: number; month?: number; current?: boolean } {
  const clean = latinDigits(value).trim();
  if (/^(present|current|now|ongoing|Ø§Ú©Ù†ÙˆÙ†|Ø­Ø§Ù„|ØªØ§ Ú©Ù†ÙˆÙ†|ØªØ§Ú©Ù†ÙˆÙ†)$/i.test(clean)) return { current: true };
  const parts = clean.match(/(19\d{2}|20\d{2}|1[34]\d{2})(?:\D+(0?[1-9]|1[0-2]))?/);
  if (!parts) return {};
  let year = Number(parts[1]);
  const englishMonths = [
    /\bjan(?:uary)?\b/i, /\bfeb(?:ruary)?\b/i, /\bmar(?:ch)?\b/i,
    /\bapr(?:il)?\b/i, /\bmay\b/i, /\bjun(?:e)?\b/i,
    /\bjul(?:y)?\b/i, /\baug(?:ust)?\b/i, /\bsep(?:t(?:ember)?)?\b/i,
    /\boct(?:ober)?\b/i, /\bnov(?:ember)?\b/i, /\bdec(?:ember)?\b/i,
  ];
  const persianMonths = [
    /ÙØ±ÙˆØ±Ø¯ÛŒÙ†/, /Ø§Ø±Ø¯ÛŒØ¨Ù‡Ø´Øª/, /Ø®Ø±Ø¯Ø§Ø¯/, /ØªÛŒØ±/, /Ù…Ø±Ø¯Ø§Ø¯/, /Ø´Ù‡Ø±ÛŒÙˆØ±/,
    /Ù…Ù‡Ø±/, /Ø¢Ø¨Ø§Ù†/, /Ø¢Ø°Ø±/, /Ø¯ÛŒ/, /Ø¨Ù‡Ù…Ù†/, /Ø§Ø³ÙÙ†Ø¯/,
  ];
  const namedMonthIndex = year >= 1700
    ? englishMonths.findIndex((pattern) => pattern.test(clean))
    : persianMonths.findIndex((pattern) => pattern.test(clean));
  const month = namedMonthIndex >= 0 ? namedMonthIndex + 1 : parts[2] ? Number(parts[2]) : undefined;
  if (year >= 1700) {
    const sample = new Date(Date.UTC(year, (month ?? 7) - 1, 15));
    const jalali = new Intl.DateTimeFormat("en-u-ca-persian", { year: "numeric", month: "numeric", timeZone: "UTC" })
      .formatToParts(sample).reduce<Record<string, number>>((result, part) => {
        if (part.type === "year" || part.type === "month") result[part.type] = Number(part.value);
        return result;
      }, {});
    year = jalali.year;
    return { year, month: month ? jalali.month : undefined };
  }
  return { year, month };
}

function degreeLevel(value: string): string {
  const text = normalize(value);
  if (/phd|doctor|Ø¯Ú©Øª/.test(text)) return "PHD";
  if (/master|msc|Ø§Ø±Ø´Ø¯|ÙÙˆÙ‚ Ù„ÛŒØ³Ø§Ù†Ø³/.test(text)) return "master";
  if (/bachelor|bsc|Ú©Ø§Ø±Ø´Ù†Ø§Ø³ÛŒ|Ù„ÛŒØ³Ø§Ù†Ø³/.test(text)) return "bachelor";
  if (/associate|Ú©Ø§Ø±Ø¯Ø§Ù†ÛŒ|ÙÙˆÙ‚ Ø¯ÛŒÙ¾Ù„Ù…/.test(text)) return "associate";
  if (/diploma|Ø¯ÛŒÙ¾Ù„Ù…/.test(text)) return "diploma";
  return "other";
}

function languageLevel(value: string): string {
  const text = normalize(value);
  if (/native|mother|Ù…Ø§Ø¯Ø±ÛŒ|Ø¨ÙˆÙ…ÛŒ/.test(text)) return "native";
  if (/advanced|fluent|professional|Ù¾ÛŒØ´Ø±ÙØªÙ‡|Ù…Ø³Ù„Ø·/.test(text)) return "advanced";
  if (/beginner|basic|Ù…Ø¨ØªØ¯ÛŒ|Ù¾Ø§ÛŒÙ‡/.test(text)) return "beginner";
  return "intermediate";
}

function profileVm(): Dict {
  const element = document.querySelector<HTMLElement>(".c_cvProfile") as (HTMLElement & { __vue__?: Dict }) | null;
  const vm = element?.__vue__;
  if (!vm?.cv?.id) throw new Error("Jobinja rÃ©sumÃ© data is not ready. Refresh the page and try again.");
  return vm;
}

function meta(vm: Dict): Dict {
  return vm.$root?.$?._cvRoot?.meta ?? vm.$root?._cvRoot?.meta ?? {};
}

function optionValue(value: unknown): unknown {
  if (value && typeof value === "object") return (value as Dict).value ?? (value as Dict).id ?? null;
  return value ?? null;
}

async function api(cvId: string, path: string, method: "PUT" | "POST", body: Dict): Promise<Dict> {
  const token = document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content;
  const response = await fetch(`/api/v10/jobseeker-app/cv-builder/${cvId}/${path}`, {
    method,
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      ...(token ? { "X-CSRF-TOKEN": token } : {}),
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const validation = payload?.errors && typeof payload.errors === "object"
      ? Object.values(payload.errors).flat().map(String).join("; ")
      : "";
    throw new Error(validation || payload?.message || `Jobinja rejected ${path} (${response.status}).`);
  }
  return payload;
}

function idFrom(payload: Dict, key: string): string | number | undefined {
  return payload?.data?.[key]?.id ?? payload?.[key]?.id ?? payload?.data?.id;
}

function chronologicalKey(year: unknown, month: unknown): number {
  const numericYear = Number(year) || 0;
  const numericMonth = Number(month) || 0;
  return numericYear * 100 + numericMonth;
}

async function syncExperiences(cvId: string, items: Experience[], existing: Dict[], matchItems: Experience[] = items): Promise<number> {
  const used = new Set<string | number>();
  const validItems = items.filter((item) => item.title || item.company);
  const ids: Array<string | number | undefined> = [];
  for (const item of validItems) {
    const sourceItem = matchItems[items.indexOf(item)] ?? item;
    const match = existing.find((candidate) => !used.has(candidate.id) &&
      [item.title, sourceItem.title].some((title) => normalize(candidate.role) === normalize(title)) &&
      [item.company, sourceItem.company].some((company) => normalize(candidate.company) === normalize(company)));
    if (match) used.add(match.id);
    const start = resumeDate(item.startDate); const end = resumeDate(item.endDate);
    const body: Dict = { role: item.title, company: item.company, description: item.description, start_year: start.year, start_month: start.month };
    if (!end.current) { body.end_year = end.year; body.end_month = end.month; }
    Object.keys(body).forEach((key) => body[key] === undefined && delete body[key]);
    const payload = await api(cvId, match ? `experience/${match.id}` : "experience", match ? "PUT" : "POST", body);
    ids.push(match?.id ?? idFrom(payload, "work_experience"));
  }
  // Jobinja treats the final array item as the latest position in its profile
  // header. Store records oldest-to-newest even when the rÃ©sumÃ© lists newest first.
  const order = [
    ...existing.filter((item) => !used.has(item.id)).map((item) => ({
      id: item.id,
      date: chronologicalKey(item.startYear ?? item.start_year, item.startMonth ?? item.start_month),
    })),
    ...ids.map((id, index) => {
      const start = resumeDate(validItems[index].startDate);
      return { id, date: chronologicalKey(start.year, start.month) };
    }),
  ].filter((item) => item.id).sort((left, right) => left.date - right.date).map((item) => item.id);
  if (order.length && ids.every(Boolean)) await api(cvId, "experience/config/reorder", "PUT", { items: order });
  return validItems.length;
}

async function syncEducation(cvId: string, items: Education[], existing: Dict[], matchItems: Education[] = items): Promise<number> {
  const used = new Set<string | number>();
  const validItems = items.filter((item) => item.institution || item.field || item.degree);
  const ids: Array<string | number | undefined> = [];
  for (const item of validItems) {
    const title = item.field || item.degree;
    const sourceItem = matchItems[items.indexOf(item)] ?? item;
    const sourceTitle = sourceItem.field || sourceItem.degree;
    const match = existing.find((candidate) => !used.has(candidate.id) &&
      [title, sourceTitle].some((candidateTitle) => normalize(candidate.title) === normalize(candidateTitle)) &&
      [item.institution, sourceItem.institution].some((institution) => normalize(candidate.institute) === normalize(institution)));
    if (match) used.add(match.id);
    const start = resumeDate(item.startDate); const end = resumeDate(item.endDate);
    const body: Dict = { title, institute: item.institution, description: item.description, level: degreeLevel(item.degree), start_year: start.year, end_year: end.year };
    Object.keys(body).forEach((key) => body[key] === undefined && delete body[key]);
    const payload = await api(cvId, match ? `education/${match.id}` : "education", match ? "PUT" : "POST", body);
    ids.push(match?.id ?? idFrom(payload, "education"));
  }
  const order = [
    ...existing.filter((item) => !used.has(item.id)).map((item) => ({
      id: item.id,
      date: chronologicalKey(item.startYear ?? item.start_year, 0),
    })),
    ...ids.map((id, index) => {
      const start = resumeDate(validItems[index].startDate);
      return { id, date: chronologicalKey(start.year, start.month) };
    }),
  ].filter((item) => item.id).sort((left, right) => left.date - right.date).map((item) => item.id);
  if (order.length && ids.every(Boolean)) await api(cvId, "education/config/reorder", "PUT", { items: order });
  return validItems.length;
}

function languageId(item: LanguageItem, languages: Dict[]): string | number | undefined {
  const wanted = normalize(item.name);
  const match = languages.find((candidate) => [candidate.name, candidate.title, candidate.label, candidate.text, candidate.name_en, candidate.name_fa].some((value) => normalize(value) === wanted));
  return match?.id ?? match?.value;
}

async function syncLanguages(cvId: string, items: LanguageItem[], existing: Dict[], languages: Dict[]): Promise<{ count: number; missing: string[] }> {
  const missing: string[] = [];
  let count = 0;
  for (const item of items.filter((item) => item.name)) {
    const id = languageId(item, languages);
    if (!id) { missing.push(item.name); continue; }
    const match = existing.find((candidate) => String(candidate.language_id ?? candidate.language?.id ?? candidate.language?.value) === String(id));
    const addedId = match?.id ?? match?.added_language_id;
    await api(cvId, addedId ? `language/${addedId}` : "language", addedId ? "PUT" : "POST", { language_id: id, level: languageLevel(item.proficiency) });
    count += 1;
  }
  return { count, missing };
}

function jobinjaSelectedProfile(profile: ResumeProfile): ResumeProfile {
  const localized = profile.preferredLanguage === "persian" ? profile.persian : profile.english;
  if (!localized) return profile;
  return {
    ...profile,
    personal: { ...profile.personal, ...localized.personal },
    summary: localized.summary,
    skills: localized.skills,
    languages: localized.languages,
    experiences: profile.experiences.map((item, index) => ({
      ...item, ...(localized.experiences[index] ?? {}), startDate: item.startDate, endDate: item.endDate,
    })),
    education: profile.education.map((item, index) => ({
      ...item, ...(localized.education[index] ?? {}), startDate: item.startDate, endDate: item.endDate,
    })),
    certifications: localized.certifications,
  };
}

async function sync(profile: ResumeProfile): Promise<SyncResult> {
  const vm = profileVm(); const cv = vm.cv; const cvId = String(cv.id); const rootMeta = meta(vm);
  const selected = jobinjaSelectedProfile(profile);
  const fullName = selected.personal.fullName || [selected.personal.firstName, selected.personal.lastName].filter(Boolean).join(" ");
  const scalarJobs: Array<{ name: string; run: () => Promise<number> }> = [];
  const collectionJobs: Array<{ name: string; run: () => Promise<number> }> = [];
  if (fullName || selected.personal.headline) scalarJobs.push({ name: "basic details", run: async () => { await api(cvId, "basic-data", "PUT", { working_status: optionValue(cv.seekingStatus ?? cv.workingStatus), job_title: selected.personal.headline || cv.jobTitle || "", full_name: fullName || cv.fullName || "" }); return 2; } });
  if (selected.summary) scalarJobs.push({ name: "about", run: async () => { await api(cvId, "about", "PUT", { about: selected.summary }); return 1; } });
  if (selected.skills.length) scalarJobs.push({ name: "skills", run: async () => { await api(cvId, "skills", "PUT", { skills: selected.skills }); return selected.skills.length; } });
  if (selected.personal.phone || selected.personal.location) scalarJobs.push({ name: "personal details", run: async () => {
    await api(cvId, "personal", "PUT", { current_province_id: optionValue(cv.currentProvince ?? cv.currentProvinceId), address: selected.personal.location || cv.address || "", cell_number: selected.personal.phone || cv.cellNumber || "", marital_status: optionValue(cv.maritalStatus), gender: optionValue(cv.gender), military_service_status: optionValue(cv.militaryServiceStatus), birth_year: cv.birthYear ?? null }); return 2;
  } });
  if (selected.experiences.length) collectionJobs.push({ name: "work experience", run: () => syncExperiences(cvId, selected.experiences, cv.workExperiences ?? [], profile.experiences) });
  if (selected.education.length) collectionJobs.push({ name: "education", run: () => syncEducation(cvId, selected.education, cv.educations ?? [], profile.education) });

  let missingLanguages: string[] = [];
  if (selected.languages.length) collectionJobs.push({ name: "languages", run: async () => { const result = await syncLanguages(cvId, selected.languages, cv.languages ?? [], rootMeta.languages ?? []); missingLanguages = result.missing; return result.count; } });
  const scalarResults = await Promise.allSettled(scalarJobs.map((job) => job.run()));
  const collectionResults: PromiseSettledResult<number>[] = [];
  for (const job of collectionJobs) {
    try { collectionResults.push({ status: "fulfilled", value: await job.run() }); }
    catch (reason) { collectionResults.push({ status: "rejected", reason }); }
  }
  const jobs = [...scalarJobs, ...collectionJobs];
  const settled = [...scalarResults, ...collectionResults];
  const fields: string[] = []; const warnings: string[] = []; let filled = 0;
  settled.forEach((result, index) => {
    if (result.status === "fulfilled") { filled += result.value; fields.push(jobs[index].name); }
    else warnings.push(`${jobs[index].name}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`);
  });
  if (missingLanguages.length) warnings.push(`Jobinja did not recognize: ${missingLanguages.join(", ")}.`);
  if (selected.certifications.length) warnings.push("Jobinja has no dedicated certificates section; certificates were left unchanged.");
  return { filled, fields, warnings };
}

window.addEventListener(REQUEST_EVENT, (event) => {
  const detail = (event as CustomEvent<string>).detail;
  void (async () => {
    try {
      const { requestId, profile } = JSON.parse(detail) as { requestId: string; profile: ResumeProfile };
      const result = await sync(profile);
      window.dispatchEvent(new CustomEvent(RESULT_EVENT, { detail: JSON.stringify({ requestId, ok: true, result }) }));
    } catch (error) {
      const requestId = (() => { try { return JSON.parse(detail).requestId; } catch { return ""; } })();
      window.dispatchEvent(new CustomEvent(RESULT_EVENT, { detail: JSON.stringify({ requestId, ok: false, error: error instanceof Error ? error.message : String(error) }) }));
    }
  })();
});

document.documentElement.dataset.resumeAutofillJobinjaBridge = "ready";
document.documentElement.dataset.resumeAutofillBridge = "ready";

function nestedAccessToken(value: unknown, depth = 0, visited = new Set<object>()): string | undefined {
  if (depth > 10 || value == null) return undefined;

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed || (!trimmed.startsWith("{") && !trimmed.startsWith("["))) return undefined;
    try { return nestedAccessToken(JSON.parse(trimmed), depth + 1, visited); }
    catch { return undefined; }
  }

  if (typeof value !== "object" || visited.has(value)) return undefined;
  visited.add(value);

  const record = value as Record<string, unknown>;
  for (const [key, candidate] of Object.entries(record)) {
    const normalizedKey = key.replace(/[_-]/g, "").toLowerCase();
    if (normalizedKey === "accesstoken" && typeof candidate === "string" && candidate.trim().length > 20) {
      return candidate.trim();
    }
  }
  for (const candidate of Object.values(record)) {
    const token = nestedAccessToken(candidate, depth + 1, visited);
    if (token) return token;
  }
  return undefined;
}

function jobvisionToken(): string {
  // angular-auth-oidc-client stores JobVision's auth result under this config ID.
  // Check it first, then scan all entries to remain compatible with future config changes.
  for (const storage of [localStorage, sessionStorage]) {
    const preferred = storage.getItem("CandidateClient_v2");
    if (preferred) {
      const token = nestedAccessToken(preferred);
      if (token) return token;
    }

    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (!key || key === "CandidateClient_v2") continue;
      const raw = storage.getItem(key);
      if (!raw) continue;
      const token = nestedAccessToken(raw);
      if (token) return token;
    }
  }
  throw new Error("JobVision access token was not found in its OIDC session. Sign in, wait for /my-cv to finish loading, then try again.");
}

async function jobvisionApi(path: string, method: "GET" | "POST" = "GET", body?: Dict, base = "https://candidateapi.jobvision.ir/api"): Promise<any> {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      Accept: "application/json, text/plain, */*",
      Authorization: `Bearer ${jobvisionToken()}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = payload?.message ?? payload?.title ?? payload?.errors ?? payload?.Messages;
    throw new Error(typeof detail === "string" ? detail : detail ? JSON.stringify(detail).slice(0, 500) : `JobVision rejected ${path} (${response.status}).`);
  }
  return payload?.data ?? payload;
}

function arrayFrom(value: any, keys: string[]): Dict[] {
  if (Array.isArray(value)) return value;
  for (const key of keys) if (Array.isArray(value?.[key])) return value[key];
  return [];
}

function gregorianResumeDate(value: string): { year?: number; month?: number; current?: boolean } {
  const clean = latinDigits(value).trim();
  if (/^(present|current|now|ongoing|Ø§Ú©Ù†ÙˆÙ†|Ø­Ø§Ù„|ØªØ§ Ú©Ù†ÙˆÙ†|ØªØ§Ú©Ù†ÙˆÙ†)$/i.test(clean)) return { current: true };
  const year = Number(clean.match(/(?:19|20)\d{2}/)?.[0] ?? 0) || undefined;
  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const monthIndex = months.findIndex((month) => new RegExp(`\\b${month}`, "i").test(clean));
  const numericMonth = clean.match(/(?:19|20)\d{2}\D+(0?[1-9]|1[0-2])/i)?.[1];
  return { year, month: monthIndex >= 0 ? monthIndex + 1 : numericMonth ? Number(numericMonth) : undefined };
}

function jobvisionDegree(value: string): number | undefined {
  const text = normalize(value);
  if (/ph\s*d|doctor|Ø¯Ú©Øª/.test(text)) return 4;
  if (/master|m\s*(?:sc|s|a)\b|Ø§Ø±Ø´Ø¯|ÙÙˆÙ‚ Ù„ÛŒØ³Ø§Ù†Ø³/.test(text)) return 3;
  if (/bachelor|b\s*(?:sc|s|a|eng)\b|Ú©Ø§Ø±Ø´Ù†Ø§Ø³ÛŒ|Ù„ÛŒØ³Ø§Ù†Ø³/.test(text)) return 2;
  if (/associate|Ú©Ø§Ø±Ø¯Ø§Ù†ÛŒ|ÙÙˆÙ‚ Ø¯ÛŒÙ¾Ù„Ù…/.test(text)) return 1;
  return undefined;
}

function bestNamedMatch(items: Dict[], wanted: string): Dict | undefined {
  const target = normalize(wanted);
  if (!target) return undefined;
  const names = (item: Dict) => Object.values(item).filter((value): value is string => typeof value === "string");
  const direct = items.find((item) => names(item)
    .some((value) => normalize(value) === target))
    ?? items.find((item) => names(item)
      .some((value) => normalize(value).includes(target) || target.includes(normalize(value))));
  if (direct) return direct;

  const targetTokens = new Set(target.split(" ").filter((token) => token.length >= 3));
  if (!targetTokens.size) return undefined;
  return items.map((item) => {
    const score = Math.max(0, ...names(item).map((value) => {
      const candidateTokens = new Set(normalize(value).split(" ").filter((token) => token.length >= 3));
      const overlap = [...targetTokens].filter((token) => candidateTokens.has(token)).length;
      return overlap / targetTokens.size;
    }));
    return { item, score };
  }).filter(({ score }) => score >= 0.5).sort((left, right) => right.score - left.score)[0]?.item;
}

function exactNamedMatch(items: Dict[], wanted: string): Dict | undefined {
  const target = normalize(wanted);
  if (!target) return undefined;
  return items.find((item) => [item.titleFa, item.titleEn, item.nameFa, item.nameEn, item.title, item.name]
    .some((value) => typeof value === "string" && normalize(value) === target));
}

function jobvisionTelephone(value: string, existing: unknown): string | undefined {
  let digits = latinDigits(value).replace(/\D/g, "");
  if (digits.startsWith("0098")) digits = digits.slice(4);
  else if (digits.startsWith("98")) digits = digits.slice(2);
  if (/^9\d{9}$/.test(digits)) digits = `0${digits}`;
  if (/^09\d{9}$/.test(digits)) return digits;

  // JobVision only accepts Iranian mobile numbers here. Avoid making an
  // otherwise valid profile update fail when a rÃ©sumÃ© has a foreign or
  // malformed number; retain the already validated account value instead.
  return typeof existing === "string" && existing.trim() ? existing.trim() : undefined;
}

function jobvisionSeniorityId(title: string, levels: Dict[]): string | number | undefined {
  const normalized = normalize(title);
  let wanted = "Specialist";
  if (/intern|trainee|Ú©Ø§Ø±Ø¢Ù…ÙˆØ²/.test(normalized)) wanted = "Internship";
  else if (/ceo|chief executive|business head|founder|Ù…Ø¯ÛŒØ±Ø¹Ø§Ù…Ù„/.test(normalized)) wanted = "CEO / Business Head";
  else if (/vice president|\bvp\b|director|head of|principal|Ù…Ø¯ÛŒØ± Ø§Ø±Ø´Ø¯|Ù…Ø¹Ø§ÙˆÙ†/.test(normalized)) wanted = "Deputy / Senior Manager";
  else if (/manager|team lead|tech lead|Ù…Ø¯ÛŒØ±|Ø³Ø±Ù¾Ø±Ø³Øª/.test(normalized)) wanted = "Manager";
  else if (/senior|\bsr\b|Ø§Ø±Ø´Ø¯/.test(normalized)) wanted = "Senior Specialist";
  else if (/worker|labor|labour|Ú©Ø§Ø±Ú¯Ø±/.test(normalized)) wanted = "Worker";
  else if (/assistant|clerk|employee|Ú©Ø§Ø±Ù…Ù†Ø¯/.test(normalized)) wanted = "Employee";
  return bestNamedMatch(levels, wanted)?.id ?? bestNamedMatch(levels, "Specialist")?.id;
}

function jobvisionCategoryId(title: string, categories: Dict[], fallback?: string | number): string | number | undefined {
  const text = normalize(title);
  let slug: string | undefined;
  if (/backend|front ?end|full ?stack|software engineer|software developer|developer|programmer|Ø¨Ø±Ù†Ø§Ù…Ù‡ Ù†ÙˆÛŒØ³|Ù†Ø±Ù… Ø§ÙØ²Ø§Ø±/.test(text)) slug = "developer";
  if (/\bqa\b|quality assurance|software test|test engineer|ØªØ³Øª Ù†Ø±Ù… Ø§ÙØ²Ø§Ø±/.test(text)) slug = "software-qa";
  if (/devops|site reliability|\bsre\b|network|system admin|cloud engineer/.test(text)) slug = "network";
  if (/data scientist|data engineer|machine learning|\bai\b|Ù‡ÙˆØ´ Ù…ØµÙ†ÙˆØ¹ÛŒ|Ø¹Ù„ÙˆÙ… Ø¯Ø§Ø¯Ù‡/.test(text)) slug = "data-science";
  if (/\bui\b|\bux\b|product designer|user experience|user interface/.test(text)) slug = "ui-ux";
  if (/product manager|product owner/.test(text)) slug = "product-manager";
  if (/digital marketing|\bseo\b|growth marketer/.test(text)) slug = "digital-marketing";
  if (/sales|account executive|business development/.test(text)) slug = "sales";
  if (/content|copywriter|writer|editor|translator/.test(text)) slug = "content";
  if (/customer support|customer success|account manager/.test(text)) slug = "customer-support";
  if (/accountant|accounting|finance|financial/.test(text)) slug = "accounting";
  if (/human resources|\bhr\b|recruiter|talent acquisition/.test(text)) slug = "human-resources";
  if (/project manager|operations manager|industrial engineer/.test(text)) slug = "industrial";
  if (/business analyst|strategy|business analysis/.test(text)) slug = "business-development";
  return categories.find((item) => item.urlTitle === slug)?.id ?? fallback;
}

async function syncJobvision(profile: ResumeProfile): Promise<SyncResult> {
  // JobVision always has separate language fields. Use the generated English
  // version even when the uploaded résumé itself was Persian.
  profile = profile.english ? { ...jobinjaSelectedProfile({ ...profile, preferredLanguage: "english" }), preferredLanguage: profile.preferredLanguage } : profile;
  const fields: string[] = []; const warnings: string[] = []; let filled = 0;
  const run = async (name: string, action: () => Promise<number>) => {
    try { const count = await action(); filled += count; fields.push(name); }
    catch (error) { warnings.push(`${name}: ${error instanceof Error ? error.message : String(error)}`); }
  };

  const [basic, workResponse, educationResponse, seniorityResponse, categoryResponse] = await Promise.all([
    jobvisionApi("/v1/MyCv/GetCvBasicInfo"),
    jobvisionApi("/v1/MyCv/GetWorkExperiences"),
    jobvisionApi("/v1/MyCv/GetEducations"),
    jobvisionApi("/v1/Basedata/GetListOfSeniorityLevels"),
    jobvisionApi("/v1/Basedata/GetListOfJobCategories"),
  ]);
  const existingWork = arrayFrom(workResponse, ["listOfWorkExpriences", "listOfWorkExperiences", "items"]);
  const existingEducation = arrayFrom(educationResponse, ["listOfEducations", "educations", "items"]);
  const seniorityLevels = arrayFrom(seniorityResponse, ["listOfSeniorityLevels", "seniorityLevels", "items"]);
  const jobCategories = arrayFrom(categoryResponse, ["listOfJobCategories", "jobCategories", "items"]);
  const profileCategoryId = basic.jobCategories?.[0]?.id ?? basic.jobCategories?.[0];
  const residenceCityId = basic.residenceCityId ?? basic.residenceCity?.id;
  const firstName = profile.personal.firstName || profile.personal.fullName.split(/\s+/u)[0] || "";
  const lastName = profile.personal.lastName || profile.personal.fullName.split(/\s+/u).slice(1).join(" ");
  const firstNameFa = profile.persian?.personal.firstName || firstName;
  const lastNameFa = profile.persian?.personal.lastName || lastName;

  await Promise.all([
    run("basic details", async () => {
      await jobvisionApi("/v1/MyCv/UpdateBasicInfo", "POST", {
        firstNameFa: firstNameFa || basic.firstNameFa, firstNameEn: firstName || basic.firstNameEn,
        lastNameFa: lastNameFa || basic.lastNameFa, lastNameEn: lastName || basic.lastNameEn,
        genderId: basic.genderId ?? basic.gender?.id, marriageStatusId: basic.marriageStatusId ?? basic.marriageStatus?.id,
        militaryServiceStatusId: basic.militaryServiceStatusId ?? basic.militaryServiceStatus?.id,
        residenceCityId: basic.residenceCityId ?? basic.residenceCity?.id,
        // JobVision expects residenceRegion as an IdTitleDto, while
        // jobCategories below is an array of integer IDs.
        residenceRegion: basic.residenceRegion ?? null,
        birthDateYear: basic.birthDateYear, birthDateMonth: basic.birthDateMonth, birthDateDay: basic.birthDateDay,
        telephone: jobvisionTelephone(profile.personal.phone, basic.telephone), salaryId: basic.salaryId ?? basic.salary?.id,
        jobCategories: (basic.jobCategories ?? []).map((item: any) => item?.id ?? item).filter((id: any) => Number.isInteger(Number(id))).map(Number),
        nationalityId: basic.nationalityId ?? basic.nationality?.id ?? 1,
        disabilityTypeId: basic.disabilityTypeId ?? basic.disabilityType?.id ?? null,
      });
      return 4;
    }),
    profile.summary || profile.personal.headline ? run("about", async () => {
      await jobvisionApi("/v1/MyCv/UpdateAboutMe", "POST", {
        aboutMeFa: profile.persian?.summary || profile.summary, aboutMeEn: profile.summary,
        linkedInUrl: profile.personal.linkedin || "",
        workExperienceTitleFa: profile.persian?.personal.headline || profile.personal.headline,
        workExperienceTitleEn: profile.personal.headline,
      });
      return 4;
    }) : Promise.resolve(),
  ]);

  await run("work experience", async () => {
    let count = 0;
    for (const [itemIndex, item] of profile.experiences.entries()) {
      if (!item.title && !item.company) continue;
      const faItem = profile.persian?.experiences[itemIndex] ?? item;
      const existing = existingWork.find((candidate) =>
        [candidate.roleTitleEn, candidate.roleTitleFa].some((value) => [item.title, faItem.title].some((title) => normalize(value) === normalize(title))) &&
        [candidate.companyEn, candidate.companyFa].some((value) => [item.company, faItem.company].some((company) => normalize(value) === normalize(company))));
      const suggestionResponse = await jobvisionApi(`/v1/Cv/GetListOfSuggestedJobTitles?keyword=${encodeURIComponent(item.title)}`);
      const suggestion = arrayFrom(suggestionResponse, ["items"])[0];
      const startFa = resumeDate(item.startDate); const endFa = resumeDate(item.endDate);
      const startEn = gregorianResumeDate(item.startDate); const endEn = gregorianResumeDate(item.endDate);
      const current = Boolean(endFa.current || endEn.current);
      const body: Dict = {
        ...(existing ?? {}), id: existing?.id,
        roleTitleFa: faItem.title, roleTitleEn: item.title, companyFa: faItem.company, companyEn: item.company,
        achievementsDescFa: faItem.description, achievementsDescEn: item.description,
        jobCategoryId: existing?.jobCategoryId ?? existing?.jobCategory?.id
          ?? suggestion?.jobCategoryId ?? suggestion?.jobCategory?.id
          ?? jobvisionCategoryId(item.title, jobCategories, profileCategoryId),
        seniorityId: existing?.seniorityId ?? existing?.seniority?.id ?? suggestion?.seniorityLevelId ?? jobvisionSeniorityId(item.title, seniorityLevels),
        industryId: existing?.industryId ?? null, countryId: existing?.countryId ?? 1,
        cityId: existing?.cityId ?? existing?.city?.id ?? residenceCityId, isMyCurrentJob: current,
        startYear: startFa.year, startMonth: startFa.month,
        startYearEn: startEn.year, startMonthEn: startEn.month,
      };
      if (!current) Object.assign(body, { finishYear: endFa.year, finishMonth: endFa.month, finishYearEn: endEn.year, finishMonthEn: endEn.month });
      Object.keys(body).forEach((key) => body[key] === undefined && delete body[key]);
      await jobvisionApi("/v1/MyCv/SaveWorkExperience", "POST", body);
      count += 1;
    }
    return count;
  });

  await run("education", async () => {
    const academicResponse = await jobvisionApi("/v2.0/Education/GetListOfEducationFields", "GET", undefined, "https://basedataapi.jobvision.ir/api");
    const academicFields = arrayFrom(academicResponse, ["items"]);
    let count = 0;
    for (const [itemIndex, item] of profile.education.entries()) {
      const faItem = profile.persian?.education[itemIndex] ?? item;
      const existing = existingEducation.find((candidate) =>
        [candidate.universityEn, candidate.universityFa].some((value) => [item.institution, faItem.institution].some((institution) => normalize(value) === normalize(institution))));
      const academic = bestNamedMatch(academicFields, item.field);
      const degreeLevel = jobvisionDegree(item.degree);
      if (!existing && (!academic || !degreeLevel)) { warnings.push(`education: could not map degree or field for ${item.institution || item.field}.`); continue; }
      const start = resumeDate(item.startDate); const end = resumeDate(item.endDate);
      await jobvisionApi("/v1/MyCv/SaveEducation", "POST", {
        ...(existing ?? {}), id: existing?.id, universityFa: faItem.institution, universityEn: item.institution,
        academicFieldId: existing?.academicFieldId ?? existing?.academicField?.id ?? academic?.id ?? academic?.value,
        degreeLevel: degreeLevel ?? existing?.degreeLevel,
        startYear: start.year, finishYear: end.year, isRemaining: Boolean(end.current),
      });
      count += 1;
    }
    return count;
  });

  if (profile.languages.length) await run("languages", async () => {
    const [languagesResponse, levelsResponse, savedResponse] = await Promise.all([
      jobvisionApi("/v2.0/Language/GetListOfLanguages", "GET", undefined, "https://basedataapi.jobvision.ir/api"),
      jobvisionApi("/v1/Basedata/GetListOfLanguageLevels"),
      jobvisionApi("/v1/MyCv/GetLanguage"),
    ]);
    const languages = arrayFrom(languagesResponse, ["items"]); const levels = arrayFrom(levelsResponse, ["items"]);
    const saved = arrayFrom(savedResponse, ["listOfLanguages", "items"]); let count = 0;
    for (const item of profile.languages) {
      const language = bestNamedMatch(languages, item.name); const level = bestNamedMatch(levels, item.proficiency);
      if (!language) { warnings.push(`languages: JobVision did not recognize ${item.name}.`); continue; }
      if (saved.some((candidate) => String(candidate.languageId ?? candidate.language?.id) === String(language.id))) continue;
      await jobvisionApi("/v1/MyCv/SaveLanguage", "POST", { languageId: language.id, skillLevelId: level?.id ?? levels[Math.floor(levels.length / 2)]?.id });
      count += 1;
    }
    return count;
  });
  if (profile.skills.length) await run("skills", async () => {
    const [groupsResponse, levelsResponse, savedResponse, savedOtherResponse] = await Promise.all([
      jobvisionApi("/v1/Basedata/GetListOfSoftwares"),
      jobvisionApi("/v2.0/Software/GetListOfSoftwareSkillLevels", "GET", undefined, "https://basedataapi.jobvision.ir/api"),
      jobvisionApi("/v1/MyCv/GetSoftware"),
      jobvisionApi("/v1/MyCv/GetListOfOtherSkills"),
    ]);
    const groups = arrayFrom(groupsResponse, ["softwareGroups", "items"]);
    const softwares = groups.flatMap((group) => arrayFrom(group?.listOfSoftwares ?? group?.softwares, ["items"]));
    const levels = arrayFrom(levelsResponse, ["softwareSkillLevels", "items"]);
    const saved = arrayFrom(savedResponse, ["listOfSoftwareSkills", "softwares", "items"]);
    const savedOther = arrayFrom(savedOtherResponse, ["listOfOtherSkills", "skills", "items"]);
    const defaultLevel = bestNamedMatch(levels, "Intermediate")
      ?? bestNamedMatch(levels, "Ù…ØªÙˆØ³Ø·")
      ?? levels[Math.floor(levels.length / 2)];

    const otherAdditions: Array<{ title: string; isPersian: boolean }> = [];
    const additions: Array<{ softwareId: string | number; skillLevelId: string | number }> = [];
    for (const [skillIndex, skill] of profile.skills.entries()) {
      // Software names must be exact. Fuzzy matching can silently turn a
      // rÃ©sumÃ© skill into an unrelated JobVision catalog entry.
      const software = exactNamedMatch(softwares, skill);
      if (!software?.id || !defaultLevel?.id) {
        // JobVision keeps complementary skills in separate Persian and
        // English lists, so create one correctly localized record per list.
        const localized = [
          { title: profile.persian?.skills[skillIndex] || skill, isPersian: true },
          { title: skill, isPersian: false },
        ];
        for (const candidateSkill of localized) {
          if (!savedOther.some((candidate) => normalize(candidate.title) === normalize(candidateSkill.title) && Boolean(candidate.isPersian) === candidateSkill.isPersian)) {
            otherAdditions.push(candidateSkill);
          }
        }
        continue;
      }
      if (saved.some((candidate) => String(candidate.id ?? candidate.softwareId ?? candidate.software?.id) === String(software.id))) continue;
      additions.push({ softwareId: software.id, skillLevelId: defaultLevel.id });
    }
    await Promise.all([
      ...additions.map((body) => jobvisionApi("/v1/MyCv/SaveSoftware", "POST", body)),
      ...otherAdditions.map((body) => jobvisionApi("/v1/MyCv/AddOtherSkill", "POST", body)),
    ]);
    return additions.length + otherAdditions.length;
  });
  if (profile.certifications.length) warnings.push("JobVision course/certificate mapping is not enabled yet; certificates were left unchanged.");
  return { filled, fields, warnings };
}

window.addEventListener(JOBVISION_REQUEST_EVENT, (event) => {
  const detail = (event as CustomEvent<string>).detail;
  void (async () => {
    let requestId = "";
    try {
      const request = JSON.parse(detail) as { requestId: string; profile: ResumeProfile };
      requestId = request.requestId;
      const result = await syncJobvision(request.profile);
      window.dispatchEvent(new CustomEvent(JOBVISION_RESULT_EVENT, { detail: JSON.stringify({ requestId, ok: true, result }) }));
    } catch (error) {
      window.dispatchEvent(new CustomEvent(JOBVISION_RESULT_EVENT, { detail: JSON.stringify({ requestId, ok: false, error: error instanceof Error ? error.message : String(error) }) }));
    }
  })();
});
