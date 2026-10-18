
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseResumeText } from "./parser";

vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: {
    workerSrc: "",
  },
  getDocument: vi.fn(),
}));

vi.mock("pdfjs-dist/build/pdf.worker.min.mjs?url", () => ({
  default: "mock-pdf-worker.js",
}));

const resumeText = `
Fateme Fouladkar
Backend Software Engineer
fateme@example.com
+98 915 123 4567

SUMMARY
Backend Software Engineer with 4 years of experience.

SKILLS
Python
Django
FastAPI

EXPERIENCE
Backend Developer
Example Company
Jun 2022 - May 2025
Built REST APIs using Django.

EDUCATION
Example University
B.S. Computer Engineering
2018 - 2022
`.trim();

const englishVersion = {
  personal: {
    firstName: "Fateme", lastName: "Fouladkar", fullName: "Fateme Fouladkar",
    headline: "Backend Software Engineer", location: "",
  },
  summary: "Backend Software Engineer with 4 years of experience.",
  skills: ["Python", "Django", "FastAPI"],
  languages: [],
  experiences: [{
    title: "Backend Developer", company: "Example Company", location: "",
    startDate: "Jun 2022", endDate: "May 2025", description: "Built REST APIs using Django.",
  }],
  education: [{
    institution: "Example University", degree: "B.S.", field: "Computer Engineering",
    startDate: "2018", endDate: "2022", description: "",
  }],
  certifications: [],
};

const extractedResume = {
  personal: {
    firstName: "Fateme",
    lastName: "Fouladkar",
    fullName: "Fateme Fouladkar",
    headline: "Backend Software Engineer",
    email: "fateme@example.com",
    phone: "+98 915 123 4567",
    location: "",
    website: "",
    linkedin: "",
    github: "",
  },
  summary: "Backend Software Engineer with 4 years of experience.",
  skills: ["Python", "Django", "FastAPI"],
  languages: [],
  experiences: [
    {
      title: "Backend Developer",
      company: "Example Company",
      location: "",
      startDate: "Jun 2022",
      endDate: "May 2025",
      description: "Built REST APIs using Django.",
    },
  ],
  education: [
    {
      institution: "Example University",
      degree: "B.S.",
      field: "Computer Engineering",
      startDate: "2018",
      endDate: "2022",
      description: "",
    },
  ],
  certifications: [],
  english: englishVersion,
  persian: {
    personal: {
      firstName: "فاطمه", lastName: "فولادکار", fullName: "فاطمه فولادکار",
      headline: "مهندس نرم‌افزار Backend", location: "",
    },
    summary: "مهندس نرم‌افزار Backend با ۴ سال تجربه.",
    skills: ["Python", "Django", "FastAPI"],
    languages: [],
    experiences: [{
      title: "توسعه‌دهنده Backend", company: "Example Company", location: "",
      startDate: "Jun 2022", endDate: "May 2025",
      description: "REST APIها را با Django توسعه داد.",
    }],
    education: [{
      institution: "Example University", degree: "کارشناسی", field: "مهندسی کامپیوتر",
      startDate: "2018", endDate: "2022", description: "",
    }],
    certifications: [],
  },
};

function mockCompletion(
  content: string,
  finishReason = "stop",
) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            finish_reason: finishReason,
            message: {
              role: "assistant",
              content,
            },
          },
        ],
      }),
    }),
  );
}

