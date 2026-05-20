import emojiMeta from "./emoji-meta.json";
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
    label: "Google Noto",
    kind: "asset",
    fontFamily: '"Noto Color Emoji", "Android Emoji", "Apple Color Emoji", "Segoe UI Emoji", emoji, sans-serif'
  },
  {
    id: "fluent3d",
    label: "Fluent 3D",
    kind: "asset",
    fontFamily: '"Segoe UI Emoji", "Segoe UI Symbol", "Apple Color Emoji", "Noto Color Emoji", emoji, sans-serif'
  },
  {
    id: "fluentFlat",
    label: "Fluent Flat",
    kind: "asset",
    fontFamily: '"Segoe UI Emoji", "Segoe UI Symbol", "Apple Color Emoji", "Noto Color Emoji", emoji, sans-serif'
  },
  {
    id: "twemoji",
    label: "Twemoji",
    kind: "asset",
    fontFamily: '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", emoji, sans-serif'
  },
  {
    id: "openmoji",
    label: "OpenMoji",
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
  "Components",
  "Animals",
  "Food",
  "Travel",
  "Activity",
  "Objects",
  "Symbols",
  "Flags"
];

const typedEmojiMeta = emojiMeta as EmojiMetaEntry[];

export const emojiCatalog: EmojiEntry[] = typedEmojiMeta.map((entry) => ({
  emoji: entry.emojiCode,
  name: entry.displayName,
  category: entry.type,
  keywords: entry.keywords,
  supportsTone: entry.supportsTone
}));
