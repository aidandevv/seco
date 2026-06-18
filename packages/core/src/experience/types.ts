export type RoleType = 'internship' | 'full-time' | 'project' | 'leadership' | 'research';
export type DraftFieldConfidence = 'low' | 'medium' | 'high';
export type IntakeLifecycle = 'collecting' | 'needs_details' | 'ready_for_review' | 'saved';
export type IntakeMode = 'voice' | 'text';

export type ExperienceDraftField =
  | 'title'
  | 'organization'
  | 'role'
  | 'role_type'
  | 'start_date'
  | 'end_date'
  | 'situation'
  | 'task'
  | 'action'
  | 'result'
  | 'skills'
  | 'impact_metrics'
  | 'ats_keywords'
  | 'tags';

export interface ExperienceDraft {
  title: string;
  organization: string;
  role: string;
  role_type: RoleType;
  start_date: string;
  end_date: string | null;
  situation: string;
  task: string;
  action: string;
  result: string;
  skills: string[];
  impact_metrics: string[];
  ats_keywords: string[];
  tags: string[];
  fieldConfidence: Partial<Record<ExperienceDraftField, DraftFieldConfidence>>;
  fieldNotes?: Partial<Record<ExperienceDraftField, string>>;
  qualityScore?: { star: number; metrics: number; skills: number; overall: number };
  overallConfidence: DraftFieldConfidence;
  missingFields: ExperienceDraftField[];
  readyForReview: boolean;
}

export interface Experience {
  id: string;
  title: string;
  organization: string;
  role: string;
  role_type: RoleType;
  start_date: string;
  end_date: string | null;
  raw_transcript: string;
  situation: string;
  task: string;
  action: string;
  result: string;
  skills: string[];
  impact_metrics: string[];
  ats_keywords: string[];
  tags: string[];
  version: number;
  created_at: string;
  updated_at: string;
}

export interface ExperienceVersion {
  id: string;
  experience_id: string;
  version: number;
  snapshot: Experience;
  created_at: string;
}

export type Surface =
  | 'resume_bullets'
  | 'linkedin_summary'
  | 'linkedin_post'
  | 'github_readme'
  | 'obsidian_note'
  | 'latex_bullets'
  | 'cover_letter_paragraph'
  | 'bio_short'
  | 'bio_medium'
  | 'bio_full';

export interface ParsedJD {
  required_skills: string[];
  preferred_skills: string[];
  keywords: string[];
  vocabulary: string[];
  confidence: 'high' | 'medium' | 'low';
}

export interface GapAnalysis {
  [competency: string]: number;
}

export interface ApplicationSnapshot {
  id: string;
  role_title: string;
  company: string;
  jd_raw: string;
  jd_parsed: ParsedJD;
  experience_ids: string[];
  rendered_outputs: Partial<Record<Surface, string>>;
  gap_analysis: GapAnalysis;
  created_at: string;
}

export interface IntakeSession {
  id: string;
  transcript: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  status: 'active' | 'saved' | 'abandoned';
  mode: IntakeMode;
  auto_listen_enabled: boolean;
  experience_id: string | null;
  created_at: string;
  updated_at: string;
}
