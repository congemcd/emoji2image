import type { EmojiEntry, PlatformStyle, PlatformStyleId, SkinTone } from "./types";

const APPLE_EXPORT_SIZE = 160;
const APPLE_EXPORT_Y_OFFSET = 9;
const PREVIEW_SIZE = 256;
const CENTERING_REFERENCE_SIZE = 512;
const MEASURED_CENTERING_OFFSET_AT_REFERENCE_SIZE = 36;
const imageCache = new Map<string, Promise<HTMLImageElement>>();

export type EmojiBlobResult = {
  blob: Blob;
  width: number;
  height: number;
};

export function applySkinTone(entry: EmojiEntry, tone: SkinTone): string {
  if (!entry.supportsTone || tone.id === "default") {
    return entry.emoji;
  }

  return `${entry.emoji}${tone.modifier}`;
}

export async function drawEmojiImage(
  canvas: HTMLCanvasElement,
  emoji: string,
  style: PlatformStyle,
  options: { size?: number; background?: string | null } = {}
): Promise<void> {
  const size = options.size ?? PREVIEW_SIZE;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Canvas rendering is not available.");
  }

  canvas.width = size;
  canvas.height = size;
  context.clearRect(0, 0, size, size);

  if (options.background) {
    context.fillStyle = options.background;
    context.fillRect(0, 0, size, size);
  }

  if (style.kind === "asset") {
    const image = await loadImage(getEmojiAssetUrl(emoji, style));
    drawContainedImage(context, image, size);
    return;
  }

  drawFontEmoji(context, emoji, style, size, {
    fontSize: size - Math.round(size * 0.13) * 2,
    yOffset: getFontCenteringOffset(size)
  });
}

function drawContainedImage(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  size: number
): void {
  const padding = Math.round(size * 0.08);
  const maxSize = size - padding * 2;
  const imageRatio = image.naturalWidth / image.naturalHeight || 1;
  const width = imageRatio >= 1 ? maxSize : maxSize * imageRatio;
  const height = imageRatio >= 1 ? maxSize / imageRatio : maxSize;
  const x = (size - width) / 2;
  const y = (size - height) / 2;

  context.drawImage(image, x, y, width, height);
}

function drawFontEmoji(
  context: CanvasRenderingContext2D,
  emoji: string,
  style: PlatformStyle,
  size: number,
  options: { fontSize: number; yOffset: number }
): void {
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = `${options.fontSize}px ${style.fontFamily}`;
  context.fillText(emoji, size / 2, size / 2 + options.yOffset);
}

function loadImage(url: string): Promise<HTMLImageElement> {
  const cachedImage = imageCache.get(url);

  if (cachedImage) {
    return cachedImage;
  }

  const imagePromise = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();

    image.crossOrigin = "anonymous";
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Unable to load emoji asset: ${url}`));
    image.src = url;
  });

  imageCache.set(url, imagePromise);
  return imagePromise;
}

function getFontCenteringOffset(canvasSize: number): number {
  return Math.round(
    (canvasSize / CENTERING_REFERENCE_SIZE) * MEASURED_CENTERING_OFFSET_AT_REFERENCE_SIZE
  );
}

export async function createEmojiBlob(
  emoji: string,
  style: PlatformStyle,
  format: "image/png" | "image/jpeg"
): Promise<EmojiBlobResult> {
  const canvas = document.createElement("canvas");
  const background = format === "image/jpeg" ? "#ffffff" : null;

  await drawEmojiExport(canvas, emoji, style, background);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
          return;
        }

        reject(new Error("The browser could not create the image file."));
      },
      format,
      format === "image/jpeg" ? 0.96 : undefined
    );
  });

  return {
    blob,
    width: canvas.width,
    height: canvas.height
  };
}

async function drawEmojiExport(
  canvas: HTMLCanvasElement,
  emoji: string,
  style: PlatformStyle,
  background: string | null
): Promise<void> {
  if (style.kind === "asset") {
    const image = await loadImage(getEmojiAssetUrl(emoji, style));
    const width = image.naturalWidth || PREVIEW_SIZE;
    const height = image.naturalHeight || PREVIEW_SIZE;
    const context = prepareCanvas(canvas, width, height, background);

    context.drawImage(image, 0, 0, width, height);
    return;
  }

  const context = prepareCanvas(canvas, APPLE_EXPORT_SIZE, APPLE_EXPORT_SIZE, background);

  drawFontEmoji(context, emoji, style, APPLE_EXPORT_SIZE, {
    fontSize: APPLE_EXPORT_SIZE,
    yOffset: getFontCenteringOffset(APPLE_EXPORT_SIZE) + APPLE_EXPORT_Y_OFFSET
  });
}

function prepareCanvas(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
  background: string | null
): CanvasRenderingContext2D {
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Canvas rendering is not available.");
  }

  canvas.width = width;
  canvas.height = height;
  context.clearRect(0, 0, width, height);

  if (background) {
    context.fillStyle = background;
    context.fillRect(0, 0, width, height);
  }

  return context;
}

export function getExportSizeLabel(
  styleId: PlatformStyleId,
  dimensions?: { width: number; height: number }
): string {
  if (dimensions) {
    return dimensions.width === dimensions.height
      ? String(dimensions.width)
      : `${dimensions.width}x${dimensions.height}`;
  }

  return styleId === "apple" ? String(APPLE_EXPORT_SIZE) : "original";
}

export function getPreviewSize(): number {
  return PREVIEW_SIZE;
}

export function getEmojiAssetUrl(emoji: string, style: PlatformStyle): string {
  const codepoint = getEmojiCodepointId(emoji);

  switch (style.id) {
    case "google":
      return `https://cdn.jsdelivr.net/gh/googlefonts/noto-emoji@main/png/128/emoji_u${codepoint.replaceAll("-", "_")}.png`;
    case "fluent3d":
      return `https://cdn.jsdelivr.net/npm/@lobehub/fluent-emoji-3d@latest/assets/${codepoint}.webp`;
    case "fluentFlat":
      return `https://cdn.jsdelivr.net/npm/@lobehub/fluent-emoji-flat@latest/assets/${codepoint}.svg`;
    case "twemoji":
      return `https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/svg/${codepoint}.svg`;
    case "openmoji":
      return `https://cdn.jsdelivr.net/npm/openmoji@15.1.0/color/svg/${codepoint.toUpperCase()}.svg`;
    case "apple":
      throw new Error("Apple style uses the local system emoji font.");
  }
}

function getEmojiCodepointId(emoji: string): string {
  return Array.from(emoji)
    .map((character) => character.codePointAt(0)?.toString(16))
    .filter((codepoint): codepoint is string => Boolean(codepoint))
    .filter((codepoint) => codepoint !== "fe0f" && codepoint !== "fe0e")
    .join("-");
}
