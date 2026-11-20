export type WeddingFontCategory =
  | "Romantic & Script"
  | "Whimsical & Modern"
  | "Classic & Tailored";

export type WeddingBridalFontId =
  | "hwAnita"
  | "hwSeraphim"
  | "hwDarleen"
  | "hwJenna"
  | "hwRuthie"
  | "hwCaitlin"
  | "hwMadeline"
  | "hwJonathan"
  | "hwDavid"
  | "hwWill";

export type WeddingLegacyFontId = "hwChase" | "hwKate" | "hwAdam" | "hwCharity";
export type WeddingFontId = WeddingBridalFontId | WeddingLegacyFontId;

export interface WeddingFontOption {
  id: WeddingBridalFontId;
  handwryttenLabel: string;
  lineSpacing: number;
  displayName: string;
  vibe: string;
  category: WeddingFontCategory;
  cssFontFamily: string;
  fontFile: string;
  usesGlobalCssVar?: boolean;
}

export const WEDDING_DEFAULT_FONT_ID: WeddingBridalFontId = "hwAnita";

export const WEDDING_FONT_CATEGORIES: readonly WeddingFontCategory[] = [
  "Romantic & Script",
  "Whimsical & Modern",
  "Classic & Tailored",
];

export const WEDDING_BRIDAL_FONTS: readonly WeddingFontOption[] = [
  {
    id: "hwAnita",
    handwryttenLabel: "Ambitious Anita",
    lineSpacing: 0.7,
    displayName: "Heirloom Script",
    vibe: "Graceful, flowing italic cursive",
    category: "Romantic & Script",
    cssFontFamily: '"HW Anita", cursive',
    fontFile: "/fonts/hwAnita.ttf",
  },
  {
    id: "hwSeraphim",
    handwryttenLabel: "Sweet Seraphim",
    lineSpacing: 0.7,
    displayName: "Classic Cursive",
    vibe: "Warm, expressive wedding script",
    category: "Romantic & Script",
    cssFontFamily: '"HW Seraphim", cursive',
    fontFile: "/fonts/hwSeraphim.ttf",
  },
  {
    id: "hwDarleen",
    handwryttenLabel: "Darlin' Darleen",
    lineSpacing: 0.65,
    displayName: "Delicate Script",
    vibe: "Fine, gentle slanted cursive",
    category: "Romantic & Script",
    cssFontFamily: '"HW Darleen", cursive',
    fontFile: "/fonts/hwDarleen.ttf",
  },
  {
    id: "hwJenna",
    handwryttenLabel: "Fancy Jenna",
    lineSpacing: 0.6,
    displayName: "Fountain Cursive",
    vibe: "Classic fountain-pen loops",
    category: "Romantic & Script",
    cssFontFamily: '"HW Jenna", cursive',
    fontFile: "/fonts/hwJenna.ttf",
  },
  {
    id: "hwRuthie",
    handwryttenLabel: "Loopy Ruthie",
    lineSpacing: 0.7,
    displayName: "Whimsical Loop",
    vibe: "Playful, airy loops with charm",
    category: "Whimsical & Modern",
    cssFontFamily: '"HW Ruthie", cursive',
    fontFile: "/fonts/hwRuthie.ttf",
  },
  {
    id: "hwCaitlin",
    handwryttenLabel: "Cozy Caitlin",
    lineSpacing: 0.6,
    displayName: "Warm Everyday",
    vibe: "Clean, heartfelt everyday pen",
    category: "Whimsical & Modern",
    cssFontFamily: '"HW Caitlin", cursive',
    fontFile: "/fonts/hwCaitlin.ttf",
  },
  {
    id: "hwMadeline",
    handwryttenLabel: "Merry Madeline",
    lineSpacing: 0.5,
    displayName: "Modern Fine",
    vibe: "Slender, minimal modern print",
    category: "Whimsical & Modern",
    cssFontFamily: '"HW Madeline", cursive',
    fontFile: "/fonts/hwMadeline.ttf",
  },
  {
    id: "hwJonathan",
    handwryttenLabel: "Genuine Jonathan",
    lineSpacing: 0.7,
    displayName: "Timeless Cursive",
    vibe: "Refined, classic slanted cursive",
    category: "Classic & Tailored",
    cssFontFamily: '"HW Jonathan", cursive',
    fontFile: "/fonts/hwJonathan.ttf",
  },
  {
    id: "hwDavid",
    handwryttenLabel: "Casual David",
    lineSpacing: 0.6,
    displayName: "Natural Pen",
    vibe: "Easygoing, authentic everyday pen",
    category: "Classic & Tailored",
    cssFontFamily: "var(--font-hw-david), cursive",
    fontFile: "/fonts/hwDavid.ttf",
    usesGlobalCssVar: true,
  },
  {
    id: "hwWill",
    handwryttenLabel: "Dapper Will",
    lineSpacing: 0.6,
    displayName: "Tailored Caps",
    vibe: "Crisp, modern architectural print",
    category: "Classic & Tailored",
    cssFontFamily: "var(--font-hw-will), cursive",
    fontFile: "/fonts/hwWill.ttf",
    usesGlobalCssVar: true,
  },
];

