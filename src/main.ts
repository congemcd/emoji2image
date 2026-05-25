import "./styles.css";
import {
  Apple,
  ArrowDownToLine,
  Cat,
  Flag,
  Heart,
  Lightbulb,
  MapPinned,
  Search,
  Smile,
  UsersRound,
  Volleyball,
  createElement
} from "lucide";
import { categories, loadEmojiCatalog, platformStyles, skinTones } from "./emoji-data";
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
  selectedEmoji: EmojiEntry | null;
  selectedStyle: PlatformStyleId;
  selectedTone: SkinToneId;
  selectedCategory: EmojiCategory;
  query: string;
};

type IndexedEmojiEntry = {
  entry: EmojiEntry;
  index: number;
};

type EmojiCategoryGroup = {
  category: EmojiCategory;
  entries: IndexedEmojiEntry[];
};

type IdleDeadlineLike = {
  didTimeout: boolean;
  timeRemaining: () => number;
};

const categoryDisplay = {
  Smileys: { icon: Smile, label: "Smileys" },
  People: { icon: UsersRound, label: "People" },
  Components: { icon: Smile, label: "Components" },
  Animals: { icon: Cat, label: "Animals & Nature" },
  Food: { icon: Apple, label: "Food & Drink" },
  Activity: { icon: Volleyball, label: "Activity" },
  Travel: { icon: MapPinned, label: "Travel & Places" },
  Objects: { icon: Lightbulb, label: "Objects" },
  Symbols: { icon: Heart, label: "Symbols" },
  Flags: { icon: Flag, label: "Flags" }
};

type IdleCallbackHandle = ReturnType<typeof setTimeout> | number;

const browserFallbackStyleIds: PlatformStyleId[] = ["google", "fluentFlat", "twemoji", "openmoji"];
const defaultStyleFallbackIds: PlatformStyleId[] = ["google", "fluent3d", "twemoji", "openmoji"];
const browserFontSupportCache = new Map<string, boolean>();
let browserSupportObserver: IntersectionObserver | null = null;
let emojiCatalog: EmojiEntry[] = [];
let emojiGridRenderGeneration = 0;
let missingGlyphPixels: Uint8ClampedArray | null = null;
let supportCheckGeneration = 0;
let supportCheckQueue: Array<{ tile: HTMLElement; emoji: string; generation: number }> = [];
let supportCheckHandle: IdleCallbackHandle | null = null;
let previewFrameHandle = 0;
let activeCategoryFrameHandle = 0;

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("App container is missing.");
}

