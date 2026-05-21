import "./styles.css";
import { ArrowDownToLine, Search, createElement } from "lucide";
import { categories, emojiCatalog, platformStyles, skinTones } from "./emoji-data";
import {
  applySkinTone,
  createEmojiBlob,
  drawEmojiImage,
  getEmojiAssetUrl,
  getExportSize,
  getPreviewSize
} from "./renderer";
import type { EmojiCategory, EmojiEntry, PlatformStyle, PlatformStyleId, SkinToneId } from "./types";

type AppState = {
  selectedEmoji: EmojiEntry;
  selectedStyle: PlatformStyleId;
  selectedTone: SkinToneId;
  selectedCategory: EmojiCategory | "All";
  query: string;
};

const browserFallbackStyleIds: PlatformStyleId[] = ["google", "fluentFlat", "twemoji", "openmoji"];
const browserFontSupportCache = new Map<string, boolean>();
let browserSupportObserver: IntersectionObserver | null = null;

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("App container is missing.");
}

const state: AppState = {
  selectedEmoji: emojiCatalog[0],
  selectedStyle: getInitialStyleId(),
  selectedTone: "default",
  selectedCategory: "All",
  query: ""
};

app.innerHTML = `
  <main class="app-shell">
    <section class="preview-pane" aria-label="Emoji image preview">
      <div class="brand-row">
        <div>
          <p class="eyebrow">Emoji Image Converter</p>
        </div>
      </div>

      <div class="preview-content">
        <div class="preview-stack">
          <div class="preview-frame">
            <canvas id="previewCanvas" aria-label="Selected emoji preview"></canvas>
            <p class="support-note" id="supportNote" hidden></p>
          </div>

          <div class="selected-row">
            <div>
              <p class="selected-name" id="selectedEmojiName"></p>
              <p class="selected-meta" id="selectedEmojiMeta"></p>
            </div>
          </div>
        </div>

        <div class="control-group">
          <div class="control-heading">
            <span>Style</span>
          </div>
          <div class="style-card-grid" id="styleSelector" role="radiogroup" aria-label="Emoji platform style"></div>
        </div>

        <div class="control-group">
          <div class="control-heading">
            <span>Tone</span>
          </div>
          <div class="tone-grid" id="toneSelector" role="radiogroup" aria-label="Tone"></div>
        </div>
      </div>

      <div class="download-row">
        <button class="download-button primary" id="downloadPng" type="button">
          <span class="button-icon" id="downloadPngIcon" aria-hidden="true"></span>
          <span id="downloadPngLabel"></span>
        </button>
        <button class="download-button" id="downloadJpg" type="button">
          <span class="button-icon" id="downloadJpgIcon" aria-hidden="true"></span>
          <span id="downloadJpgLabel"></span>
        </button>
      </div>

      <p class="license-note">
        Assets:
        <a href="https://github.com/googlefonts/noto-emoji" target="_blank" rel="noreferrer">Noto Emoji</a>,
        <a href="https://github.com/microsoft/fluentui-emoji" target="_blank" rel="noreferrer">Microsoft Fluent Emoji</a>,
        <a href="https://github.com/jdecked/twemoji" target="_blank" rel="noreferrer">Twemoji</a>,
        <a href="https://openmoji.org/" target="_blank" rel="noreferrer">OpenMoji</a>.
      </p>
    </section>

    <aside class="browser-pane" aria-label="Emoji browser">
      <label class="search-field">
        <span class="search-icon" id="searchIcon" aria-hidden="true"></span>
        <input id="emojiSearch" type="search" placeholder="Search emoji" autocomplete="off" />
      </label>

      <div class="category-strip" id="categoryFilter" aria-label="Emoji category filter"></div>
      <div class="emoji-grid" id="emojiGrid" role="listbox" aria-label="Emoji results"></div>
    </aside>
  </main>
`;

