export interface PersonalDetails {
  firstName: string;
  lastName: string;
  fullName: string;
  headline: string;
  email: string;
  phone: string;
  location: string;
  website: string;
  linkedin: string;
  github: string;
}

export interface Experience {
  title: string;
  company: string;
  location: string;
  startDate: string;
  endDate: string;
  description: string;
}

export interface Education {
  institution: string;
  degree: string;
  field: string;
  startDate: string;
  endDate: string;
  description: string;
}

export interface LanguageItem {
  name: string;
  proficiency: string;
}

export interface LocalizedResumeData {
  personal: Pick<PersonalDetails, "firstName" | "lastName" | "fullName" | "headline" | "location">;
  summary: string;
  skills: string[];
  languages: LanguageItem[];
  experiences: Experience[];
  education: Education[];
  certifications: string[];
}

export type PersianResumeData = LocalizedResumeData;
export type EnglishResumeData = LocalizedResumeData;

export interface ResumeProfile {
  id: string;
  fileName: string;
  importedAt: string;
  sourceText: string;
  personal: PersonalDetails;
  summary: string;
  skills: string[];
  languages: LanguageItem[];
  experiences: Experience[];
  education: Education[];
  certifications: string[];
  /** Smooth Persian translations. Optional for profiles imported before bilingual support. */
  persian?: PersianResumeData;
  /** Smooth English translations. Present for newly imported profiles. */
  english?: EnglishResumeData;
  /** Language detected from the source résumé text. */
  sourceLanguage?: "english" | "persian";
  /** Version used by builders that only provide one set of résumé fields. */
  preferredLanguage?: "english" | "persian";
}

export interface FillReport {
  site: string;
  filled: number;
  skipped: number;
  fields: string[];
  warnings: string[];
}

export type ContentMessage =
  | { type: "PING" }
  | { type: "FILL_RESUME"; profile: ResumeProfile };
