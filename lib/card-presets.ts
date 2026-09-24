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
  printed: string;
  handwritten: string;
  tone: MessageTone;
  tag: string;
}

export const OCCASION_MESSAGE_BANK: Record<string, MessageInspiration[]> = {
  Birthday: [
    {
      tone: "warm",
      tag: "Heartfelt",
      printed: "Wishing you a year filled with magic and joy.",
      handwritten: "Happy Birthday! So proud of everything you have accomplished this year. Here is to celebrating many more milestones together!",
    },
    {
      tone: "funny",
      tag: "Playful",
      printed: "Another year wiser (and more fabulous).",
      handwritten: "Happy Birthday! You don’t look a day older than the age you claim to be. Wishing you wine, cake, and zero adult responsibilities today!",
    },
    {
      tone: "short",
      tag: "Brief",
      printed: "Cheers to you today.",
      handwritten: "Happy Birthday! Hope today brings you all your favorite things.",
    },
    {
      tone: "poetic",
      tag: "Literary",
      printed: "May every season ahead bring you grace and wonder.",
      handwritten: "Another trip around the sun, another chapter of beautiful memories. May your coming year be as kind, bright, and remarkable as you are.",
    },
  ],
  "Thank You": [
    {
      tone: "warm",
      tag: "Heartfelt",
      printed: "With sincere appreciation and gratitude.",
      handwritten: "Thank you so much for your generosity, kindness, and support. It truly meant the world to me and I will never forget it!",
    },
    {
      tone: "funny",
      tag: "Playful",
      printed: "You truly didn't have to (but I'm glad you did).",
      handwritten: "You are an absolute rockstar. Thanks for saving the day and making life infinitely better! Drinks are on me next time.",
    },
    {
      tone: "short",
      tag: "Brief",
      printed: "Deeply grateful for your kindness.",
      handwritten: "Just wanted to send a quick note of gratitude. Thank you for everything!",
    },
    {
      tone: "poetic",
      tag: "Literary",
      printed: "Gratitude turns what we have into enough.",
      handwritten: "Your quiet generosity and warmth touched my heart more than words can carry. Thank you for being such an extraordinary light.",
    },
  ],
  "Thinking of You": [
    {
      tone: "warm",
      tag: "Heartfelt",
      printed: "Thinking of you today and always.",
      handwritten: "Just wanted to send a little piece of sunshine your way. Hope today treats you kindly. Can't wait to catch up soon!",
    },
    {
      tone: "funny",
      tag: "Playful",
      printed: "A real physical piece of mail for your coffee table.",
      handwritten: "Look at that—actual mail that isn't a utility bill or coupon flyer! Thinking of you and sending big hugs from across the miles.",
    },
    {
      tone: "short",
      tag: "Brief",
      printed: "Sending you warmth from afar.",
      handwritten: "You've been on my mind lately. Hope you're doing well and smiling today!",
    },
    {
      tone: "poetic",
      tag: "Literary",
      printed: "Distance means so little when friendship means so much.",
      handwritten: "Even in the busiest days, you cross my thoughts. Sending a quiet moment of peace and fond memories your way.",
    },
  ],
  Congratulations: [
    {
      tone: "warm",
      tag: "Heartfelt",
      printed: "Cheers to your incredible achievement!",
      handwritten: "Huge congratulations! Your hard work and relentless dedication have paid off in the most wonderful way. Pop the bubbly!",
    },
    {
      tone: "funny",
      tag: "Playful",
      printed: "Hard work pays off (and you made it look easy).",
      handwritten: "Huge congratulations! We always knew you were a genius, but now it's official. Don't forget the little people now that you're famous!",
    },
    {
      tone: "short",
      tag: "Brief",
      printed: "So thrilled for your milestone!",
      handwritten: "You did it! Huge congratulations on this well-deserved success.",
    },
    {
      tone: "poetic",
      tag: "Literary",
      printed: "Here is to new horizons and bright beginnings.",
      handwritten: "May this victory be merely the first light of a magnificent dawn. So deeply honored to celebrate your brilliance.",
    },
  ],
  Anniversary: [
    {
      tone: "warm",
      tag: "Heartfelt",
      printed: "Another year of love and laughter.",
      handwritten: "Happy Anniversary my love! Every single day with you is a gift. Thank you for being my rock and my best friend.",
    },
    {
      tone: "funny",
      tag: "Playful",
      printed: "Still crazy about you (and just plain crazy).",
      handwritten: "Happy Anniversary! Another year of successfully pretending we have our lives together. There is no one else I would rather share the remote with.",
    },
    {
      tone: "short",
      tag: "Brief",
      printed: "To the love that grows sweeter with time.",
      handwritten: "Happy Anniversary! Thank you for another wonderful year by my side.",
    },
    {
      tone: "poetic",
      tag: "Literary",
      printed: "Two souls, one timeless journey.",
      handwritten: "In a world of constant noise and fleeting seasons, your love is my steady harbor. Happy Anniversary to my whole heart.",
    },
  ],
  "Love & Romance": [
    {
      tone: "warm",
      tag: "Heartfelt",
      printed: "Forever grateful for you.",
      handwritten: "Just a reminder of how deeply you are loved. You make life so much more beautiful every single day.",
    },
    {
      tone: "funny",
      tag: "Playful",
      printed: "You stole my heart (and never gave it back).",
      handwritten: "Just a little love note to remind you that I love you more than morning coffee. And that is saying a lot.",
    },
    {
      tone: "short",
      tag: "Brief",
      printed: "Always and forever yours.",
      handwritten: "Loving you is the easiest thing in the world. Have a wonderful day!",
    },
    {
      tone: "poetic",
      tag: "Literary",
      printed: "You are my favorite place to go when my mind searches for peace.",
      handwritten: "Whatever our souls are made of, yours and mine are carved from the exact same star. Thinking of you always.",
    },
  ],
  "Sympathy & Support": [
    {
      tone: "warm",
      tag: "Heartfelt",
      printed: "Holding you close in our thoughts and prayers.",
      handwritten: "There are no words to ease your pain, but please know we are surrounding you with love, comfort, and unwavering support during this difficult time.",
    },
    {
      tone: "short",
      tag: "Brief",
      printed: "With deepest sympathy.",
      handwritten: "Sending you strength and peace. Here for you whenever you need anything at all.",
    },
    {
      tone: "poetic",
      tag: "Literary",
      printed: "Those we love never truly leave us.",
      handwritten: "May gentle memories bring you comfort, and may you feel the quiet embrace of love that will never fade.",
    },
  ],
  "Just Because": [
    {
      tone: "warm",
      tag: "Heartfelt",
      printed: "A little note to brighten your day.",
      handwritten: "No special occasion needed—just wanted to send some love your way and say I appreciate you more than you know!",
    },
    {
      tone: "funny",
      tag: "Playful",
      printed: "Officially breaking the digital monotony.",
      handwritten: "Because texts are boring, emails are stressful, and real stationery is legendary. Hope this brings a smile to your face today!",
    },
    {
      tone: "short",
      tag: "Brief",
      printed: "Just a little note to say hello.",
      handwritten: "Thinking of you today! Hope your week is off to a great start.",
    },
  ],
  "Christmas & Holidays": [
    {
      tone: "warm",
      tag: "Heartfelt",
      printed: "Warmest holiday wishes from our family to yours.",
      handwritten: "May your home be blessed with peace, laughter, and cozy moments this holiday season. Here is to a healthy, joyous new year ahead!",
    },
    {
      tone: "funny",
      tag: "Playful",
      printed: "Eat, drink, and be cozy.",
      handwritten: "Merry Christmas! May your cookies be sweet, your eggnog be strong, and your holiday shopping be entirely finished. Warmest wishes!",
    },
    {
      tone: "poetic",
      tag: "Literary",
      printed: "Peace on Earth and goodwill to all.",
      handwritten: "In the quiet chill of winter, may your hearth be warm and your heart full of contentment. Wishing you the sacred blessings of the season.",
    },
  ],
  Halloween: [
    {
      tone: "warm",
      tag: "Festive",
      printed: "Wishing you a spooky and sweet Halloween!",
      handwritten: "Hope your October is filled with cozy sweaters, pumpkin spice, apple cider, and just the right amount of spooky fun!",
    },
    {
      tone: "funny",
      tag: "Playful",
      printed: "Eat, drink, and be scary.",
      handwritten: "Happy Halloween! If you need me, I will be hiding under a blanket eating 85% of the candy I bought for trick-or-treaters.",
    },
  ],
  "Easter & Spring": [
    {
      tone: "warm",
      tag: "Heartfelt",
      printed: "Wishing you the renewed joy and blessings of Easter.",
      handwritten: "May this spring season bring fresh hope, warm sunshine, and beautiful beginnings to you and your loved ones. Happy Easter!",
    },
    {
      tone: "short",
      tag: "Brief",
      printed: "Happy Spring & Easter Blessings.",
      handwritten: "Wishing you a joyful Easter filled with family, sunshine, and sweet treats!",
    },
  ],
};

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