const LEGACY_WEDDING_FONTS: Record<
  WeddingLegacyFontId,
  {
    id: WeddingLegacyFontId;
    handwryttenLabel: string;
    displayName: string;
    vibe: string;
    cssFontFamily: string;
  }
> = {
  hwChase: {
    id: "hwChase",
    handwryttenLabel: "Charming Chase",
    displayName: "Graceful Script",
    vibe: "Romantic, flowing script",
    cssFontFamily: "var(--font-hw-chase), cursive",
  },
  hwKate: {
    id: "hwKate",
    handwryttenLabel: "Carefree Kate",
    displayName: "Airy Cursive",
    vibe: "Light, natural cursive",
    cssFontFamily: "var(--font-hw-kate), cursive",
  },
  hwAdam: {
    id: "hwAdam",
    handwryttenLabel: "Executive Adam",
    displayName: "Clean Classic",
    vibe: "Neat, structured print",
    cssFontFamily: "var(--font-hw-adam), cursive",
  },
  hwCharity: {
    id: "hwCharity",
    handwryttenLabel: "Chill Charity",
    displayName: "Soft Modern",
    vibe: "Sweet, relaxed pen",
    cssFontFamily: "var(--font-hw-charity), cursive",
  },
};

export const ALL_SUPPORTED_WEDDING_FONT_IDS: readonly string[] = [
  ...WEDDING_BRIDAL_FONTS.map((f) => f.id),
  ...Object.keys(LEGACY_WEDDING_FONTS),
];

const BRIDAL_BY_ID = new Map<string, WeddingFontOption>(
  WEDDING_BRIDAL_FONTS.map((f) => [f.id, f]),
);

export function isSupportedWeddingFontId(id: string): boolean {
  return BRIDAL_BY_ID.has(id) || id in LEGACY_WEDDING_FONTS;
}

export function weddingFontCssFamily(id: string | undefined): string {
  if (!id) return BRIDAL_BY_ID.get(WEDDING_DEFAULT_FONT_ID)!.cssFontFamily;
  const bridal = BRIDAL_BY_ID.get(id);
  if (bridal) return bridal.cssFontFamily;
  if (id in LEGACY_WEDDING_FONTS) {
    return LEGACY_WEDDING_FONTS[id as WeddingLegacyFontId].cssFontFamily;
  }
  return BRIDAL_BY_ID.get(WEDDING_DEFAULT_FONT_ID)!.cssFontFamily;
}

export function weddingFontDisplayName(id: string | undefined): string {
  if (!id) return BRIDAL_BY_ID.get(WEDDING_DEFAULT_FONT_ID)!.displayName;
  const bridal = BRIDAL_BY_ID.get(id);
  if (bridal) return bridal.displayName;
  if (id in LEGACY_WEDDING_FONTS) {
    return LEGACY_WEDDING_FONTS[id as WeddingLegacyFontId].displayName;
  }
  return BRIDAL_BY_ID.get(WEDDING_DEFAULT_FONT_ID)!.displayName;
}
