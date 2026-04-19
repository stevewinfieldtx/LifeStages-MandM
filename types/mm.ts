export type TranscriptChunk = {
  text: string;
  start: number;
  dur: number;
};

export type SermonAnalysis = {
  centralIdea: string;
  primaryScriptures: string[];
  supportingPoints: string[];
  audienceProblem: string;
  mainApplication: string;
  sermonStartHint?: string;
  sermonEndHint?: string;
};

export type ScenePlan = {
  scenes: Array<{
    sceneNumber: number;
    startSec: number;
    endSec: number;
    narration: string;
    visualConcept: string;
    onScreenText: string;
    scriptureReference?: string;
  }>;
};

export type PublishKit = {
  titles: string[];
  thumbnailTexts: string[];
  shortIdeas: string[];
  description: string;
  pinnedComment: string;
};

export type FidelityReport = {
  supportedPoints: string[];
  weaklySupported: string[];
  unsupportedClaims: string[];
  confidenceScore: number; // 0-100
};

export type MMResult = {
  analysis: SermonAnalysis;
  mmScript: string;
  scenePlan: ScenePlan;
  publishKit: PublishKit;
};

export type SermonJob = {
  id: string;
  church_id: string;
  channel_id: string;
  video_id: string;
  video_title: string | null;
  video_published_at: string | null;
  status: string;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

export type Church = {
  id: string;
  name: string;
  slug: string;
  denomination: string | null;
  tone_profile: Record<string, any>;
  reviewer_email: string;
  auto_approve_after_days: number | null;
  active: boolean;
};

export type Channel = {
  id: string;
  church_id: string;
  youtube_channel_id: string;
  youtube_handle: string | null;
  last_checked_at: string | null;
  last_video_id_seen: string | null;
  active: boolean;
};