const state: AppState = {
  selectedEmoji: null,
  selectedStyle: getInitialStyleId(),
  selectedTone: "default",
  selectedCategory: "Smileys",
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

          <p class="selected-row" id="selectedEmojiName"></p>
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
        <button class="download-button" id="downloadJpg" type="button">
          <span class="button-icon" id="downloadJpgIcon" aria-hidden="true"></span>
          <span id="downloadJpgLabel"></span>
        </button>
        <button class="download-button primary" id="downloadPng" type="button">
          <span class="button-icon" id="downloadPngIcon" aria-hidden="true"></span>
          <span id="downloadPngLabel"></span>
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
      <p class="browser-note">
        Made with 🩷 by <a href="https://www.cong.ooo" target="_blank" rel="noreferrer">Cong</a>
      </p>
    </aside>
  </main>
`;

const previewCanvas = getElement<HTMLCanvasElement>("previewCanvas");
const selectedEmojiName = getElement<HTMLParagraphElement>("selectedEmojiName");
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
  if (!entry) {
    throw new Error("No emoji is selected.");
  }

  return applySkinTone(entry, getSelectedTone());
}

function getInitialStyleId(): PlatformStyleId {
  const availableStyles = getAvailablePlatformStyles();
  const availableStyleIds = new Set(availableStyles.map((style) => style.id));
  const deviceStyleId = getDeviceStyleId();

  if (deviceStyleId && availableStyleIds.has(deviceStyleId)) {
    return deviceStyleId;
  }

  return (
    defaultStyleFallbackIds.find((styleId) => availableStyleIds.has(styleId)) ??
    availableStyles[0].id
  );
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

function getDeviceStyleId(): PlatformStyleId | null {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const platform = nav.userAgentData?.platform ?? navigator.platform;
  const userAgent = navigator.userAgent;

  if (isAppleDevice()) {
    return "apple";
  }

  if (/Windows/i.test(platform) || /Windows/i.test(userAgent)) {
    return "fluent3d";
  }

  if (/Android|CrOS|Linux/i.test(platform) || /Android|CrOS|Linux/i.test(userAgent)) {
    return "google";
  }

  return null;
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
  const fragment = document.createDocumentFragment();

  categories.forEach((category) => {
    const display = categoryDisplay[category];
    const button = document.createElement("button");
    const icon = document.createElement("span");

    button.className = "category-button";
    button.type = "button";
    button.setAttribute("aria-pressed", String(category === state.selectedCategory));
    button.setAttribute("aria-label", display.label);
    button.dataset.category = category;
    button.title = display.label;

    icon.className = "category-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.append(
      createElement(display.icon, {
        width: 20,
        height: 20,
        "stroke-width": 2.4
      })
    );

    button.append(icon);
    fragment.append(button);
  });

  categoryFilter.replaceChildren(fragment);
}

function getEmojiGroups(): EmojiCategoryGroup[] {
  const normalizedQuery = state.query.trim().toLowerCase();
  const groups = new Map<EmojiCategory, IndexedEmojiEntry[]>(
    categories.map((category) => [category, []])
  );

  emojiCatalog.forEach((entry, index) => {
    const categoryGroup = groups.get(entry.category);

    if (!categoryGroup) {
      return;
    }

    if (!normalizedQuery) {
      categoryGroup.push({ entry, index });
      return;
    }

    const searchableText = [entry.name, entry.category, entry.emoji, ...entry.keywords]
      .join(" ")
      .toLowerCase();

    if (searchableText.includes(normalizedQuery)) {
      categoryGroup.push({ entry, index });
    }
  });

  return categories
    .map((category) => ({ category, entries: groups.get(category) ?? [] }))
    .filter((group) => group.entries.length > 0);
}

function renderEmojiGrid(): void {
  const emojiGroups = getEmojiGroups();
  emojiGridRenderGeneration += 1;

  if (emojiGroups.length === 0) {
    resetBrowserDefaultSupportObserver();
    emojiGrid.innerHTML = `<p class="empty-state">No emoji found.</p>`;
    return;
  }

  const supportGeneration = startBrowserDefaultSupportObserver();
  const fragment = document.createDocumentFragment();

  emojiGrid.replaceChildren();

  emojiGroups.forEach((group) => {
    const section = document.createElement("section");
    const heading = document.createElement("h2");
    const grid = document.createElement("div");

    section.className = "emoji-category-section";
    section.dataset.categorySection = group.category;

    heading.className = "emoji-category-heading";
    heading.textContent = categoryDisplay[group.category].label;

    grid.className = "emoji-category-grid";

    group.entries.forEach((indexedEntry) => {
      const tile = createEmojiTile(indexedEntry);
      grid.append(tile);
      observeEmojiTile(tile, supportGeneration);
    });

    section.append(heading, grid);
    fragment.append(section);
  });

  emojiGrid.append(fragment);
  updateActiveCategoryFromScroll();
}

function createEmojiTile({ entry, index }: IndexedEmojiEntry): HTMLButtonElement {
  const tile = document.createElement("button");
  const glyph = document.createElement("span");

  tile.className = "emoji-tile";
  tile.type = "button";
  tile.role = "option";
  tile.setAttribute("aria-selected", String(entry.emoji === state.selectedEmoji?.emoji));
  tile.dataset.emojiIndex = String(index);
  tile.dataset.emoji = entry.emoji;
  tile.title = entry.name;

  glyph.className = "emoji-tile-glyph";
  glyph.textContent = entry.emoji;
  tile.append(glyph);

  return tile;
}

function startBrowserDefaultSupportObserver(): number {
  resetBrowserDefaultSupportObserver();
  const generation = ++supportCheckGeneration;

  if (!("IntersectionObserver" in window)) {
    return generation;
  }

  browserSupportObserver = new IntersectionObserver(
    (observedTiles) => {
      for (const observedTile of observedTiles) {
        if (!observedTile.isIntersecting) {
          continue;
        }

        const tile = observedTile.target as HTMLElement;
        const emoji = tile.dataset.emoji;

        browserSupportObserver?.unobserve(tile);

        if (!emoji) {
          continue;
        }

        enqueueBrowserSupportCheck(tile, emoji, generation);
      }
    },
    {
      root: emojiGrid,
      rootMargin: "160px"
    }
  );

  return generation;
}

function observeEmojiTile(tile: HTMLElement, generation: number): void {
  if (browserSupportObserver) {
    browserSupportObserver.observe(tile);
    return;
  }

  const emoji = tile.dataset.emoji;

  if (emoji) {
    enqueueBrowserSupportCheck(tile, emoji, generation);
  }
}

function resetBrowserDefaultSupportObserver(): void {
  browserSupportObserver?.disconnect();
  browserSupportObserver = null;
  supportCheckGeneration += 1;
  supportCheckQueue = [];

  if (supportCheckHandle !== null) {
    cancelIdleWork(supportCheckHandle);
    supportCheckHandle = null;
  }
}

function enqueueBrowserSupportCheck(tile: HTMLElement, emoji: string, generation: number): void {
  supportCheckQueue.push({ tile, emoji, generation });
  scheduleBrowserSupportChecks();
}

function scheduleBrowserSupportChecks(): void {
  if (supportCheckHandle !== null) {
    return;
  }

  supportCheckHandle = requestIdleWork(processBrowserSupportChecks);
}

function processBrowserSupportChecks(deadline: IdleDeadlineLike): void {
  supportCheckHandle = null;
  let processedCount = 0;
  const maxChecksPerBatch = 6;

  while (
    supportCheckQueue.length > 0 &&
    processedCount < maxChecksPerBatch &&
    (deadline.timeRemaining() > 4 || deadline.didTimeout || processedCount < 3)
  ) {
    const nextCheck = supportCheckQueue.shift();

    if (!nextCheck) {
      continue;
    }

    const { tile, emoji, generation } = nextCheck;

    if (generation !== supportCheckGeneration || !tile.isConnected || tile.dataset.emoji !== emoji) {
      continue;
    }

    if (!isDefaultEmojiGlyphSupported(emoji)) {
      showBrowserFallbackAsset(tile, emoji, 0);
    }

    processedCount += 1;
  }

  if (supportCheckQueue.length > 0) {
    scheduleBrowserSupportChecks();
  }
}

function isDefaultEmojiGlyphSupported(emoji: string): boolean {
  const cachedResult = browserFontSupportCache.get(emoji);

  if (cachedResult !== undefined) {
    return cachedResult;
  }

  const emojiPixels = renderBrowserGlyphProbe(emoji);
  const isSupported = getPixelDifferenceRatio(emojiPixels, getMissingGlyphPixels()) > 0.08;

  browserFontSupportCache.set(emoji, isSupported);
  return isSupported;
}

function getMissingGlyphPixels(): Uint8ClampedArray {
  missingGlyphPixels ??= renderBrowserGlyphProbe(String.fromCodePoint(0x10ffff));
  return missingGlyphPixels;
}

function requestIdleWork(callback: (deadline: IdleDeadlineLike) => void): IdleCallbackHandle {
  const idleWindow = window as Window & {
    requestIdleCallback?: (
      callback: (deadline: IdleDeadlineLike) => void,
      options?: { timeout: number }
    ) => number;
  };

  if (idleWindow.requestIdleCallback) {
    return idleWindow.requestIdleCallback(callback, { timeout: 120 });
  }

  return window.setTimeout(() => {
    callback({
      didTimeout: true,
      timeRemaining: () => 0
    });
  }, 16);
}

function cancelIdleWork(handle: IdleCallbackHandle): void {
  const idleWindow = window as Window & {
    cancelIdleCallback?: (handle: number) => void;
  };

  if (idleWindow.cancelIdleCallback && typeof handle === "number") {
    idleWindow.cancelIdleCallback(handle);
    return;
  }

  window.clearTimeout(handle);
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
  const selectedEmoji = state.selectedEmoji;
  const selectedStyle = getSelectedStyle();
  const tone = getSelectedTone();

  supportNote.hidden = true;
  supportNote.textContent = "";

  if (!selectedEmoji) {
    previewCanvas.width = getPreviewSize();
    previewCanvas.height = getPreviewSize();
    previewCanvas.getContext("2d")?.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
    selectedEmojiName.textContent = "Loading emoji";
    downloadPng.disabled = true;
    downloadJpg.disabled = true;
    return;
  }

  selectedEmojiName.textContent = selectedEmoji.name;
  downloadPngLabel.textContent = "PNG";
  downloadJpgLabel.textContent = "JPG";
  downloadPng.disabled = false;
  downloadJpg.disabled = false;

  if (previewFrameHandle) {
    cancelAnimationFrame(previewFrameHandle);
  }

  previewFrameHandle = requestAnimationFrame(() => {
    const renderCanvas = document.createElement("canvas");
    const renderedEmoji = getRenderedEmoji(selectedEmoji);
    previewFrameHandle = 0;

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

        supportNote.textContent = `${selectedStyle.label} does not include ${selectedEmoji.name}. Choose another style or emoji.`;
        supportNote.hidden = false;
      });
  });
}

function render(): void {
  renderStyleSelector();
  renderToneSelector();
  renderCategoryFilter();
  renderEmojiGrid();
  renderPreview();
}

function updateRadioSelection(container: HTMLElement, dataAttribute: string, selectedValue: string): void {
  container.querySelectorAll<HTMLElement>(`[${dataAttribute}]`).forEach((button) => {
    button.setAttribute("aria-checked", String(button.dataset[toDatasetKey(dataAttribute)] === selectedValue));
  });
}

function updateCategorySelection(): void {
  categoryFilter.querySelectorAll<HTMLButtonElement>("[data-category]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.category === state.selectedCategory));
  });
}

function setActiveCategory(category: EmojiCategory): void {
  if (category === state.selectedCategory) {
    return;
  }

  state.selectedCategory = category;
  updateCategorySelection();
  categoryFilter
    .querySelector<HTMLButtonElement>(`[data-category="${CSS.escape(category)}"]`)
    ?.scrollIntoView({ block: "nearest", inline: "center" });
}

function updateActiveCategoryFromScroll(): void {
  const sections = Array.from(
    emojiGrid.querySelectorAll<HTMLElement>("[data-category-section]")
  );

  if (sections.length === 0) {
    return;
  }

  const gridTop = emojiGrid.getBoundingClientRect().top;
  let activeSection = sections[0];

  for (const section of sections) {
    const sectionTop = section.getBoundingClientRect().top;

    if (sectionTop <= gridTop + 28) {
      activeSection = section;
      continue;
    }

    break;
  }

  const category = activeSection.dataset.categorySection as EmojiCategory | undefined;

  if (category) {
    setActiveCategory(category);
  }
}

function scheduleActiveCategoryUpdate(): void {
  if (activeCategoryFrameHandle) {
    return;
  }

  activeCategoryFrameHandle = requestAnimationFrame(() => {
    activeCategoryFrameHandle = 0;
    updateActiveCategoryFromScroll();
  });
}

function updateEmojiSelection(selectedButton: HTMLButtonElement): void {
  emojiGrid
    .querySelector<HTMLButtonElement>('.emoji-tile[aria-selected="true"]')
    ?.setAttribute("aria-selected", "false");
  selectedButton.setAttribute("aria-selected", "true");
}

function toDatasetKey(attribute: string): string {
  return attribute.replace(/^data-/, "").replace(/-([a-z])/g, (_, letter: string) =>
    letter.toUpperCase()
  );
}

function setLoadingState(): void {
  emojiGrid.innerHTML = `<p class="empty-state">Loading emoji...</p>`;
  downloadPngLabel.textContent = "PNG";
  downloadJpgLabel.textContent = "JPG";
  downloadPng.disabled = true;
  downloadJpg.disabled = true;
  renderStyleSelector();
  renderToneSelector();
  renderCategoryFilter();
  renderPreview();
}

async function download(format: "image/png" | "image/jpeg"): Promise<void> {
  if (!state.selectedEmoji) {
    return;
  }

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

  if (!button || button.dataset.style === state.selectedStyle) {
    return;
  }

  state.selectedStyle = button.dataset.style as PlatformStyleId;
  updateRadioSelection(styleSelector, "data-style", state.selectedStyle);
  renderPreview();
});

toneSelector.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-tone]");

  if (!button || button.dataset.tone === state.selectedTone) {
    return;
  }

  state.selectedTone = button.dataset.tone as SkinToneId;
  updateRadioSelection(toneSelector, "data-tone", state.selectedTone);
  renderPreview();
});

categoryFilter.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-category]");

  if (!button) {
    return;
  }

  const category = button.dataset.category as EmojiCategory;
  const section = emojiGrid.querySelector<HTMLElement>(
    `[data-category-section="${CSS.escape(category)}"]`
  );

  if (!section) {
    return;
  }

  setActiveCategory(category);
  section.scrollIntoView({ behavior: "auto", block: "start" });
});

emojiGrid.addEventListener("scroll", scheduleActiveCategoryUpdate);

emojiGrid.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-emoji-index]");

  if (!button || button.dataset.supportState === "unsupported") {
    return;
  }

  const nextEmoji = emojiCatalog[Number(button.dataset.emojiIndex)];

  if (nextEmoji) {
    state.selectedEmoji = nextEmoji;
    updateEmojiSelection(button);
    renderPreview();
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

setLoadingState();
void initializeApp();

async function initializeApp(): Promise<void> {
  try {
    emojiCatalog = await loadEmojiCatalog();
    state.selectedEmoji = emojiCatalog[0] ?? null;
    render();
  } catch (error) {
    emojiGrid.innerHTML = `<p class="empty-state">Unable to load emoji.</p>`;
    selectedEmojiName.textContent =
      error instanceof Error ? `Emoji unavailable: ${error.message}` : "Emoji unavailable";
  }
}
