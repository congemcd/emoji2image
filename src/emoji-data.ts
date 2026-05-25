import type { EmojiCategory, EmojiEntry, EmojiMetaEntry, PlatformStyle, SkinTone } from "./types";

export const platformStyles: PlatformStyle[] = [
  {
    id: "apple",
    label: "Apple",
    kind: "font",
    fontFamily: '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", emoji, sans-serif'
  },
  {
    id: "google",
    label: "Google",
    kind: "asset",
    fontFamily: '"Noto Color Emoji", "Android Emoji", "Apple Color Emoji", "Segoe UI Emoji", emoji, sans-serif'
  },
  {
    id: "fluent3d",
    label: "Microsoft 3D",
    kind: "asset",
    fontFamily: '"Segoe UI Emoji", "Segoe UI Symbol", "Apple Color Emoji", "Noto Color Emoji", emoji, sans-serif'
  },
  {
    id: "fluentFlat",
    label: "Microsoft Flat",
    kind: "asset",
    fontFamily: '"Segoe UI Emoji", "Segoe UI Symbol", "Apple Color Emoji", "Noto Color Emoji", emoji, sans-serif'
  },
  {
    id: "twemoji",
    label: "X",
    kind: "asset",
    fontFamily: '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", emoji, sans-serif'
  },
  {
    id: "openmoji",
    label: "Github",
    kind: "asset",
    fontFamily: '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", emoji, sans-serif'
  }
];

export const skinTones: SkinTone[] = [
  { id: "default", label: "Default", modifier: "", color: "#ffd43b" },
  { id: "light", label: "Light", modifier: "🏻", color: "#f7dfc4" },
  { id: "mediumLight", label: "Medium light", modifier: "🏼", color: "#e2b98f" },
  { id: "medium", label: "Medium", modifier: "🏽", color: "#c58c5c" },
  { id: "mediumDark", label: "Medium dark", modifier: "🏾", color: "#8d5524" },
  { id: "dark", label: "Dark", modifier: "🏿", color: "#4b2e1f" }
];

export const categories: EmojiCategory[] = [
  "Smileys",
  "People",
  "Animals",
  "Food",
  "Activity",
  "Travel",
  "Objects",
  "Symbols",
  "Flags"
];

let emojiCatalogPromise: Promise<EmojiEntry[]> | null = null;

export function loadEmojiCatalog(): Promise<EmojiEntry[]> {
  emojiCatalogPromise ??= import("./emoji-meta.json").then((module) =>
    (module.default as EmojiMetaEntry[]).map(mapEmojiMetaEntry)
  );

  return emojiCatalogPromise;
}

function mapEmojiMetaEntry(entry: EmojiMetaEntry): EmojiEntry {
  return {
    emoji: entry.emojiCode,
    name: entry.displayName,
    category: entry.type,
    keywords: entry.keywords,
    supportsTone: entry.supportsTone
  };
}
