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
  "Christmas & Holidays",
  "Halloween",
  "Easter & Spring",
] as const;

export type MessageTone = "warm" | "funny" | "short" | "poetic";

export interface MessageInspiration {
  printed?: string;
  handwritten: string;
  tone: MessageTone;
  tag: string;
}

export const OCCASION_MESSAGE_BANK: Record<string, MessageInspiration[]> = {
  Birthday: [
    {
      tone: "warm",
      tag: "Heartfelt",
      handwritten: "Happy Birthday! Wishing you a year filled with magic, laughter, and milestones together. So proud of everything you have accomplished this year!",
    },
    {
      tone: "warm",
      tag: "Heartfelt",
      handwritten: "Wishing the happiest of birthdays to one of my favorite humans! Thank you for always bringing so much warmth and light into the world.",
    },
    {
      tone: "funny",
      tag: "Playful",
      handwritten: "Happy Birthday! You don’t look a day older than the age you claim to be. Wishing you wine, cake, and zero adult responsibilities today!",
    },
    {
      tone: "funny",
      tag: "Playful",
      handwritten: "Happy Birthday! I was going to make a joke about getting older, but I respect my elders. Have an amazing celebration today!",
    },
    {
      tone: "short",
      tag: "Brief",
      handwritten: "Happy Birthday! Cheers to you today—hope your day is filled with all your favorite things and lots of cake.",
    },
    {
      tone: "short",
      tag: "Brief",
      handwritten: "Wishing you the happiest birthday and a fantastic year ahead! Sending you big hugs across the miles.",
    },
    {
      tone: "poetic",
      tag: "Literary",
      handwritten: "Another trip around the sun, another chapter of beautiful memories. May your coming year be as kind, bright, and remarkable as you are. Happy Birthday!",
    },
    {
      tone: "poetic",
      tag: "Literary",
      handwritten: "May this year open doors you haven't yet imagined and bring peace to every quiet corner of your life. Warmest birthday blessings.",
    },
  ],
  "Thank You": [
    {
      tone: "warm",
      tag: "Heartfelt",
      handwritten: "Thank you so much for your generosity, kindness, and support. It truly meant the world to me and I am so grateful to have you in my corner!",
    },
    {
      tone: "warm",
      tag: "Heartfelt",
      handwritten: "I cannot thank you enough for being so thoughtful and dependable. People like you make the world a much better place.",
    },
    {
      tone: "funny",
      tag: "Playful",
      handwritten: "You are an absolute rockstar. Thanks for saving the day and making life infinitely better! Drinks are definitely on me next time.",
    },
    {
      tone: "funny",
      tag: "Playful",
      handwritten: "You truly didn't have to, but I'm thrilled that you did! Thank you for being ridiculously awesome.",
    },
    {
      tone: "short",
      tag: "Brief",
      handwritten: "Just wanted to send a quick note of gratitude. Thank you so much for everything!",
    },
    {
      tone: "short",
      tag: "Brief",
      handwritten: "Deeply grateful for your kindness and time. Thank you from the bottom of my heart.",
    },
    {
      tone: "poetic",
      tag: "Literary",
      handwritten: "Your quiet generosity touched my heart more than words can carry. Gratitude turns what we have into enough—thank you for being such an extraordinary light.",
    },
    {
      tone: "poetic",
      tag: "Literary",
      handwritten: "In the rush of everyday life, your thoughtfulness stood out like a steady flame. Thank you for your grace and kindness.",
    },
  ],
  "Thinking of You": [
    {
      tone: "warm",
      tag: "Heartfelt",
      handwritten: "Just wanted to send a little piece of sunshine your way. Hope today treats you kindly. Thinking of you and can't wait to catch up soon!",
    },
    {
      tone: "warm",
      tag: "Heartfelt",
      handwritten: "You crossed my mind today and I wanted to send a quick reminder of how much you are loved and appreciated. Hope you're smiling today!",
    },
    {
      tone: "funny",
      tag: "Playful",
      handwritten: "Look at that—actual physical mail that isn't a utility bill or coupon flyer! Thinking of you and sending big hugs from across the miles.",
    },
    {
      tone: "funny",
      tag: "Playful",
      handwritten: "Sending you this card as proof that I love you enough to write something down on actual paper. Hope you're having an awesome week!",
    },
    {
      tone: "short",
      tag: "Brief",
      handwritten: "Sending you warmth from afar. You've been on my mind lately and I hope you're having a wonderful day!",
    },
    {
      tone: "poetic",
      tag: "Literary",
      handwritten: "Distance means so little when friendship means so much. Even in the busiest days, you cross my thoughts. Sending a quiet moment of peace your way.",
    },
  ],
  Congratulations: [
    {
      tone: "warm",
      tag: "Heartfelt",
      handwritten: "Huge congratulations! Your hard work and relentless dedication have paid off in the most wonderful way. So proud of you—pop the bubbly!",
    },
    {
      tone: "warm",
      tag: "Heartfelt",
      handwritten: "So thrilled to celebrate this incredible milestone with you! You earned every bit of this success and I can't wait to see what you do next.",
    },
    {
      tone: "funny",
      tag: "Playful",
      handwritten: "Huge congratulations! We always knew you were a genius, but now it's official. Don't forget the little people now that you're famous!",
    },
    {
      tone: "short",
      tag: "Brief",
      handwritten: "You did it! Huge congratulations on this well-deserved success. Celebrating you today!",
    },
    {
      tone: "poetic",
      tag: "Literary",
      handwritten: "Here is to new horizons and bright beginnings. May this victory be merely the first light of a magnificent dawn. So deeply honored to celebrate your brilliance.",
    },
  ],
  Anniversary: [
    {
      tone: "warm",
      tag: "Heartfelt",
      handwritten: "Happy Anniversary my love! Every single day with you is a gift. Thank you for being my rock, my best friend, and my favorite adventure.",
    },
    {
      tone: "funny",
      tag: "Playful",
      handwritten: "Happy Anniversary! Another year of successfully pretending we have our lives together. There is no one else I would rather share the remote with.",
    },
    {
      tone: "short",
      tag: "Brief",
      handwritten: "Happy Anniversary! Thank you for another wonderful year by my side. Here is to a lifetime more.",
    },
    {
      tone: "poetic",
      tag: "Literary",
      handwritten: "In a world of constant noise and fleeting seasons, your love is my steady harbor. Happy Anniversary to my whole heart.",
    },
  ],
  "Love & Romance": [
    {
      tone: "warm",
      tag: "Heartfelt",
      handwritten: "Just a reminder of how deeply you are loved. You make life so much brighter, richer, and sweeter every single day. Forever grateful for you.",
    },
    {
      tone: "funny",
      tag: "Playful",
      handwritten: "Just a little love note to remind you that I love you more than morning coffee. And that is saying an awful lot. Love you always!",
    },
    {
      tone: "short",
      tag: "Brief",
      handwritten: "Loving you is the easiest and best thing in the world. Always and forever yours.",
    },
    {
      tone: "poetic",
      tag: "Literary",
      handwritten: "Whatever our souls are made of, yours and mine are carved from the exact same star. You are my favorite place to go when my mind searches for peace.",
    },
  ],
  "Sympathy & Support": [
    {
      tone: "warm",
      tag: "Heartfelt",
      handwritten: "There are no words to ease your pain, but please know we are surrounding you with love, comfort, and unwavering support during this difficult time.",
    },
    {
      tone: "short",
      tag: "Brief",
      handwritten: "Sending you strength and peace. Holding you close in my thoughts and here for you whenever you need anything at all.",
    },
    {
      tone: "poetic",
      tag: "Literary",
      handwritten: "Those we love never truly leave us. May gentle memories bring you comfort, and may you feel the quiet embrace of love that will never fade.",
    },
  ],
  "Just Because": [
    {
      tone: "warm",
      tag: "Heartfelt",
      handwritten: "No special occasion needed—just wanted to send some love your way and say I appreciate you more than you know! Hope your week is wonderful.",
    },
    {
      tone: "funny",
      tag: "Playful",
      handwritten: "Because texts are boring, emails are stressful, and real stationery is legendary. Hope this handwritten note brings a big smile to your face today!",
    },
    {
      tone: "short",
      tag: "Brief",
      handwritten: "Just a little note to say hello and brighten your day. Thinking of you and hoping your week is off to a great start!",
    },
  ],
  "Christmas & Holidays": [
    {
      tone: "warm",
      tag: "Heartfelt",
      handwritten: "Warmest holiday wishes! May your home be blessed with peace, laughter, and cozy moments this season. Here is to a healthy, joyous new year ahead!",
    },
    {
      tone: "funny",
      tag: "Playful",
      handwritten: "Merry Christmas! May your cookies be sweet, your eggnog be strong, and your holiday shopping be entirely finished. Warmest festive wishes!",
    },
    {
      tone: "poetic",
      tag: "Literary",
      handwritten: "In the quiet chill of winter, may your hearth be warm and your heart full of contentment. Wishing you the sacred blessings and wonder of the season.",
    },
  ],
  Halloween: [
    {
      tone: "warm",
      tag: "Festive",
      handwritten: "Wishing you a spooky and sweet Halloween! Hope your October is filled with cozy sweaters, pumpkin spice, apple cider, and lots of festive fun!",
    },
    {
      tone: "funny",
      tag: "Playful",
      handwritten: "Happy Halloween! If you need me, I will be hiding under a blanket eating 85% of the candy I bought for trick-or-treaters. Eat, drink, and be scary!",
    },
  ],
  "Easter & Spring": [
    {
      tone: "warm",
      tag: "Heartfelt",
      handwritten: "Wishing you the renewed joy and blessings of Easter! May this spring season bring fresh hope, warm sunshine, and beautiful beginnings to you and your loved ones.",
    },
    {
      tone: "short",
      tag: "Brief",
      handwritten: "Wishing you a joyful Easter filled with family, sunshine, and sweet treats! Happy Spring!",
    },
  ],
};