describe("parseResumeText (OpenRouter)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();

    vi.stubGlobal("chrome", {
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({
            openrouterApiKey: "test-api-key",
          }),
        },
      },
    });
  });

  it("parses a normal JSON object", async () => {
    mockCompletion(JSON.stringify(extractedResume));

    const result = await parseResumeText(
      resumeText,
      "resume.pdf",
    );

    expect(result.fileName).toBe("resume.pdf");
    expect(result.sourceText).toBe(resumeText);
    expect(result.personal.fullName).toBe("Fateme Fouladkar");
    expect(result.personal.email).toBe("fateme@example.com");
    expect(result.skills).toContain("Python");
    expect(result.experiences).toHaveLength(1);
    expect(result.education).toHaveLength(1);
  });

  it("accepts a single-element array returned by the model", async () => {
    mockCompletion(JSON.stringify([extractedResume]));

    const result = await parseResumeText(resumeText);

    expect(result.personal.fullName).toBe("Fateme Fouladkar");
    expect(result.skills).toContain("Django");
    expect(result.experiences[0].company).toBe("Example Company");
  });

  it("accepts JSON wrapped in Markdown code fences", async () => {
    mockCompletion(
      "```json\n" + JSON.stringify(extractedResume) + "\n```",
    );

    const result = await parseResumeText(resumeText);

    expect(result.personal.email).toBe("fateme@example.com");
  });

  it("rejects arrays containing multiple resume objects", async () => {
    mockCompletion(
      JSON.stringify([extractedResume, extractedResume]),
    );

    await expect(
      parseResumeText(resumeText),
    ).rejects.toThrow(/incomplete resume structure/i);
  });

  it("rejects an incomplete resume structure", async () => {
    mockCompletion(
      JSON.stringify({
        personal: extractedResume.personal,
        skills: extractedResume.skills,
      }),
    );

    await expect(
      parseResumeText(resumeText),
    ).rejects.toThrow(/incomplete resume structure/i);
  });

  it("rejects invalid JSON", async () => {
    mockCompletion("{ invalid json");

    await expect(
      parseResumeText(resumeText),
    ).rejects.toThrow(/invalid JSON/i);
  });

  it("rejects truncated model responses", async () => {
    mockCompletion(
      JSON.stringify(extractedResume),
      "length",
    );

    await expect(
      parseResumeText(resumeText),
    ).rejects.toThrow(/truncated/i);
  });

  it("rejects empty resume text without calling OpenRouter", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      parseResumeText("   "),
    ).rejects.toThrow("Resume text is empty.");

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("handles OpenRouter rate limits", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        json: async () => ({
          error: {
            message: "Rate limit exceeded",
          },
        }),
      }),
    );

    await expect(
      parseResumeText(resumeText),
    ).rejects.toThrow(/rate limit/i);
  });

  it("sends the correct model and API key", async () => {
    mockCompletion(JSON.stringify(extractedResume));

    await parseResumeText(resumeText);

    const fetchMock = vi.mocked(fetch);
    const [url, options] = fetchMock.mock.calls[0];

    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(options?.method).toBe("POST");

    const headers = options?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer test-api-key");

    const body = JSON.parse(options?.body as string);

    expect(body.stream).toBe(false);
    expect(body.temperature).toBe(0);
    expect(body.response_format).toEqual({
      type: "json_object",
    });
    expect(body.messages[1].content).toContain(resumeText);
  });

  it("preserves original source text", async () => {
    mockCompletion(JSON.stringify(extractedResume));

    const result = await parseResumeText(resumeText);

    expect(result.sourceText).toBe(resumeText);
    expect(result.summary).toBe(
      "Backend Software Engineer with 4 years of experience.",
    );
  });

  it("stores Persian translations while preserving technical terms", async () => {
    const bilingual = {
      ...extractedResume,
      persian: {
        personal: {
          firstName: "فاطمه", lastName: "فولادکار", fullName: "فاطمه فولادکار",
          headline: "مهندس نرم‌افزار Backend", location: "",
        },
        summary: "مهندس نرم‌افزار Backend با ۴ سال تجربه.",
        skills: ["Python", "Django", "FastAPI"],
        languages: [],
        experiences: [{
          title: "توسعه‌دهنده Backend", company: "Example Company", location: "",
          startDate: "Jun 2022", endDate: "May 2025",
          description: "REST APIها را با Django توسعه داد.",
        }],
        education: [{
          institution: "Example University", degree: "کارشناسی", field: "مهندسی کامپیوتر",
          startDate: "2018", endDate: "2022", description: "",
        }],
        certifications: [],
      },
    };
    mockCompletion(JSON.stringify(bilingual));

    const result = await parseResumeText(resumeText);

    expect(result.persian?.personal.headline).toContain("Backend");
    expect(result.persian?.skills).toEqual(["Python", "Django", "FastAPI"]);
    expect(result.persian?.experiences[0].description).toContain("Django");
    expect(result.persian?.experiences[0].startDate).toBe("Jun 2022");
  });

  it("translates a Persian source résumé to English while preserving the source fields", async () => {
    const persianText = `فاطمه فولادکار
توسعه‌دهنده بک‌اند

درباره من
توسعه‌دهنده بک‌اند با چهار سال تجربه در Python و Django.

مهارت‌ها
Python
Django`;
    const source = {
      personal: {
        firstName: "فاطمه", lastName: "فولادکار", fullName: "فاطمه فولادکار",
        headline: "توسعه‌دهنده بک‌اند", email: "", phone: "", location: "",
        website: "", linkedin: "", github: "",
      },
      summary: "توسعه‌دهنده بک‌اند با چهار سال تجربه در Python و Django.",
      skills: ["Python", "Django"], languages: [], experiences: [], education: [], certifications: [],
    };
    mockCompletion(JSON.stringify({
      ...source,
      persian: {
        personal: { firstName: "فاطمه", lastName: "فولادکار", fullName: "فاطمه فولادکار", headline: "توسعه‌دهنده بک‌اند", location: "" },
        summary: source.summary, skills: source.skills, languages: [], experiences: [], education: [], certifications: [],
      },
      english: {
        personal: { firstName: "Fatemeh", lastName: "Fouladkar", fullName: "Fatemeh Fouladkar", headline: "Backend Developer", location: "" },
        summary: "Backend developer with four years of experience in Python and Django.",
        skills: source.skills, languages: [], experiences: [], education: [], certifications: [],
      },
    }));

    const result = await parseResumeText(persianText, "persian.pdf");

    expect(result.sourceLanguage).toBe("persian");
    expect(result.personal.fullName).toBe("فاطمه فولادکار");
    expect(result.english?.personal.headline).toBe("Backend Developer");
    expect(result.english?.summary).toContain("Python");
    expect(result.english?.skills).toEqual(["Python", "Django"]);
  });

  it("repairs PDF whitespace artifacts without changing content", async () => {
    const pdfText = resumeText
      .replace("Backend Software Engineer", "Back end Software Engineer")
      .replace("Built REST APIs using Django.", "Built REST APIs\nusing Django .");
    mockCompletion(JSON.stringify(extractedResume));

    const result = await parseResumeText(pdfText, "spaced.pdf");

    expect(result.personal.headline).toBe("Backend Software Engineer");
    expect(result.experiences[0].description).toBe("Built REST APIs using Django.");
    expect(result.sourceText).toBe(pdfText);
  });

  it("still rejects non-whitespace changes made by the model", async () => {
    const changed = structuredClone(extractedResume);
    changed.experiences[0].description = "Built REST APIs using Flask.";
    mockCompletion(JSON.stringify(changed));

    const result = await parseResumeText(resumeText);

    expect(result.experiences[0].description).toBe("");
  });
});
