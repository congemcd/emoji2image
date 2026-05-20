export type EmojiCategory =
  | "Smileys"
  | "People"
  | "Components"
  | "Animals"
  | "Food"
  | "Activity"
  | "Travel"
  | "Objects"
  | "Symbols"
  | "Flags";

export type EmojiEntry = {
  emoji: string;
  name: string;
  category: EmojiCategory;
  keywords: string[];
  supportsTone?: boolean;
};

export type EmojiMetaEntry = {
  emojiCode: string;
  displayName: string;
  type: EmojiCategory;
  keywords: string[];
  supportsTone?: boolean;
};

export type PlatformStyleId =
  | "apple"
  | "google"
  | "fluent3d"
  | "fluentFlat"
  | "twemoji"
  | "openmoji";

export type PlatformStyle = {
  id: PlatformStyleId;
  label: string;
  kind: "font" | "asset";
  fontFamily: string;
};

export type SkinToneId =
  | "default"
  | "light"
  | "mediumLight"
  | "medium"
  | "mediumDark"
  | "dark";

export type SkinTone = {
  id: SkinToneId;
  label: string;
  modifier: string;
  color: string;
};
