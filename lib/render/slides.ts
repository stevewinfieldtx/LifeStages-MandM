/**
 * Slide rendering. Pure-Node typographic slides via @napi-rs/canvas.
 *
 * Each scene gets one PNG. We render to 1080×1080 (square) at 2× for
 * crisper antialiasing, then scale down on export. Themes are applied
 * by reading from lib/render/themes.ts.
 *
 * No external font files required — falls back to system fonts. Drop
 * Inter/Playfair TTFs into ./public/fonts/ later for production polish.
 */

import { Canvas, createCanvas, SKRSContext2D, GlobalFonts } from "@napi-rs/canvas";
import { writeFile } from "node:fs/promises";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { Theme } from "./themes";

const SIZE = 1080;
const SUPER = 2;             // render at 2× for AA, scale down on PNG out
const CANVAS = SIZE * SUPER;
const PADDING = 96 * SUPER;

let fontsRegistered = false;
function registerBundledFonts(): void {
  if (fontsRegistered) return;
  fontsRegistered = true;
  const fontsDir = join(process.cwd(), "public", "fonts");
  if (!existsSync(fontsDir)) return;
  for (const file of readdirSync(fontsDir)) {
    if (/\.(ttf|otf)$/i.test(file)) {
      try {
        GlobalFonts.registerFromPath(join(fontsDir, file), file.replace(/\.(ttf|otf)$/i, ""));
      } catch {
        // Best-effort. If a font fails to register we fall back to system.
      }
    }
  }
}

function drawBackground(ctx: SKRSContext2D, theme: Theme): void {
  if (theme.bgTop === theme.bgBottom) {
    ctx.fillStyle = theme.bgTop;
    ctx.fillRect(0, 0, CANVAS, CANVAS);
    return;
  }
  const grad = ctx.createLinearGradient(0, 0, 0, CANVAS);
  grad.addColorStop(0, theme.bgTop);
  grad.addColorStop(1, theme.bgBottom);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, CANVAS, CANVAS);
}

function wrapLines(
  ctx: SKRSContext2D,
  text: string,
  maxWidth: number
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth) {
      current = next;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function fitHeadline(
  ctx: SKRSContext2D,
  text: string,
  maxWidth: number,
  maxHeight: number,
  weight: string,
  family: string,
  startSize: number
): { lines: string[]; fontSize: number; lineHeight: number } {
  let size = startSize;
  while (size > 32 * SUPER) {
    ctx.font = `${weight} ${size}px ${family}`;
    const lineHeight = Math.round(size * 1.18);
    const lines = wrapLines(ctx, text, maxWidth);
    if (lines.length * lineHeight <= maxHeight) {
      return { lines, fontSize: size, lineHeight };
    }
    size -= 4 * SUPER;
  }
  // floor
  ctx.font = `${weight} ${size}px ${family}`;
  const lineHeight = Math.round(size * 1.18);
  return { lines: wrapLines(ctx, text, maxWidth), fontSize: size, lineHeight };
}

function drawCenteredHeadline(
  ctx: SKRSContext2D,
  text: string,
  theme: Theme,
  topY: number,
  bottomY: number
): void {
  const maxWidth = CANVAS - PADDING * 2;
  const maxHeight = bottomY - topY;
  const display = theme.uppercaseHeadline ? text.toUpperCase() : text;
  const { lines, fontSize, lineHeight } = fitHeadline(
    ctx,
    display,
    maxWidth,
    maxHeight,
    theme.headlineWeight,
    theme.headlineFont,
    140 * SUPER
  );
  ctx.fillStyle = theme.textColor;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `${theme.headlineWeight} ${fontSize}px ${theme.headlineFont}`;
  const blockHeight = lines.length * lineHeight;
  const startY = topY + (maxHeight - blockHeight) / 2 + lineHeight / 2;
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], CANVAS / 2, startY + i * lineHeight);
  }
}

function drawTopMeta(
  ctx: SKRSContext2D,
  theme: Theme,
  text: string
): void {
  ctx.fillStyle = theme.mutedColor;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.font = `500 ${22 * SUPER}px ${theme.bodyFont}`;
  ctx.fillText(text.toUpperCase(), PADDING, PADDING + 24 * SUPER);
}

function drawScriptureBadge(
  ctx: SKRSContext2D,
  theme: Theme,
  scripture: string,
  y: number
): void {
  ctx.fillStyle = theme.accentColor;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.font = `600 ${30 * SUPER}px ${theme.bodyFont}`;
  ctx.fillText(scripture, CANVAS / 2, y);
}

