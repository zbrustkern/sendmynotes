export interface ThematicSentiment {
  id: string;
  themeTitle: string; // e.g. "🦖 Dino-Mite Playful"
  printedGreeting: string; // e.g. "Hope your 3rd birthday is DINO-MITE!"
  handwrittenNote: string; // Warm personal ballpoint note
  tone: "playful" | "warm" | "short";
}

export interface ThematicSentimentResult {
  themeTag: string;
  sentiments: ThematicSentiment[];
}

/**
 * Intelligent thematic sentiment generator that matches inside greetings & handwritten
 * notes directly to the custom artwork prompt (like commercial cards with puns/hooks).
 */
export async function generateThematicSentiments(params: {
  prompt: string;
  occasion?: string;
}): Promise<ThematicSentimentResult> {
  const { prompt, occasion = "Birthday" } = params;
  const geminiApiKey =
    process.env.GEMINI_API_KEY ||
    process.env["GEMINI_API_KEY"] ||
    process.env.GOOGLE_GENAI_API_KEY;

  if (geminiApiKey && !geminiApiKey.includes("your_gemini_api_key_here")) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": geminiApiKey,
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: `You are the lead greeting card writer for Aster & Blanche, an ultra-luxury bespoke card studio that prints custom front artwork and robotic-pens real ballpoint ink inside notes.
A customer just had custom artwork painted for the front cover with prompt: "${prompt}" for occasion: "${occasion}".

Commercial cards (like Hallmark and American Greetings) connect the front art directly to the inside note with clever puns, witty hooks, or thematic references on the inside top, followed by a sincere personal handwritten note on the inside right leaf.

Generate exactly 3 themed sentiment pairings linking this artwork directly to the inside:
1. Playful / Clever / Punny: Clever thematic pun or playful joke linking front art to inside (e.g. for dinosaurs: "Hope your birthday is DINO-MITE!").
2. Heartfelt & Warm: Emotional, loving, and personal message inspired by the artwork motif.
3. Short & Sweet: Punchy, memorable, and charming.

Respond ONLY with valid JSON matching this schema:
{
  "themeTag": "string describing the motif in 2-3 words (e.g. Dinosaur Adventure)",
  "sentiments": [
    {
      "id": "playful",
      "themeTitle": "string with emoji (e.g. 🦖 Dino-Mite Playful)",
      "printedGreeting": "string (1 line inside top punchline/greeting)",
      "handwrittenNote": "string (2-3 warm sentences suitable for real ballpoint ink)",
      "tone": "playful"
    },
    {
      "id": "warm",
      "themeTitle": "string with emoji (e.g. 💛 Roaring Love)",
      "printedGreeting": "string (1 line inside top greeting)",
      "handwrittenNote": "string (2-3 warm heartfelt sentences)",
      "tone": "warm"
    },
    {
      "id": "short",
      "themeTitle": "string with emoji (e.g. ✨ Giant Wishes)",
      "printedGreeting": "string (1 line inside top)",
      "handwrittenNote": "string (1-2 sweet concise sentences)",
      "tone": "short"
    }
  ]
}`,
                  },
                ],
              },
            ],
            generationConfig: {
              temperature: 0.7,
              response_mime_type: "application/json",
            },
          }),
        }
      );

      if (response.ok) {
        const data = await response.json();
        const textContent =
          data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
        if (textContent) {
          const parsed = JSON.parse(textContent);
          if (Array.isArray(parsed.sentiments) && parsed.sentiments.length > 0) {
            return {
              themeTag: parsed.themeTag || extractThemeTag(prompt),
              sentiments: parsed.sentiments,
            };
          }
        }
      }
    } catch (err) {
      console.warn("[Thematic Sentiment] Gemini API fallback notice:", err);
    }
  }

  // Graceful Rule-Based / Keyword Fallback Engine
  return generateHeuristicThematicSentiments(prompt, occasion);
}

function extractThemeTag(prompt: string): string {
  const words = prompt.split(/\s+/).filter((w) => w.length > 3);
  if (words.length >= 2) {
    return `${capitalize(words[0])} ${capitalize(words[1])}`;
  }
  return capitalize(words[0] || "Custom Theme");
}