export const CARD_PRESETS: CardPreset[] = [
  {
    id: "preset-bday-balloons",
    occasion: "Birthday",
    title: "Golden Hour Balloons",
    prompt: "Whimsical watercolor birthday balloons floating into soft pastel sunset sky with shimmering gold foil flecks",
    imageUrl: "/presets/birthday-balloons.jpg",
    defaultPrintedMessage: "",
    defaultHandwrittenNote: "Happy Birthday! Wishing you a year filled with magic, laughter, and milestones together. So proud of everything you have accomplished this year!",
  },
  {
    id: "preset-thankyou-botanical",
    occasion: "Thank You",
    title: "Wildflower Meadow",
    prompt: "Warm botanical gouache painting of blooming lavender and chamomile wildflowers in a sunlit meadow",
    imageUrl: "/presets/thank-you-botanical.jpg",
    defaultPrintedMessage: "",
    defaultHandwrittenNote: "Thank you so much for your generosity, kindness, and support. It truly meant the world to me and I am so grateful to have you in my corner!",
  },
  {
    id: "preset-thinking-coffee",
    occasion: "Thinking of You",
    title: "Quiet Morning Breeze",
    prompt: "Cozy minimalist illustration of a warm ceramic cup with steam swirling into gentle clouds, soft earth tones",
    imageUrl: "/presets/thinking-of-you-coffee.jpg",
    defaultPrintedMessage: "",
    defaultHandwrittenNote: "Just wanted to send a little piece of sunshine your way. Hope today treats you kindly. Thinking of you and can't wait to catch up soon!",
  },
  {
    id: "preset-congrats-champagne",
    occasion: "Congratulations",
    title: "Celebration Starlight",
    prompt: "Sparkling vintage champagne coupe with golden effervescence, starry night background, celebratory starlight",
    imageUrl: "/presets/congrats-champagne.jpg",
    defaultPrintedMessage: "",
    defaultHandwrittenNote: "Huge congratulations! Your hard work and relentless dedication have paid off in the most wonderful way. So proud of you—pop the bubbly!",
  },
  {
    id: "preset-anniv-monstera",
    occasion: "Anniversary",
    title: "Evergreen Botanicals",
    prompt: "Lush deep emerald monstera and eucalyptus leaves with delicate golden geometry, intimate botanical art",
    imageUrl: "/presets/anniversary-monstera.jpg",
    defaultPrintedMessage: "",
    defaultHandwrittenNote: "Happy Anniversary my love! Every single day with you is a gift. Thank you for being my rock, my best friend, and my favorite adventure.",
  },
  {
    id: "preset-love-roses",
    occasion: "Love & Romance",
    title: "Velvet Blossoms",
    prompt: "Moody renaissance oil painting style of vintage blush garden roses on dark linen background, timeless floral portrait",
    imageUrl: "/presets/love-roses.jpg",
    defaultPrintedMessage: "",
    defaultHandwrittenNote: "Just a little reminder of how deeply you are loved. You make life so much brighter, richer, and sweeter every single day. Forever grateful for you.",
  },
];