const previewCanvas = getElement<HTMLCanvasElement>("previewCanvas");
const selectedEmojiName = getElement<HTMLParagraphElement>("selectedEmojiName");
const selectedEmojiMeta = getElement<HTMLParagraphElement>("selectedEmojiMeta");
const supportNote = getElement<HTMLParagraphElement>("supportNote");
const styleSelector = getElement<HTMLDivElement>("styleSelector");
const toneSelector = getElement<HTMLDivElement>("toneSelector");
const categoryFilter = getElement<HTMLDivElement>("categoryFilter");
const emojiGrid = getElement<HTMLDivElement>("emojiGrid");
const emojiSearch = getElement<HTMLInputElement>("emojiSearch");
const downloadPng = getElement<HTMLButtonElement>("downloadPng");
const downloadJpg = getElement<HTMLButtonElement>("downloadJpg");
const downloadPngLabel = getElement<HTMLSpanElement>("downloadPngLabel");
const downloadJpgLabel = getElement<HTMLSpanElement>("downloadJpgLabel");
const downloadPngIcon = getElement<HTMLSpanElement>("downloadPngIcon");
const downloadJpgIcon = getElement<HTMLSpanElement>("downloadJpgIcon");
const searchIcon = getElement<HTMLSpanElement>("searchIcon");

appendDownloadIcon(downloadPngIcon);
appendDownloadIcon(downloadJpgIcon);
appendSearchIcon(searchIcon);

function getElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);

  if (!element) {
    throw new Error(`Element #${id} is missing.`);
  }

  return element as T;
}

function appendDownloadIcon(container: HTMLElement): void {
  container.replaceChildren(
    createElement(ArrowDownToLine, {
      width: 18,
      height: 18,
      "stroke-width": 2.4
    })
  );
}

function appendSearchIcon(container: HTMLElement): void {
  container.replaceChildren(
    createElement(Search, {
      width: 18,
      height: 18,
      "stroke-width": 2.4
    })
  );
}

function getSelectedStyle() {
  const availableStyles = getAvailablePlatformStyles();

  return availableStyles.find((style) => style.id === state.selectedStyle) ?? availableStyles[0];
}

function getSelectedTone() {
  return skinTones.find((tone) => tone.id === state.selectedTone) ?? skinTones[0];
}

function getRenderedEmoji(entry = state.selectedEmoji): string {
  return applySkinTone(entry, getSelectedTone());
}

function getInitialStyleId(): PlatformStyleId {
  return getAvailablePlatformStyles()[0].id;
}

function getAvailablePlatformStyles(): PlatformStyle[] {
  return platformStyles.filter((style) => style.id !== "apple" || isAppleDevice());
}

function isAppleDevice(): boolean {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const platform = nav.userAgentData?.platform ?? navigator.platform;
  const userAgent = navigator.userAgent;
  const hasTouchPoints = navigator.maxTouchPoints > 1;

  return /Mac|iPhone|iPad|iPod/i.test(platform) || (/Macintosh/i.test(userAgent) && hasTouchPoints);
}

function renderStyleSelector(): void {
  styleSelector.innerHTML = getAvailablePlatformStyles()
    .map(
      (style) => `
        <button
          class="segment-button"
          type="button"
          role="radio"
          aria-checked="${style.id === state.selectedStyle}"
          data-style="${style.id}"
        >
          ${style.label}
        </button>
      `
    )
    .join("");
}

function renderToneSelector(): void {
  toneSelector.innerHTML = skinTones
    .map(
      (tone) => `
        <button
          class="tone-button"
          type="button"
          role="radio"
          aria-label="${tone.label}"
          aria-checked="${tone.id === state.selectedTone}"
          data-tone="${tone.id}"
          title="${tone.label}"
        >
          <span class="tone-swatch" style="--tone-color: ${tone.color}"></span>
        </button>
      `
    )
    .join("");
}

function renderCategoryFilter(): void {
  const allCategories: Array<EmojiCategory | "All"> = ["All", ...categories];

  categoryFilter.innerHTML = allCategories
    .map(
      (category) => `
        <button
          class="category-button"
          type="button"
          aria-pressed="${category === state.selectedCategory}"
          data-category="${category}"
        >
          ${category}
        </button>
      `
    )
    .join("");
}

function getFilteredEmoji(): EmojiEntry[] {
  const normalizedQuery = state.query.trim().toLowerCase();

  return emojiCatalog.filter((entry) => {
    const matchesCategory =
      state.selectedCategory === "All" || entry.category === state.selectedCategory;

    if (!matchesCategory) {
      return false;
    }

    if (!normalizedQuery) {
      return true;
    }

    const searchableText = [entry.name, entry.category, entry.emoji, ...entry.keywords]
      .join(" ")
      .toLowerCase();

    return searchableText.includes(normalizedQuery);
  });
}

