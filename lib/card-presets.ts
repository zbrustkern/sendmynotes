export interface CardPreset {
  id: string;
  occasion: string;
  title: string;
  prompt: string;
  imageUrl: string;
  defaultPrintedMessage: string;
  defaultHandwrittenNote: string;
}

export const OCCASIONS = [
  "Birthday",
  "Thank You",
  "Thinking of You",
  "Congratulations",
  "Anniversary",
  "Love & Romance",
  "Sympathy & Support",
  "Just Because",
] as const;

export const CARD_PRESETS: CardPreset[] = [
  {
    id: "preset-bday-balloons",
    occasion: "Birthday",
    title: "Golden Hour Balloons",
    prompt: "Whimsical watercolor birthday balloons floating into soft pastel sunset sky, gold foil flecks, elegant 5:7 greeting card cover art",
    imageUrl: "https://images.unsplash.com/photo-1530103862676-de8c9debad1d?auto=format&fit=crop&w=1250&h=1750&q=80",
    defaultPrintedMessage: "Wishing you a year filled with magic and joy.",
    defaultHandwrittenNote: "Happy Birthday! So proud of everything you have accomplished this year. Here is to celebrating many more milestones together!",
  },
  {
    id: "preset-thankyou-botanical",
    occasion: "Thank You",
    title: "Wildflower Meadow",
    prompt: "Warm botanical gouache painting of blooming lavender and chamomile wildflowers, textured paper background, gentle aesthetic 5:7 greeting card",
    imageUrl: "https://images.unsplash.com/photo-1490750967868-88aa4486c946?auto=format&fit=crop&w=1250&h=1750&q=80",
    defaultPrintedMessage: "With heartfelt gratitude.",
    defaultHandwrittenNote: "Thank you so much for your generosity, kindness, and support. It truly meant the world to me and I will never forget it!",
  },
  {
    id: "preset-thinking-coffee",
    occasion: "Thinking of You",
    title: "Quiet Morning Breeze",
    prompt: "Cozy minimalist illustration of a warm ceramic cup with steam swirling into gentle clouds, soft earth tones, warm greeting card art 5:7",
    imageUrl: "https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=1250&h=1750&q=80",
    defaultPrintedMessage: "Thinking of you today and always.",
    defaultHandwrittenNote: "Just wanted to send a little piece of sunshine your way. Hope today treats you kindly. Can't wait to catch up soon!",
  },
  {
    id: "preset-congrats-champagne",
    occasion: "Congratulations",
    title: "Celebration Starlight",
    prompt: "Sparkling vintage champagne coupe with golden effervescence, starry night background, celebratory greeting card art 5:7",
    imageUrl: "https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?auto=format&fit=crop&w=1250&h=1750&q=80",
    defaultPrintedMessage: "Cheers to your incredible achievement!",
    defaultHandwrittenNote: "Huge congratulations! Your hard work and relentless dedication have paid off in the most wonderful way. Pop the bubbly!",
  },
  {
    id: "preset-anniv-monstera",
    occasion: "Anniversary",
    title: "Evergreen Botanicals",
    prompt: "Lush deep emerald monstera and eucalyptus leaves with delicate golden geometry, intimate card design 5:7",
    imageUrl: "https://images.unsplash.com/photo-1518531933037-91b2f5f229cc?auto=format&fit=crop&w=1250&h=1750&q=80",
    defaultPrintedMessage: "Another year of love and laughter.",
    defaultHandwrittenNote: "Happy Anniversary my love! Every single day with you is a gift. Thank you for being my rock and my best friend.",
  },
  {
    id: "preset-love-roses",
    occasion: "Love & Romance",
    title: "Velvet Blossoms",
    prompt: "Moody renaissance oil painting style of vintage blush garden roses on dark linen background, timeless greeting card portrait 5:7",
    imageUrl: "https://images.unsplash.com/photo-1518895949257-7621c3c786d7?auto=format&fit=crop&w=1250&h=1750&q=80",
    defaultPrintedMessage: "Forever grateful for you.",
    defaultHandwrittenNote: "Just a reminder of how deeply you are loved. You make life so much more beautiful every single day.",
  },
];

export const FONT_OPTIONS = [
  {
    id: "font-classic",
    name: "Classic Script",
    sample: "Warm, flowing handwritten cursive with graceful loops",
    fontClass: "font-handwriting",
    description: "Classic cursive pen strokes, perfect for warm personal letters and sentiments.",
    handwryttenFontId: "1", // David / Standard Cursive
  },
  {
    id: "font-casual",
    name: "Casual Print",
    sample: "Clean, natural everyday print with organic pen weight",
    fontClass: "font-sans font-medium tracking-wide",
    description: "Friendly everyday penmanship with clean readability and human rhythm.",
    handwryttenFontId: "2", // Casual Print
  },
  {
    id: "font-calligraphy",
    name: "Modern Calligraphy",
    sample: "Elegant dancing calligraphy with expressive flourishes",
    fontClass: "font-script",
    description: "Artistic, expressive flourished lettering ideal for milestone celebrations.",
    handwryttenFontId: "3", // Modern Calligraphy
  },
];