export interface FontOption {
  id: string;
  name: string;
  sample: string;
  fontClass: string;
  fontFamily: string;
  description: string;
  handwryttenFontId: string;
  handwryttenFontLabel: string;
}

export const ALL_FONT_CANDIDATES: FontOption[] = [
  {
    id: "hwDavid",
    name: "Casual David",
    sample: "Natural, everyday ballpoint penmanship with authentic cadence",
    fontClass: "font-hwDavid",
    fontFamily: "var(--font-hw-david), 'HandwryttenDavid', cursive",
    description: "Clean, natural everyday print with effortless charm. Recommended.",
    handwryttenFontId: "hwDavid",
    handwryttenFontLabel: "Casual David",
  },
  {
    id: "hwChase",
    name: "Charming Chase",
    sample: "Expressive, stylish modern handwriting with slight slant",
    fontClass: "font-hwChase",
    fontFamily: "var(--font-hw-chase), 'HandwryttenChase', cursive",
    description: "Artistic, expressive lettering ideal for personal notes and celebrations.",
    handwryttenFontId: "hwChase",
    handwryttenFontLabel: "Charming Chase",
  },
  {
    id: "hwKate",
    name: "Carefree Kate",
    sample: "Graceful, rounded cursive with elegant flowing connections",
    fontClass: "font-hwKate",
    fontFamily: "var(--font-hw-kate), 'HandwryttenKate', cursive",
    description: "Flowing cursive handwriting with warmth and grace.",
    handwryttenFontId: "hwKate",
    handwryttenFontLabel: "Carefree Kate",
  },
  {
    id: "hwAdam",
    name: "Executive Adam",
    sample: "Confident, upright architectural all-caps lettering",
    fontClass: "font-hwAdam",
    fontFamily: "var(--font-hw-adam), 'HandwryttenAdam', cursive",
    description: "Strong architectural all-caps lettering, ideal for business and notes.",
    handwryttenFontId: "hwAdam",
    handwryttenFontLabel: "Executive Adam",
  },
  {
    id: "hwWill",
    name: "Dapper Will",
    sample: "Clean, measured drafting-pen all-caps print",
    fontClass: "font-hwWill",
    fontFamily: "var(--font-hw-will), 'HandwryttenWill', monospace",
    description: "Architectural upright drafting print with crisp geometric rhythm.",
    handwryttenFontId: "hwWill",
    handwryttenFontLabel: "Dapper Will",
  },
];

export function getCohortFontOptions(cohort: "A" | "B" = "A"): FontOption[] {
  if (cohort === "B") {
    return [
      ALL_FONT_CANDIDATES[0], // Casual David
      ALL_FONT_CANDIDATES[1], // Charming Chase
      ALL_FONT_CANDIDATES[2], // Carefree Kate
      ALL_FONT_CANDIDATES[4], // Dapper Will (Cohort B candidate)
    ];
  }
  return [
    ALL_FONT_CANDIDATES[0], // Casual David
    ALL_FONT_CANDIDATES[1], // Charming Chase
    ALL_FONT_CANDIDATES[2], // Carefree Kate
    ALL_FONT_CANDIDATES[3], // Executive Adam (Cohort A candidate)
  ];
}

export const FONT_OPTIONS: FontOption[] = getCohortFontOptions("A");