function renderEmojiGrid(): void {
  const filteredEmoji = getFilteredEmoji();

  emojiGrid.innerHTML = filteredEmoji
    .map((entry) => {
      const isSelected = entry.emoji === state.selectedEmoji.emoji;

      return `
        <button
          class="emoji-tile"
          type="button"
          role="option"
          aria-selected="${isSelected}"
          data-emoji-index="${emojiCatalog.indexOf(entry)}"
          data-emoji="${entry.emoji}"
          title="${entry.name}"
        >
          <span class="emoji-tile-glyph">${entry.emoji}</span>
        </button>
      `;
    })
    .join("");

  observeBrowserDefaultSupport();
}

function observeBrowserDefaultSupport(): void {
  browserSupportObserver?.disconnect();

  browserSupportObserver = new IntersectionObserver(
    (observedTiles) => {
      for (const observedTile of observedTiles) {
        if (!observedTile.isIntersecting) {
          continue;
        }

        const tile = observedTile.target as HTMLElement;
        const emoji = tile.dataset.emoji;

        browserSupportObserver?.unobserve(tile);

        if (!emoji || isDefaultEmojiGlyphSupported(emoji)) {
          continue;
        }

        showBrowserFallbackAsset(tile, emoji, 0);
      }
    },
    {
      root: emojiGrid,
      rootMargin: "160px"
    }
  );

  emojiGrid.querySelectorAll<HTMLElement>(".emoji-tile").forEach((tile) => {
    browserSupportObserver?.observe(tile);
  });
}

function isDefaultEmojiGlyphSupported(emoji: string): boolean {
  const cachedResult = browserFontSupportCache.get(emoji);

  if (cachedResult !== undefined) {
    return cachedResult;
  }

  const emojiPixels = renderBrowserGlyphProbe(emoji);
  const missingPixels = renderBrowserGlyphProbe(String.fromCodePoint(0x10ffff));
  const isSupported = getPixelDifferenceRatio(emojiPixels, missingPixels) > 0.08;

  browserFontSupportCache.set(emoji, isSupported);
  return isSupported;
}

function renderBrowserGlyphProbe(emoji: string): Uint8ClampedArray {
  const probeSize = 72;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });

  canvas.width = probeSize;
  canvas.height = probeSize;

  if (!context) {
    return new Uint8ClampedArray();
  }

  context.clearRect(0, 0, probeSize, probeSize);
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = `${Math.round(probeSize * 0.62)}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", emoji, sans-serif`;
  context.fillText(emoji, probeSize / 2, probeSize / 2);

  return context.getImageData(0, 0, probeSize, probeSize).data;
}

function getPixelDifferenceRatio(
  firstPixels: Uint8ClampedArray,
  secondPixels: Uint8ClampedArray
): number {
  if (firstPixels.length !== secondPixels.length || firstPixels.length === 0) {
    return 1;
  }

  let differentPixels = 0;
  const totalPixels = firstPixels.length / 4;

  for (let index = 0; index < firstPixels.length; index += 4) {
    const alphaDifference = Math.abs(firstPixels[index + 3] - secondPixels[index + 3]);
    const redDifference = Math.abs(firstPixels[index] - secondPixels[index]);
    const greenDifference = Math.abs(firstPixels[index + 1] - secondPixels[index + 1]);
    const blueDifference = Math.abs(firstPixels[index + 2] - secondPixels[index + 2]);

    if (alphaDifference + redDifference + greenDifference + blueDifference > 48) {
      differentPixels += 1;
    }
  }

  return differentPixels / totalPixels;
}

function showBrowserFallbackAsset(tile: HTMLElement, emoji: string, fallbackIndex: number): void {
  const style = getBrowserFallbackStyle(fallbackIndex);

  if (!style) {
    tile.innerHTML = `<span class="emoji-tile-glyph">${emoji}</span>`;
    return;
  }

  tile.innerHTML = `<img class="asset-emoji-image" src="${getEmojiAssetUrl(emoji, style)}" alt="" data-fallback-index="${fallbackIndex}" />`;
}

function getBrowserFallbackStyle(index: number): PlatformStyle | undefined {
  const styleId = browserFallbackStyleIds[index];

  return platformStyles.find((style) => style.id === styleId);
}

let previewRenderToken = 0;