export const FONT_OPTIONS: FontOption[] = [
  {
    id: "hwAdam",
    name: "Executive Adam",
    sample: "Warm, flowing handwritten cursive with graceful loops",
    fontClass: "font-hwAdam text-lg sm:text-xl",
    fontFamily: "var(--font-hw-adam), 'HandwryttenAdam', Caveat, cursive",
    description: "Classic cursive pen strokes, perfect for warm personal letters and sentiments.",
    handwryttenFontId: "1",
    handwryttenFontLabel: "Executive Adam",
  },
  {
    id: "hwCharity",
    name: "Chill Charity",
    sample: "Friendly, natural everyday print with organic pen weight",
    fontClass: "font-hwCharity text-lg sm:text-xl",
    fontFamily: "var(--font-hw-charity), 'HandwryttenCharity', 'Patrick Hand', cursive",
    description: "Friendly everyday penmanship with clean readability and human rhythm.",
    handwryttenFontId: "2",
    handwryttenFontLabel: "Chill Charity",
  },
  {
    id: "hwChase",
    name: "Charming Chase",
    sample: "Expressive, stylish modern handwriting with artistic flair",
    fontClass: "font-hwChase text-lg sm:text-xl",
    fontFamily: "var(--font-hw-chase), 'HandwryttenChase', 'Dancing Script', cursive",
    description: "Artistic, expressive lettering ideal for milestone celebrations.",
    handwryttenFontId: "3",
    handwryttenFontLabel: "Charming Chase",
  },
  {
    id: "hwDavid",
    name: "Casual David",
    sample: "Upright, effortless print with clean human cadence",
    fontClass: "font-hwDavid text-lg sm:text-xl",
    fontFamily: "var(--font-hw-david), 'HandwryttenDavid', 'Architects Daughter', cursive",
    description: "Clean, upright everyday print with effortless charm.",
    handwryttenFontId: "4",
    handwryttenFontLabel: "Casual David",
  },
];