function drawBottomWatermark(
  ctx: SKRSContext2D,
  theme: Theme,
  watermark: string
): void {
  // thin rule above watermark
  const ruleW = 120 * SUPER;
  ctx.strokeStyle = theme.mutedColor;
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 1.5 * SUPER;
  ctx.beginPath();
  ctx.moveTo(CANVAS / 2 - ruleW / 2, CANVAS - PADDING - 70 * SUPER);
  ctx.lineTo(CANVAS / 2 + ruleW / 2, CANVAS - PADDING - 70 * SUPER);
  ctx.stroke();
  ctx.globalAlpha = 1;

  ctx.fillStyle = theme.mutedColor;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.font = `500 ${20 * SUPER}px ${theme.bodyFont}`;
  ctx.fillText(watermark.toUpperCase(), CANVAS / 2, CANVAS - PADDING - 20 * SUPER);
}

export type SceneSlideInput = {
  outputPath: string;
  theme: Theme;
  // Body text (the "on-screen text" from the scene plan, or a derived headline)
  headline: string;
  // e.g. "John 3:16" — optional
  scripture?: string;
  // top-left meta, e.g. "SCENE 3 OF 18"
  topMeta: string;
  // bottom watermark, e.g. "FIELDER CHURCH · MEANINGFUL MESSAGE"
  watermark: string;
};

async function exportPng(canvas: Canvas, outputPath: string): Promise<void> {
  // @napi-rs/canvas can encode PNG directly. Render at 2x then let
  // ffmpeg downscale for video — slightly cleaner than scaling at PNG export.
  const buffer = await canvas.encode("png");
  await writeFile(outputPath, buffer);
}

export async function renderSceneSlide(input: SceneSlideInput): Promise<string> {
  registerBundledFonts();
  const canvas: Canvas = createCanvas(CANVAS, CANVAS);
  const ctx = canvas.getContext("2d");
  drawBackground(ctx, input.theme);
  drawTopMeta(ctx, input.theme, input.topMeta);

  // Reserve space for scripture badge above the headline if present
  const headlineTop = PADDING + 100 * SUPER;
  const headlineBottom = input.scripture
    ? CANVAS - PADDING - 180 * SUPER
    : CANVAS - PADDING - 120 * SUPER;
  drawCenteredHeadline(ctx, input.headline, input.theme, headlineTop, headlineBottom);

  if (input.scripture) {
    drawScriptureBadge(ctx, input.theme, input.scripture, CANVAS - PADDING - 130 * SUPER);
  }
  drawBottomWatermark(ctx, input.theme, input.watermark);

  await exportPng(canvas, input.outputPath);
  return input.outputPath;
}

export type IntroSlideInput = {
  outputPath: string;
  theme: Theme;
  title: string;
  subtitle: string;     // e.g. church name or sermon date
};

export async function renderIntroSlide(input: IntroSlideInput): Promise<string> {
  registerBundledFonts();
  const canvas: Canvas = createCanvas(CANVAS, CANVAS);
  const ctx = canvas.getContext("2d");
  drawBackground(ctx, input.theme);

  // Subtitle eyebrow
  ctx.fillStyle = input.theme.accentColor;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.font = `600 ${28 * SUPER}px ${input.theme.bodyFont}`;
  ctx.fillText(
    input.subtitle.toUpperCase(),
    CANVAS / 2,
    CANVAS / 2 - 220 * SUPER
  );

  // Title
  drawCenteredHeadline(
    ctx,
    input.title,
    input.theme,
    CANVAS / 2 - 180 * SUPER,
    CANVAS / 2 + 220 * SUPER
  );

  // Brand mark
  ctx.fillStyle = input.theme.mutedColor;
  ctx.textAlign = "center";
  ctx.font = `500 ${22 * SUPER}px ${input.theme.bodyFont}`;
  ctx.fillText("THE MEANINGFUL MESSAGE", CANVAS / 2, CANVAS - PADDING);

  await exportPng(canvas, input.outputPath);
  return input.outputPath;
}

export type OutroSlideInput = {
  outputPath: string;
  theme: Theme;
  closingLine: string;     // e.g. "Watch the full sermon →"
  footnote: string;        // e.g. church name + date
};

export async function renderOutroSlide(input: OutroSlideInput): Promise<string> {
  registerBundledFonts();
  const canvas: Canvas = createCanvas(CANVAS, CANVAS);
  const ctx = canvas.getContext("2d");
  drawBackground(ctx, input.theme);

  drawCenteredHeadline(
    ctx,
    input.closingLine,
    input.theme,
    CANVAS / 2 - 200 * SUPER,
    CANVAS / 2 + 200 * SUPER
  );

  ctx.fillStyle = input.theme.mutedColor;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.font = `500 ${24 * SUPER}px ${input.theme.bodyFont}`;
  ctx.fillText(input.footnote.toUpperCase(), CANVAS / 2, CANVAS - PADDING);

  await exportPng(canvas, input.outputPath);
  return input.outputPath;
}

export const SLIDE_DIMENSIONS = { width: SIZE, height: SIZE, renderedAt: CANVAS };