function renderPreview(): void {
  const renderToken = ++previewRenderToken;
  const renderedEmoji = getRenderedEmoji();
  const selectedStyle = getSelectedStyle();
  const tone = getSelectedTone();
  const renderCanvas = document.createElement("canvas");

  supportNote.hidden = true;
  supportNote.textContent = "";
  previewCanvas.width = getPreviewSize();
  previewCanvas.height = getPreviewSize();
  previewCanvas.getContext("2d")?.clearRect(0, 0, previewCanvas.width, previewCanvas.height);

  selectedEmojiName.textContent = state.selectedEmoji.name;
  selectedEmojiMeta.textContent = `${selectedStyle.label} · ${tone.label} · ${getExportSize()} px`;
  downloadPngLabel.textContent = "PNG";
  downloadJpgLabel.textContent = "JPG";

  void drawEmojiImage(renderCanvas, renderedEmoji, selectedStyle)
    .then(() => {
      if (renderToken !== previewRenderToken) {
        return;
      }

      previewCanvas.width = renderCanvas.width;
      previewCanvas.height = renderCanvas.height;
      previewCanvas.getContext("2d")?.drawImage(renderCanvas, 0, 0);
    })
    .catch(() => {
      if (renderToken !== previewRenderToken) {
        return;
      }

      supportNote.textContent = `${selectedStyle.label} does not include ${state.selectedEmoji.name}. Choose another style or emoji.`;
      supportNote.hidden = false;
    });
}

function render(): void {
  renderStyleSelector();
  renderToneSelector();
  renderCategoryFilter();
  renderEmojiGrid();
  renderPreview();
}

async function download(format: "image/png" | "image/jpeg"): Promise<void> {
  const extension = format === "image/png" ? "png" : "jpg";
  const selectedStyle = getSelectedStyle();
  let blob: Blob;

  try {
    blob = await createEmojiBlob(getRenderedEmoji(), selectedStyle, format);
  } catch {
    supportNote.textContent = `${selectedStyle.label} does not include ${state.selectedEmoji.name}. Choose another style or emoji.`;
    supportNote.hidden = false;
    return;
  }

  const link = document.createElement("a");
  const objectUrl = URL.createObjectURL(blob);
  const name = state.selectedEmoji.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  link.href = objectUrl;
  link.download = `${name || "emoji"}-${state.selectedStyle}-${getExportSize()}.${extension}`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

styleSelector.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-style]");

  if (!button) {
    return;
  }

  state.selectedStyle = button.dataset.style as PlatformStyleId;
  render();
});

toneSelector.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-tone]");

  if (!button) {
    return;
  }

  state.selectedTone = button.dataset.tone as SkinToneId;
  render();
});

categoryFilter.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-category]");

  if (!button) {
    return;
  }

  state.selectedCategory = button.dataset.category as EmojiCategory | "All";
  render();
});

emojiGrid.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-emoji-index]");

  if (!button || button.dataset.supportState === "unsupported") {
    return;
  }

  const nextEmoji = emojiCatalog[Number(button.dataset.emojiIndex)];

  if (nextEmoji) {
    state.selectedEmoji = nextEmoji;
    render();
  }
});

emojiGrid.addEventListener(
  "load",
  (event) => {
    const image = event.target as HTMLElement;
    const tile = image.closest<HTMLButtonElement>(".emoji-tile");

    if (!tile || !image.classList.contains("asset-emoji-image")) {
      return;
    }

    tile.dataset.supportState = "supported";
  },
  true
);

emojiGrid.addEventListener(
  "error",
  (event) => {
    const image = event.target as HTMLImageElement;
    const tile = image.closest<HTMLButtonElement>(".emoji-tile");
    const emoji = tile?.dataset.emoji;

    if (!tile || !emoji || !image.classList.contains("asset-emoji-image")) {
      return;
    }

    const nextFallbackIndex = Number(image.dataset.fallbackIndex ?? 0) + 1;
    showBrowserFallbackAsset(tile, emoji, nextFallbackIndex);
  },
  true
);

emojiSearch.addEventListener("input", () => {
  state.query = emojiSearch.value;
  renderEmojiGrid();
});

downloadPng.addEventListener("click", () => {
  void download("image/png");
});

downloadJpg.addEventListener("click", () => {
  void download("image/jpeg");
});

render();
