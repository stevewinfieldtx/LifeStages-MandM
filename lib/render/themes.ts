/**
 * Slide themes. Three presets the user picks in the GUI; renderer
 * looks the choice up here. Add more by extending THEMES.
 */

export type ThemeId = "minimal-editorial" | "bold-dark" | "warm-church";

export type Theme = {
  id: ThemeId;
  label: string;
  description: string;
  // Backgrounds — first color is base, second is gradient end (use same color to disable gradient)
  bgTop: string;
  bgBottom: string;
  // Type
  textColor: string;
  accentColor: string;       // used for scripture references and rule lines
  mutedColor: string;        // watermark, scene number
  // Font preferences (canvas falls back to system if these aren't installed)
  headlineFont: string;
  bodyFont: string;
  // Styling knobs
  headlineWeight: string;    // "400" "600" "700" etc.
  uppercaseHeadline: boolean;
};

export const THEMES: Record<ThemeId, Theme> = {
  "minimal-editorial": {
    id: "minimal-editorial",
    label: "Minimal Editorial",
    description: "Off-white background, dark serif headlines. Reads like a NYT explainer.",
    bgTop: "#F6F2EB",
    bgBottom: "#EDE7DC",
    textColor: "#1A1A1A",
    accentColor: "#8B1E3F",
    mutedColor: "#7A736A",
    headlineFont: "Georgia, 'Times New Roman', serif",
    bodyFont: "Georgia, 'Times New Roman', serif",
    headlineWeight: "600",
    uppercaseHeadline: false
  },
  "bold-dark": {
    id: "bold-dark",
    label: "Bold Dark",
    description: "Deep navy with one accent color, big sans-serif. Looks like a podcast clip.",
    bgTop: "#0E1726",
    bgBottom: "#1A2540",
    textColor: "#F5F7FA",
    accentColor: "#F4B860",
    mutedColor: "#7A8AA3",
    headlineFont: "Helvetica, Arial, sans-serif",
    bodyFont: "Helvetica, Arial, sans-serif",
    headlineWeight: "700",
    uppercaseHeadline: false
  },
  "warm-church": {
    id: "warm-church",
    label: "Warm Church",
    description: "Cream and burgundy, classic feel. Looks like a sermon companion.",
    bgTop: "#FAF3E7",
    bgBottom: "#F1E5CC",
    textColor: "#3B1F1F",
    accentColor: "#7E2C2C",
    mutedColor: "#8C6B4F",
    headlineFont: "Georgia, 'Times New Roman', serif",
    bodyFont: "Georgia, 'Times New Roman', serif",
    headlineWeight: "600",
    uppercaseHeadline: true
  }
};

export const DEFAULT_THEME: ThemeId = "bold-dark";

export function getTheme(id: string | null | undefined): Theme {
  if (id && id in THEMES) return THEMES[id as ThemeId];
  return THEMES[DEFAULT_THEME];
}