function capitalize(s: string): string {
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

/**
 * Intelligent heuristic fallback matching common commercial card motifs
 */
export function generateHeuristicThematicSentiments(
  prompt: string,
  occasion: string
): ThematicSentimentResult {
  const p = prompt.toLowerCase();

  // 1. DINOSAURS
  if (/\b(dino|dinos|dinosaur|dinosaurs|t-rex|trex|jurassic|fossil)\b/i.test(p)) {
    return {
      themeTag: "Dinosaur Adventure",
      sentiments: [
        {
          id: "playful",
          themeTitle: "🦖 Dino-Mite Playful",
          printedGreeting: "Hope your celebration is DINO-MITE!",
          handwrittenNote:
            "Wishing you the biggest, stompiest, most adventurous year yet! May your day be filled with giant cake and roaring fun.",
          tone: "playful",
        },
        {
          id: "warm",
          themeTitle: "💛 Roaring Love",
          printedGreeting: "Have a roaring good time today!",
          handwrittenNote:
            "You bring so much joy, wonder, and ferocious laughter to everyone around you. So excited to celebrate this special day with you!",
          tone: "warm",
        },
        {
          id: "short",
          themeTitle: "🎈 Big Adventure",
          printedGreeting: "Rawr means Happy Day in dinosaur!",
          handwrittenNote:
            "Sending you giant hugs, huge smiles, and epic prehistoric adventures all day long.",
          tone: "short",
        },
      ],
    };
  }

  // 2. DOGS & PUPPIES
  if (/\b(dog|dogs|puppy|puppies|pup|hound|retriever|dachshund|corgi|beagle|poodle)\b/i.test(p)) {
    return {
      themeTag: "Puppy Joy",
      sentiments: [
        {
          id: "playful",
          themeTitle: "🐾 Pawsome Celebration",
          printedGreeting: "Wishing you a truly PAW-SOME day!",
          handwrittenNote:
            "Sending you lots of wagging tails, warm belly rubs, and endless joy today! Hope your day is as happy and loyal as man's best friend.",
          tone: "playful",
        },
        {
          id: "warm",
          themeTitle: "💛 Warmest Hugs",
          printedGreeting: "So grateful for you today and always.",
          handwrittenNote:
            "Just like a loyal companion, you bring pure comfort and happiness into our lives. Here's to a day filled with all your favorite treats.",
          tone: "warm",
        },
        {
          id: "short",
          themeTitle: "🐕 Sweet & Furry",
          printedGreeting: "You deserve all the treats today!",
          handwrittenNote:
            "Wishing you a day packed with fun, laughter, and zero leash on the good times.",
          tone: "short",
        },
      ],
    };
  }

  // 3. CATS & KITTENS
  if (/\b(cat|cats|kitten|kittens|kitty|feline|meow|purr)\b/i.test(p)) {
    return {
      themeTag: "Whimsical Feline",
      sentiments: [
        {
          id: "playful",
          themeTitle: "🐾 Purr-fect Day",
          printedGreeting: "Hope your day is simply PURR-FECT!",
          handwrittenNote:
            "Wishing you cozy sunny spots, delightful surprises, and the best nap of the year. You're truly the cat's pajamas!",
          tone: "playful",
        },
        {
          id: "warm",
          themeTitle: "💛 Gentle Comfort",
          printedGreeting: "Thinking of you with warmth and affection.",
          handwrittenNote:
            "May your day bring quiet peace, soft comfort, and the joy of simple pleasures. So glad to have you in my life.",
          tone: "warm",
        },
        {
          id: "short",
          themeTitle: "🐱 Paws & Claws",
          printedGreeting: "You're feline fine today!",
          handwrittenNote:
            "Sending sweet purrs and happy wishes for a magical celebration.",
          tone: "short",
        },
      ],
    };
  }

  // 4. COFFEE & TEA
  if (/\b(coffee|latte|cappuccino|espresso|tea|brew|cafe|café|mug)\b/i.test(p)) {
    return {
      themeTag: "Cozy Café",
      sentiments: [
        {
          id: "playful",
          themeTitle: "☕ Whole Latte Love",
          printedGreeting: "Sending you a whole LATTE love today!",
          handwrittenNote:
            "Hope your celebration is rich, warm, and brewed to perfection. Words cannot espresso how much you mean to me!",
          tone: "playful",
        },
        {
          id: "warm",
          themeTitle: "💛 Warm Comfort",
          printedGreeting: "Warmest thoughts and sweet sips.",
          handwrittenNote:
            "Wishing you quiet mornings, deep conversations, and moments that warm you right down to your heart.",
          tone: "warm",
        },
        {
          id: "short",
          themeTitle: "✨ Brewed Special",
          printedGreeting: "Today is brewed especially for you.",
          handwrittenNote:
            "Here's to savoring every drop of this wonderful day. Enjoy every moment!",
          tone: "short",
        },
      ],
    };
  }

  // 5. SPACE & STARS
  if (/\b(space|star|stars|galaxy|planet|planets|astronaut|cosmos|cosmic)\b/i.test(p)) {
    return {
      themeTag: "Cosmic Wonder",
      sentiments: [
        {
          id: "playful",
          themeTitle: "🚀 Out of This World",
          printedGreeting: "Hope your celebration is OUT OF THIS WORLD!",
          handwrittenNote:
            "Three, two, one... blast off into an amazing year ahead! Keep shining as brightly as a whole constellation.",
          tone: "playful",
        },
        {
          id: "warm",
          themeTitle: "✨ Starlight Wishes",
          printedGreeting: "To the brightest star in the sky.",
          handwrittenNote:
            "You bring so much light and wonder wherever you go. May the year ahead be filled with limitless possibilities.",
          tone: "warm",
        },
        {
          id: "short",
          themeTitle: "🌌 Cosmic Spark",
          printedGreeting: "Reach for the stars today!",
          handwrittenNote:
            "Wishing you universal happiness and endless adventure today and always.",
          tone: "short",
        },
      ],
    };
  }

  // 6. BOTANICAL / WILDFLOWERS / NATURE
  if (/\b(flower|flowers|wildflower|wildflowers|bloom|blooms|garden|botanical|rose|roses|floral|bouquet)\b/i.test(p)) {
    return {
      themeTag: "Botanical Garden",
      sentiments: [
        {
          id: "playful",
          themeTitle: "🌸 Blooming Joy",
          printedGreeting: "Hope your special day BLOOMS with joy!",
          handwrittenNote:
            "Sending you vibrant colors, warm sunshine, and sweet fragrant moments. You make every room you enter a little brighter!",
          tone: "playful",
        },
        {
          id: "warm",
          themeTitle: "🌿 Hand-Picked Love",
          printedGreeting: "Picked especially for you with heartfelt love.",
          handwrittenNote:
            "Like the sweetest wildflowers, your friendship brings natural beauty and quiet joy to my life. Wishing you a peaceful, blooming day.",
          tone: "warm",
        },
        {
          id: "short",
          themeTitle: "💐 Gentle Petals",
          printedGreeting: "Wishing you sunny skies and bright blooms.",
          handwrittenNote:
            "May your days ahead be filled with growth, color, and gentle beauty.",
          tone: "short",
        },
      ],
    };
  }

  // 7. DEFAULT OCCASION-ALIGNED THEMATIC SENTIMENT
  const occLower = occasion.toLowerCase();
  if (occLower.includes("thank")) {
    return {
      themeTag: "Heartfelt Gratitude",
      sentiments: [
        {
          id: "playful",
          themeTitle: "✨ Heartfelt Thanks",
          printedGreeting: "So very grateful for your kindness!",
          handwrittenNote:
            `Thank you so much for your generosity and thoughtfulness. Having your support and care meant the world to me.`,
          tone: "warm",
        },
        {
          id: "warm",
          themeTitle: "💛 Deep Appreciation",
          printedGreeting: "With sincere thanks and appreciation.",
          handwrittenNote:
            `I wanted to take a quiet moment to send this note in real ink to say thank you. You made such a wonderful difference.`,
          tone: "warm",
        },
        {
          id: "short",
          themeTitle: "🕊️ Simple Thanks",
          printedGreeting: "Warmest thanks to you.",
          handwrittenNote:
            `Thank you for everything you did. It was deeply appreciated and truly made my week.`,
          tone: "short",
        },
      ],
    };
  }

  // Generic Celebration Fallback
  return {
    themeTag: `${occasion} Celebration`,
    sentiments: [
      {
        id: "playful",
        themeTitle: "🎉 Playful & Bright",
        printedGreeting: `Wishing you the happiest ${occasion}!`,
        handwrittenNote:
          `May your day be filled with huge smiles, favorite treats, and memories you'll treasure for years to come. So excited to celebrate you!`,
        tone: "playful",
      },
      {
        id: "warm",
        themeTitle: "💛 Heartfelt & Warm",
        printedGreeting: `Celebrating you on this special day.`,
        handwrittenNote:
          `Sending this handwritten note with all my warmest love and best wishes. You mean so much to all of us, today and always.`,
        tone: "warm",
      },
      {
        id: "short",
        themeTitle: "✨ Sweet & Simple",
        printedGreeting: `Here's to you!`,
        handwrittenNote:
          `Wishing you nothing but happiness, laughter, and wonderful adventures in the year ahead.`,
        tone: "short",
      },
    ],
  };
}
