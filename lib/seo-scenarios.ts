import { ScenarioConfig } from "./types";

export const OCCASION_ALIASES: Record<string, string> = {
  congrats: "congratulations",
  congratulations: "congratulations",
  birthday: "birthday",
  birthdays: "birthday",
  anniversary: "anniversary",
  anniversaries: "anniversary",
  "get-well": "get-well",
  "get-well-soon": "get-well",
  getwell: "get-well",
  "thank-you": "thank-you",
  thankyou: "thank-you",
  thanks: "thank-you",
  "thinking-of-you": "thinking-of-you",
  thinkingofyou: "thinking-of-you",
  support: "thinking-of-you",
  sympathy: "sympathy",
  condolence: "sympathy",
  condolences: "sympathy",
};

export const OCCASION_METADATA: Record<
  string,
  {
    name: string;
    headline: string;
    description: string;
    metaTitle: string;
    metaDescription: string;
  }
> = {
  "thank-you": {
    name: "Thank You",
    headline: "Send a Real Handwritten Thank You Card",
    description:
      "Express heartfelt gratitude to friends, gracious hosts, and family with physical cards penned in real ballpoint ink and delivered via USPS First Class.",
    metaTitle: "Send a Real Handwritten Thank You Card | Mailed for You ($9)",
    metaDescription:
      "Send authentic handwritten thank-you cards for kindness, hospitality, and support. Real pen and ink on heavy cardstock with stamped mail delivery.",
  },
  sympathy: {
    name: "Sympathy & Support",
    headline: "Send a Heartfelt Handwritten Sympathy Card",
    description:
      "Offer quiet comfort for pet loss, family loss, and heavy seasons. Real pen-on-paper notes sent through the mail provide lasting solace when words feel hard.",
    metaTitle: "Send a Real Handwritten Sympathy Card | Condolence Mail ($9)",
    metaDescription:
      "Send thoughtful, pen-written sympathy cards for pet loss or loss of a loved one. Stamped and delivered via USPS First Class without having to buy stamps or visit the store.",
  },
  congratulations: {
    name: "Congratulations",
    headline: "Send a Real Handwritten Congratulations Card",
    description:
      "Celebrate promotions, new homes, and major life achievements with a real, tangible keepsake penned in ink.",
    metaTitle: "Send a Handwritten Congratulations Card | Real Pen Mail ($9)",
    metaDescription:
      "Congratulate friends, family, or colleagues on promotions, new homes, and career achievements. Written in real pen and ink, delivered via USPS First Class.",
  },
  birthday: {
    name: "Birthday",
    headline: "Send a Real Handwritten Birthday Card",
    description:
      "Make milestone birthdays and long-distance friendships feel unforgettable with authentic pen-written cards stamped and delivered to their door.",
    metaTitle: "Send a Real Handwritten Birthday Card | Stamped & Mailed ($9)",
    metaDescription:
      "Celebrate milestone birthdays and long-distance best friends. Written with a real ballpoint pen on heavy cardstock and mailed for $9 all-inclusive.",
  },
  anniversary: {
    name: "Anniversary",
    headline: "Send a Real Handwritten Anniversary Card",
    description:
      "Surprise your spouse or celebrate a couple's journey with a timeless love note written in real pen on quality folded cardstock.",
    metaTitle: "Send a Handwritten Anniversary Card | Real Ink Delivery ($9)",
    metaDescription:
      "Celebrate anniversaries with a lasting handwritten love note. Real ballpoint ink, premium folded cardstock, and USPS First Class mail delivery.",
  },
  "get-well": {
    name: "Get Well & Healing",
    headline: "Send a Real Handwritten Get Well Card",
    description:
      "Brighten someone's recovery from surgery or illness with a warm, encouraging note penned in real ink.",
    metaTitle: "Send a Handwritten Get Well Soon Card | Real Pen Mail ($9)",
    metaDescription:
      "Encourage surgery and hospital recovery with a physical, pen-written card sent directly to their home or bedside.",
  },
  "thinking-of-you": {
    name: "Thinking of You",
    headline: "Send a Real Handwritten Thinking of You Card",
    description:
      "Send quiet solidarity and love during difficult transitions or tough times. Real ink delivered with no reply required.",
    metaTitle: "Send a Handwritten Thinking of You Card | Real Pen Mail ($9)",
    metaDescription:
      "Send quiet support and compassion during hard times with a handwritten card written in real pen and mailed via USPS.",
  },
};

export const SEO_SCENARIOS: ScenarioConfig[] = [
  // 1. PERSONAL: Warm Gratitude for Kindness, Hospitality, or Support (#1 Thank You Default)
  {
    slug: "kindness-and-support",
    aliases: [
      "thank-you-note",
      "personal-thank-you",
      "warm-thank-you",
      "hospitality-thank-you",
      "kindness-thank-you",
      "generosity-thank-you",
      "thank-you-for-hospitality",
      "thank-you-friend",
    ],
    occasionSlug: "thank-you",
    occasionName: "Thank You",
    category: "gratitude",
    badgeText: "Heartfelt Gratitude",
    h1Title: "Send a Warm Handwritten Thank You Note",
    heroTagline: "Thank a dear friend, gracious host, or family member with a tangible, real pen-on-paper card mailed directly to their door.",
    metaTitle: "Send a Warm Handwritten Thank You Note | Real Pen Mail ($9)",
    metaDescription: "Express heartfelt gratitude to a friend, gracious host, or family member for their kindness, hospitality, or support. Real ballpoint ink on folded cardstock.",
    keywords: [
      "warm handwritten thank you note",
      "personal thank you card",
      "thank you for hospitality card",
      "thank you for kindness note",
      "mail a physical thank you card",
    ],
    coverUrl: "/presets/thank-you-botanical.jpg",
    coverPrompt: "Warm botanical gouache painting of blooming lavender and chamomile wildflowers in a sunlit meadow",
    printedGreeting: "With deepest gratitude and appreciation.",
    handwrittenNote: "Dear [Name],\n\nThank you so much for your generosity, kindness, and wonderful hospitality. Having you in my corner truly meant the world to me, and I am so grateful for your friendship and thoughtfulness!\n\nWarmly,\n[Your Name]",
    fontStyleId: "1",
    fontName: "Warm Cursive",
    etiquetteTips: [
      {
        title: "Name the Specific Kindness",
        content: "Mention a specific dinner, kind gesture, or moment of support that made a difference. Specificity makes your gratitude feel deeply authentic.",
      },
      {
        title: "Send Promptly",
        content: "Mailing a physical note within a few days of a gathering, gift, or kind deed shows intentionality and gracious etiquette.",
      },
      {
        title: "Keep it Heartfelt and Genuine",
        content: "A short, genuine message from the heart is always more meaningful than long, formal boilerplate. Write like you speak.",
      },
    ],
    faq: [
      {
        question: "When should I send a personal thank you card?",
        answer: "Send a card after staying as a houseguest, receiving a thoughtful gift, after a dinner party, or simply to tell someone how much you appreciate their presence in your life.",
      },
      {
        question: "Does SendMyNotes mail the card directly to them?",
        answer: "Yes! We write your card using a real ballpoint pen and ink robot, seal it in a stamped envelope, and deliver it via USPS First Class.",
      },
    ],
  },

  // 2. CAREER: Post Job Interview Thank You
  {
    slug: "after-job-interview",
    aliases: [
      "interview-thank-you",
      "job-interview-thank-you",
      "interview-follow-up",
      "interview",
      "after-interview",
      "interview-thank-you-cards",
      "job-interview",
      "interview-card",
    ],
    occasionSlug: "thank-you",
    occasionName: "Thank You",
    category: "career",
    badgeText: "Career & Interview Etiquette",
    h1Title: "Send a Handwritten Thank You Note After Your Job Interview",
    heroTagline: "99% of candidates send a generic email or nothing at all. A real pen-on-paper note mailed to your interviewer's desk makes you unforgettable.",
    metaTitle: "Send a Handwritten Interview Thank You Note | Real Pen & USPS Mail ($9)",
    metaDescription: "Follow up after your job interview with a physical, pen-written thank you card delivered via USPS First Class. Pre-formatted professional etiquette note ready to edit and mail.",
    keywords: [
      "thank you card after job interview",
      "handwritten note after interview",
      "what to write in interview thank you card",
      "interview follow up letter mail",
      "physical thank you note to hiring manager",
    ],
    coverUrl: "/presets/thank-you-laurel-wreath.jpg",
    coverPrompt: "Classical botanical garland wreath of lush green olive branches, golden bay laurel leaves, and delicate ivory blossom accents on warm cream",
    printedGreeting: "With sincere appreciation for your time and conversation.",
    handwrittenNote: "Dear [Interviewer Name],\n\nThank you so much for taking the time to speak with me today about the [Job Title] role. I really enjoyed learning more about [specific topic or initiative discussed] and feel even more energized about how my experience in [your key skill/experience] could help the team reach its goals.\n\nThank you again for the opportunity, and I look forward to staying in touch!\n\nBest regards,\n[Your Name]",
    fontStyleId: "4",
    fontName: "Executive Fountain Pen",
    etiquetteTips: [
      {
        title: "Send Within 24 Hours",
        content: "Hiring decisions move quickly. Sending your physical card within 24 hours of your interview ensures it arrives while you are fresh in their mind.",
      },
      {
        title: "Reference One Specific Topic",
        content: "Mention a specific point of conversation, a shared laugh, or an interesting challenge the team is solving. This proves your note is genuine, not a boilerplate template.",
      },
      {
        title: "Keep the Tone Confident and Gracious",
        content: "Reiterate your enthusiasm for the position without sounding presumptuous. Focus on gratitude for their time and perspective.",
      },
    ],
    faq: [
      {
        question: "Is sending a physical handwritten card better than an email?",
        answer: "Yes. Hiring managers receive hundreds of identical emails a day. A physical, tactile card delivered by mail sitting on their desk commands 100% of their attention and demonstrates extraordinary polish and initiative.",
      },
      {
        question: "How should I address the interviewer?",
        answer: "Address them as you did in the interview. If you spoke on a first-name basis (e.g., 'Hi Sarah'), using their first name in the note is professional and warm.",
      },
      {
        question: "What if I interviewed with multiple people?",
        answer: "Send a personalized note to each interviewer mentioning something unique from your conversation with each of them.",
      },
    ],
  },

  // 2. CAREER: Thank You to Mentor or Advisor
  {
    slug: "to-mentor-or-advisor",
    aliases: [
      "mentor-thank-you",
      "advisor-thank-you",
      "to-mentor",
      "mentor-appreciation",
      "mentor-gratitude",
      "mentor",
      "advisor",
    ],
    occasionSlug: "thank-you",
    occasionName: "Thank You",
    category: "career",
    badgeText: "Professional Gratitude",
    h1Title: "Send a Handwritten Note of Gratitude to a Mentor or Advisor",
    heroTagline: "A mentor's guidance can alter the trajectory of your entire career. Honor their generosity with a timeless, physical handwritten note.",
    metaTitle: "Handwritten Thank You Note to a Mentor | Real Pen-on-Paper ($9)",
    metaDescription: "Express deep gratitude to a mentor, professor, or advisor with a physical card written in real pen and ink, stamped and mailed directly to their door.",
    keywords: [
      "thank you card for mentor",
      "how to thank a career mentor",
      "handwritten note to advisor",
      "mentor appreciation note example",
    ],
    coverUrl: "/presets/thank-you-laurel-wreath.jpg",
    coverPrompt: "Classical botanical garland wreath of lush green olive branches, golden bay laurel leaves, and delicate ivory blossom accents on warm cream",
    printedGreeting: "With deep gratitude for your wisdom and guidance.",
    handwrittenNote: "Dear [Mentor Name],\n\nI wanted to send a note of sincere thanks for your guidance, encouragement, and perspective over the past [months/year]. Your advice regarding [specific career milestone or challenge] made an enormous impact on how I navigated things.\n\nThank you for always taking the time to invest in me. I am truly grateful for your mentorship!\n\nWarmly,\n[Your Name]",
    fontStyleId: "1",
    fontName: "Warm Cursive",
    etiquetteTips: [
      {
        title: "Name the Impact",
        content: "Mentors love knowing their advice wasn't wasted. Specifically mention an outcome or decision where their wisdom steered you right.",
      },
      {
        title: "No Strings Attached",
        content: "Do not ask for any favors, intros, or meetings in a thank-you note. Let it be purely about celebrating their generosity.",
      },
    ],
    faq: [
      {
        question: "When is the best time to send a note to a mentor?",
        answer: "Milestones (after landing a new job, closing a project, or year-end) are classic times, but a surprise 'out-of-the-blue' appreciation note is often the most touching.",
      },
    ],
  },

  // 3. CAREER / BUSINESS: Client Closing Appreciation
  {
    slug: "client-closing-appreciation",
    aliases: [
      "client-closing-gift",
      "closing-gift",
      "client-closing",
      "client-appreciation",
      "real-estate-closing",
      "closing-appreciation",
      "realtor-closing-gift",
    ],
    occasionSlug: "thank-you",
    occasionName: "Thank You",
    category: "career",
    badgeText: "Client Relationship Management",
    h1Title: "Handwritten Client Closing & Appreciation Cards",
    heroTagline: "Turn completed contracts and real estate closings into lifelong advocates with an elegant, physical handwritten card.",
    metaTitle: "Handwritten Client Closing Thank You Card | SendMyNotes",
    metaDescription: "Delight your real estate or consulting clients upon contract closing. Automated real pen handwriting mailed with USPS First Class stamp for $9.",
    keywords: [
      "client closing thank you card",
      "realtor thank you card to client",
      "closing gift note to homebuyer",
      "b2b client appreciation card",
    ],
    coverUrl: "/presets/thank-you-botanical.jpg",
    coverPrompt: "Modern botanical gouache painting of blooming lavender and chamomile wildflowers in a sunlit meadow",
    printedGreeting: "Congratulations on a wonderful new beginning.",
    handwrittenNote: "Dear [Client Names],\n\nCongratulations on successfully closing on [Property / Project Name]! It was an absolute honor and pleasure to work alongside you throughout this journey.\n\nThank you for trusting me with this important milestone. Wishing you immense happiness and success in the years ahead!\n\nBest regards,\n[Your Name]",
    fontStyleId: "3",
    fontName: "Architect Print",
    etiquetteTips: [
      {
        title: "Personalize the Milestone",
        content: "Mention the address, company name, or project details to make the card a memorable keepsake.",
      },
      {
        title: "Professional Yet Warm",
        content: "Maintain a polished tone while expressing genuine excitement for their success.",
      },
    ],
    faq: [
      {
        question: "Can I mail directly to their new address?",
        answer: "Yes! Simply enter their new home or office address in Step 3, and Handwrytten will deliver it right to their mailbox via USPS First Class.",
      },
    ],
  },

  // 4. SYMPATHY: Gentle Everyday Condolences & Support (#1 Sympathy Default)
  {
    slug: "heartfelt-condolences",
    aliases: [
      "sympathy-cards-mailed",
      "sympathy-cards",
      "sympathy-card",
      "send-sympathy-card",
      "sympathy",
      "condolences",
      "condolence-card",
      "here-for-you",
    ],
    occasionSlug: "sympathy",
    occasionName: "Sympathy & Support",
    category: "sympathy",
    badgeText: "Quiet Condolences",
    h1Title: "Send a Real Handwritten Sympathy Card",
    heroTagline: "Offer genuine comfort, warmth, and quiet strength with a real pen-and-ink handwritten sympathy card delivered to their mailbox.",
    metaTitle: "Send a Real Handwritten Sympathy Card | Stamped & Mailed ($9)",
    metaDescription: "Send an authentic handwritten sympathy card written with real pen and ink on heavy cardstock. Stamped and mailed via USPS First Class.",
    keywords: [
      "handwritten sympathy card",
      "mail a sympathy card",
      "condolence card real pen",
      "thinking of you sympathy card",
    ],
    coverUrl: "/presets/sympathy-typography.jpg",
    coverPrompt: "Quiet, compassionate typography-led card on pale dove-blue ground with charcoal serif 'Here for you' lettering and fine frame rule",
    printedGreeting: "Holding you close in our thoughts during this difficult time.",
    handwrittenNote: "Dear [Name],\n\nI am so deeply sorry for your loss. Please know that I am holding you and your family close in my thoughts and heart. Sending you gentle comfort, quiet strength, and peace in the days ahead. I am always here for you.\n\nWith love and sympathy,\n[Your Name]",
    fontStyleId: "1",
    fontName: "Warm Cursive",
    etiquetteTips: [
      {
        title: "Keep it Gentle and Sincere",
        content: "A few genuine words of comfort mean far more than long explanations. Let them know they are in your thoughts.",
      },
      {
        title: "No Pressure to Respond",
        content: "Grieving recipients appreciate knowing that a physical card requires no reply or acknowledgement.",
      },
    ],
    faq: [
      {
        question: "How fast is a sympathy card mailed?",
        answer: "Orders placed by 2 PM EST are penned, stamped, and dispatched via USPS First Class the same day.",
      },
    ],
  },

  // 5. SYMPATHY: Loss of a Beloved Pet
  {
    slug: "loss-of-beloved-pet",
    aliases: [
      "loss-of-pet",
      "pet-loss",
      "pet-loss-sympathy",
      "pet-loss-and-sympathy",
      "pet-sympathy",
      "dog-loss",
      "cat-loss",
      "pet-condolence",
      "dog-sympathy",
      "cat-sympathy",
      "loss-of-dog",
      "loss-of-cat",
      "loss-of-a-pet",
      "pet-death",
    ],
    occasionSlug: "sympathy",
    occasionName: "Sympathy & Support",
    category: "sympathy",
    badgeText: "Compassion & Empathy",
    h1Title: "Send a Pet Loss Sympathy Card Inked in Real Pen",
    heroTagline: "Losing a dog or cat leaves a quiet stillness in a home. Send a comforting handwritten note that honors the unconditional love they shared.",
    metaTitle: "Pet Loss Sympathy Card | Handwritten Dog & Cat Condolence Note ($9)",
    metaDescription: "Express your condolences for the loss of a dog, cat, or beloved pet. Pre-seeded with gentle comforting words, written with a real ballpoint pen and mailed for $9.",
    keywords: [
      "pet loss sympathy card",
      "what to write for dog passing",
      "cat sympathy card message",
      "condolence note for loss of pet",
      "pet loss card real mail",
    ],
    coverUrl: "/presets/pet-sympathy-rainbow.jpg",
    coverPrompt: "Delicate botanical watercolor meadow with wildflowers, lavender, faint golden paw prints leading toward an ethereal pastel rainbow in soft morning mist",
    printedGreeting: "Holding you close in this heartbreaking time.",
    handwrittenNote: "Dear [Friend's Name],\n\nI was so deeply heartbroken to hear about the passing of sweet [Pet's Name]. [He/She] was such an extraordinary, loyal companion and brought so much pure joy into your life.\n\nThank you for giving [Pet's Name] such a beautiful life filled with endless love and adventures. Sending you the warmest hugs and strength right now.\n\nWith all my love,\n[Your Name]",
    fontStyleId: "1",
    fontName: "Warm Cursive",
    etiquetteTips: [
      {
        title: "Use the Pet's Name",
        content: "Pets are beloved family members. Always use their name rather than referring to them generically.",
      },
      {
        title: "Acknowledge the Depth of the Bond",
        content: "Avoid clichés like 'at least you can get another one.' Honor the singular, irreplaceable companion they lost.",
      },
    ],
    faq: [
      {
        question: "When should I send a pet sympathy card?",
        answer: "As soon as you hear the news. The first few weeks without their companion are the quietest and most difficult, so receiving your card brings immense comfort.",
      },
    ],
  },

  // 5. SYMPATHY: Loss of a Parent
  {
    slug: "loss-of-parent",
    aliases: [
      "loss-of-mother",
      "loss-of-father",
      "parent-loss",
      "condolence-loss-of-parent",
      "loss-of-mom",
      "loss-of-dad",
      "parent-sympathy",
      "sympathy-parent",
    ],
    occasionSlug: "sympathy",
    occasionName: "Sympathy & Support",
    category: "sympathy",
    badgeText: "Deep Condolences",
    h1Title: "Send a Handwritten Condolence Card for the Loss of a Parent",
    heroTagline: "When words feel inadequate, a physical, tangible card sent through the mail offers a lasting sanctuary of comfort and quiet support.",
    metaTitle: "Condolence Card on the Loss of a Parent | Real Pen-on-Paper ($9)",
    metaDescription: "Send thoughtful sympathy for the loss of a mother or father. Real pen inking on heavy cardstock delivered via USPS First Class.",
    keywords: [
      "sympathy card for loss of mother",
      "condolence card loss of father",
      "what to write when coworker parent dies",
      "sympathy card handwritten delivery",
    ],
    coverUrl: "/presets/sympathy-gentle-light.jpg",
    coverPrompt: "Solitary warm glowing lantern resting beside a serene mountain lake at twilight with quiet pine boughs and starry sky in delicate gouache and ink",
    printedGreeting: "Those we love never truly leave us.",
    handwrittenNote: "Dear [Friend's Name],\n\nMy heart aches for you and your family as you mourn the loss of your wonderful [Mother / Father]. [He/She] was such a remarkable person, and the kindness, strength, and love they shared lives on so brightly in you.\n\nPlease know I am thinking of you constantly and holding you close during this heartbreaking journey. I am here for you for anything you need.\n\nWith deepest sympathy,\n[Your Name]",
    fontStyleId: "2",
    fontName: "Classic Cursive",
    etiquetteTips: [
      {
        title: "Share a Quiet Memory if You Have One",
        content: "If you knew their parent, mentioning one trait or warm memory ('I will always remember her laughter at dinner') is deeply comforting.",
      },
      {
        title: "Don't Demand a Response",
        content: "Grieving families are overwhelmed. Adding 'No need to text or reply' relieves unnecessary pressure.",
      },
    ],
    faq: [
      {
        question: "Is it appropriate to send a card to the family home?",
        answer: "Yes, sending a physical card to their home is the most respectful and enduring way to express sympathy.",
      },
    ],
  },

  // 6. MILESTONES: Housewarming / New Home
  {
    slug: "new-home-housewarming",
    aliases: [
      "housewarming",
      "new-home",
      "housewarming-cards",
      "new-house",
      "housewarming-card",
      "first-home",
      "congratulations-new-home",
    ],
    occasionSlug: "congratulations",
    occasionName: "Congratulations",
    category: "milestone",
    badgeText: "New Beginnings",
    h1Title: "Congratulate New Homeowners With a Handwritten Card",
    heroTagline: "A new home is one of life's greatest adventures. Send a warm, permanent keepsake that welcomes them to their front door.",
    metaTitle: "Handwritten Housewarming Card | Congratulate New Homeowners ($9)",
    metaDescription: "Welcome friends or family into their new house or apartment. Crafted with real pen inking and delivered directly to their new mailbox.",
    keywords: [
      "housewarming card message",
      "congratulations on new home card",
      "what to write in first time homebuyer card",
      "housewarming card mail",
    ],
    coverUrl: "/presets/congrats-new-home.jpg",
    coverPrompt: "Sunlit sage green front door in warm artisanal gouache with terracotta brick, welcoming botanical boxwood wreath, and potted lemon topiary",
    printedGreeting: "May your new home be filled with laughter and love.",
    handwrittenNote: "Dear [Names],\n\nHappy New Home! So thrilled for you both as you settle into this wonderful new space. May your home be filled with joyful memories, cozy evenings, and wonderful dinner parties.\n\nCan't wait to visit and celebrate properly soon! Huge congratulations on this exciting milestone.\n\nWarmest wishes,\n[Your Name]",
    fontStyleId: "1",
    fontName: "Warm Cursive",
    etiquetteTips: [
      {
        title: "Celebrate the Effort",
        content: "Moving is stressful! Acknowledging the hard work that went into finding and securing the home adds personal warmth.",
      },
    ],
    faq: [
      {
        question: "Can I mail this card directly to their new house?",
        answer: "Absolutely. Providing their new street address gives them real mail to open in their new mailbox that isn't a bill or junk mail.",
      },
    ],
  },

  // 7. MILESTONES: Promotion or New Job
  {
    slug: "promotion-or-new-job",
    aliases: [
      "promotion-and-congrats",
      "promotion-congrats",
      "promotion-or-congrats",
      "promotion",
      "new-job",
      "congrats",
      "promotion-cards",
      "career-congrats",
      "job-promotion",
      "promotion-card",
    ],
    occasionSlug: "congratulations",
    occasionName: "Congratulations",
    category: "milestone",
    badgeText: "Career Milestone",
    h1Title: "Celebrate a Promotion or New Job With a Handwritten Note",
    heroTagline: "Big career moves deserve more than a generic LinkedIn comment. Celebrate their hard work with a real, tangible note in ink.",
    metaTitle: "Congratulations on Promotion Card | Handwritten Real Pen Mail ($9)",
    metaDescription: "Celebrate a promotion, new role, or company launch with a personalized card written in real ballpoint ink and mailed via USPS First Class.",
    keywords: [
      "congratulations on promotion card",
      "new job congratulations note",
      "what to write in promotion card",
      "handwritten note for career advancement",
    ],
    coverUrl: "/presets/congrats-champagne.jpg",
    coverPrompt: "Golden effervescent champagne bubbles rising in vintage crystal coupe, celebratory starbursts, festive modern artwork",
    printedGreeting: "Cheers to your well-deserved achievement!",
    handwrittenNote: "Dear [Name],\n\nHuge congratulations on your promotion to [New Title]! Nobody deserves this recognition more than you—your hard work, creativity, and leadership have set such an incredible example.\n\nHere's to celebrating all that you've accomplished and to the exciting journey ahead! Pop the bubbly!\n\nCheers,\n[Your Name]",
    fontStyleId: "3",
    fontName: "Architect Print",
    etiquetteTips: [
      {
        title: "Affirm Their Talent",
        content: "Emphasize how well-deserved this is. Remind them that their persistence and dedication brought them here.",
      },
    ],
    faq: [
      {
        question: "Should I send this to their office or home?",
        answer: "Either works great! Mailing to their home is cozy and personal; mailing to their office makes a proud display on their new desk.",
      },
    ],
  },

  // 8. BIRTHDAY: Joyful Everyday Birthday Celebration (#1 Birthday Default)
  {
    slug: "happy-birthday",
    aliases: [
      "birthday-cards-mailed",
      "birthday-cards",
      "birthday-card",
      "send-birthday-card",
      "birthday",
      "birthday-wish",
    ],
    occasionSlug: "birthday",
    occasionName: "Birthday",
    category: "milestone",
    badgeText: "Birthday Celebration",
    h1Title: "Send a Real Handwritten Birthday Card",
    heroTagline: "Celebrate someone special with a genuine, real pen-on-paper birthday card delivered directly to their mailbox.",
    metaTitle: "Send a Real Handwritten Birthday Card | Stamped & Mailed ($9)",
    metaDescription: "Send an authentic handwritten birthday card written with real pen and ink on heavy cardstock. Stamped and mailed via USPS First Class.",
    keywords: [
      "handwritten birthday card",
      "mail a real birthday card",
      "birthday card handwritten pen",
      "custom birthday card mail",
    ],
    coverUrl: "/presets/birthday-cake.jpg",
    coverPrompt: "Sophisticated cut-paper collage of a round birthday cake on cobalt-blue pedestal with five lit candles, confetti accents, and 'Happy Birthday' lettering",
    printedGreeting: "Wishing you a year filled with joy and wonderful adventures.",
    handwrittenNote: "Dear [Name],\n\nHappy Birthday! Wishing you a year filled with magic, laughter, and milestones together. So proud of everything you have accomplished this year, and hope you have the most wonderful celebration today!\n\nWarmly,\n[Your Name]",
    fontStyleId: "1",
    fontName: "Warm Cursive",
    etiquetteTips: [
      {
        title: "Make it Personal and Warm",
        content: "Mention a favorite shared memory or milestone from the past year to make your birthday wish feel deeply personal.",
      },
      {
        title: "Send with Time to Spare",
        content: "We handle pen-writing and USPS First Class stamping so it arrives right on time for their special day.",
      },
    ],
    faq: [
      {
        question: "Can I schedule the send date for their birthday?",
        answer: "Yes! In Step 3 you can pick an exact scheduled send date to ensure timely mailbox arrival.",
      },
    ],
  },

  // 9. BIRTHDAY: Milestone 50th, 60th, or 70th Birthday
  {
    slug: "milestone-birthday",
    aliases: [
      "birthday-cards-mailed",
      "birthday-cards",
      "birthday-card",
      "milestone-birthdays",
      "50th-birthday",
      "60th-birthday",
      "70th-birthday",
      "milestone",
      "milestone-birthday-card",
      "birthday",
    ],
    occasionSlug: "birthday",
    occasionName: "Birthday",
    category: "milestone",
    badgeText: "Golden Milestones",
    h1Title: "Send a Milestone Birthday Card Penned in Real Ink",
    heroTagline: "Turning 40, 50, 60, or 70 isn't just another birthday—it's a celebration of a legacy. Send a card that feels like an heirloom.",
    metaTitle: "Milestone Birthday Card (50th, 60th, 70th) | Real Handwritten Mail",
    metaDescription: "Honor milestone birthdays with a luxurious real pen-on-paper card. Pre-filled with celebratory words, written in real ink and mailed for $9 flat.",
    keywords: [
      "50th birthday card message",
      "60th birthday card what to write",
      "milestone birthday card handwritten",
      "thoughtful birthday card for parent",
    ],
    coverUrl: "/presets/birthday-balloons.jpg",
    coverPrompt: "Golden balloons floating into pastel sunset sky, gold foil flecks, elegant celebratory artwork",
    printedGreeting: "Celebrating an extraordinary life and journey.",
    handwrittenNote: "Happy [50th/60th/70th] Birthday, [Name]!\n\nWhat an incredible milestone to celebrate! Thank you for the endless wisdom, laughter, and warmth you bring into every room you enter. Looking back on the legacy you've built and the countless lives you've touched fills all of us with admiration.\n\nWishing you a magnificent year ahead filled with health, joy, and wonderful adventures!\n\nWith love and admiration,\n[Your Name]",
    fontStyleId: "2",
    fontName: "Classic Cursive",
    etiquetteTips: [
      {
        title: "Honor the Journey",
        content: "Milestone birthdays are reflective. Express gratitude for the impact they have had on your life and family.",
      },
    ],
    faq: [
      {
        question: "Can I schedule this card to arrive on their exact birthday?",
        answer: "Yes! In Step 3, you can choose a scheduled send date, and we will hold production until the right dispatch window for USPS delivery.",
      },
    ],
  },

  // 9. BIRTHDAY: Long Distance Best Friend
  {
    slug: "long-distance-friend",
    aliases: [
      "long-distance-friend-birthday",
      "distant-friend",
      "friend-birthday",
      "best-friend-birthday",
      "faraway-friend",
      "long-distance",
      "friend-card",
    ],
    occasionSlug: "birthday",
    occasionName: "Birthday",
    category: "gratitude",
    badgeText: "Across the Miles",
    h1Title: "Send a Birthday Card to Your Long-Distance Best Friend",
    heroTagline: "You can't be there in person for birthday drinks, but you can send a real piece of physical mail that feels like a hug in an envelope.",
    metaTitle: "Birthday Card for Long-Distance Best Friend | Real Handwritten Mail",
    metaDescription: "Bridge the distance on their birthday with a physical card written with a real pen. Personalize in seconds and mail for $9 all-inclusive.",
    keywords: [
      "birthday card for long distance best friend",
      "what to write to friend far away birthday",
      "handwritten birthday card mailed for you",
    ],
    coverUrl: "/presets/love-roses.jpg",
    coverPrompt: "Vintage airmail watercolor envelope with gentle garden roses, pastel aesthetic, warm long distance friendship theme",
    printedGreeting: "Distance means nothing when friendship means everything.",
    handwrittenNote: "Happy Birthday to my favorite human on Earth!\n\nEven though we're [number] miles apart, you are still the first person I want to text every single day. Thank you for being the most loyal, hilarious, and understanding friend anyone could ask for.\n\nHave the best day ever—drinks and dinner are 100% on me next time we're reunited! Love you so much!\n\n[Your Name]",
    fontStyleId: "1",
    fontName: "Warm Cursive",
    etiquetteTips: [
      {
        title: "Write Exactly How You Talk",
        content: "Don't sound stiff. The magic of a friend's card is hearing your unique voice and shared jokes in ink.",
      },
    ],
    faq: [
      {
        question: "How long does delivery take?",
        answer: "USPS First Class generally arrives in 3 to 5 business days anywhere in the United States.",
      },
    ],
  },

  // 10. ANNIVERSARY: Heartfelt Love Note to Spouse
  {
    slug: "heartfelt-to-spouse",
    aliases: [
      "anniversary-cards-mailed",
      "anniversary-cards",
      "anniversary-card",
      "anniversary",
      "anniversary-love-note",
      "to-spouse",
      "for-spouse",
      "husband-anniversary",
      "wife-anniversary",
      "wedding-anniversary",
      "spouse-anniversary",
    ],
    occasionSlug: "anniversary",
    occasionName: "Anniversary",
    category: "gratitude",
    badgeText: "Love & Partnership",
    h1Title: "Send an Anniversary Love Note Penned in Real Ink",
    heroTagline: "Text messages disappear into phone screens. A handwritten anniversary card stays tucked in a nightstand drawer for decades.",
    metaTitle: "Handwritten Anniversary Card for Husband or Wife | Real Ink ($9)",
    metaDescription: "Celebrate your anniversary with a timeless love letter written in real ballpoint ink on thick cardstock, delivered in a stamped envelope.",
    keywords: [
      "anniversary card for husband handwritten",
      "anniversary card for wife what to write",
      "heartfelt love letter anniversary card",
      "send handwritten anniversary card",
    ],
    coverUrl: "/presets/anniversary-monstera.jpg",
    coverPrompt: "Lush deep emerald monstera and eucalyptus leaves with delicate golden geometry, intimate botanical artwork",
    printedGreeting: "Another year of choosing you, every single day.",
    handwrittenNote: "Happy Anniversary, my love.\n\nLooking back on another year together fills my heart with so much gratitude. Thank you for your kindness, your partnership, and the quiet comfort of building this life by your side.\n\nThrough every season and adventure, I would choose you all over again in a heartbeat. Here's to us, forever.\n\nWith all my love,\n[Your Name]",
    fontStyleId: "2",
    fontName: "Classic Cursive",
    etiquetteTips: [
      {
        title: "Focus on Gratitude and Partnership",
        content: "The most moving anniversary notes thank their partner for their daily patience and teamwork.",
      },
    ],
    faq: [
      {
        question: "Can I mail this secretly to our home address?",
        answer: "Yes! Many customers enter their home address addressed to their spouse so it arrives as a surprise in the mailbox on their anniversary week.",
      },
    ],
  },

  // 11. HEALTH & SUPPORT: Surgery & Hospital Recovery
  {
    slug: "surgery-recovery",
    aliases: [
      "get-well-soon",
      "speedy-recovery",
      "after-surgery",
      "surgery",
      "hospital-recovery",
      "get-well-cards",
      "get-well-card",
      "recovery",
    ],
    occasionSlug: "get-well",
    occasionName: "Thinking of You",
    category: "support",
    badgeText: "Healing & Care",
    h1Title: "Send a Get Well Soon Card for Surgery Recovery",
    heroTagline: "Recovering from surgery is exhausting and lonely. Brighten their bedside table with real handwritten encouragement.",
    metaTitle: "Get Well Soon Card After Surgery | Real Handwritten Delivery ($9)",
    metaDescription: "Send gentle healing wishes after a surgery or hospital stay. Crafted with real ballpoint pen ink on folded cardstock with USPS stamp.",
    keywords: [
      "get well soon card after surgery",
      "what to write someone recovering from surgery",
      "surgery recovery get well card mail",
    ],
    coverUrl: "/presets/thinking-of-you-healing.jpg",
    coverPrompt: "Soft herbal botanical watercolor of blooming wild chamomile blossoms, eucalyptus sprigs, and clover in warm honey and sage tones with healing natural sunlight",
    printedGreeting: "Sending you gentle wishes for healing and rest.",
    handwrittenNote: "Dear [Name],\n\nSending you so much love and gentle healing thoughts as you recover from surgery! Please give yourself full permission to rest, sleep, and let everyone take care of you right now.\n\nWe are all rooting for your steady recovery and cannot wait to see you back on your feet when the time is right. Sending big hugs from afar!\n\nWarmly,\n[Your Name]",
    fontStyleId: "1",
    fontName: "Warm Cursive",
    etiquetteTips: [
      {
        title: "Encourage True Rest",
        content: "People recovering often feel guilty about not working or being active. Affirm that resting is their only job right now.",
      },
    ],
    faq: [
      {
        question: "Can I ship to a hospital or rehab center?",
        answer: "Yes, just be sure to include the Patient Name, Room/Wing Number, and the facility address in the address fields.",
      },
    ],
  },

  // 12. EMPATHY: Thinking of You During Hard Times
  {
    slug: "during-hard-times",
    aliases: [
      "tough-times",
      "hard-times",
      "difficult-times",
      "thinking-of-you-support",
      "quiet-support",
      "sympathy-support",
      "support",
      "thinking-of-you",
    ],
    occasionSlug: "thinking-of-you",
    occasionName: "Thinking of You",
    category: "support",
    badgeText: "Quiet Solidarity",
    h1Title: "Send a Quiet Support Card During Difficult Times",
    heroTagline: "When life is heavy, an unprompted card that says 'I'm thinking of you and you don't have to carry this alone' is a lifeline.",
    metaTitle: "Thinking of You During Tough Times | Handwritten Support Card ($9)",
    metaDescription: "Show someone you care during illness, divorce, job loss, or life transitions. Real pen handwriting mailed in a stamped envelope for $9 flat.",
    keywords: [
      "thinking of you card during hard times",
      "what to write to someone going through a tough time",
      "support card during crisis mail",
    ],
    coverUrl: "/presets/sympathy-gentle-light.jpg",
    coverPrompt: "Solitary warm glowing lantern resting beside a serene mountain lake at twilight with quiet pine boughs and starry sky in delicate gouache and ink",
    printedGreeting: "Holding you in my thoughts today and always.",
    handwrittenNote: "Dear [Name],\n\nI just wanted to send a little reminder that you have been in my thoughts so much lately. I know things have felt heavy and uncertain, and there are no easy words—but please know that you are deeply loved and not alone.\n\nNo need to text or reply to this. Just wanted a little piece of sunshine and love to land on your doorstep today.\n\nAlways here for you,\n[Your Name]",
    fontStyleId: "1",
    fontName: "Warm Cursive",
    etiquetteTips: [
      {
        title: "Avoid Toxic Positivity",
        content: "Skip phrases like 'everything happens for a reason' or 'look on the bright side.' Simply validate their feelings and offer quiet solidarity.",
      },
      {
        title: "Remove the Burden of Answering",
        content: "Closing with 'No need to reply' is one of the most compassionate gifts you can offer someone who is emotionally drained.",
      },
    ],
    faq: [
      {
        question: "Why send a card instead of a text?",
        answer: "A text creates an immediate social obligation to reply. A physical card can be opened in private, placed on a table, and reread whenever they need a reminder of love.",
      },
    ],
  },
];

export function normalizeOccasionSlug(occasion: string): string {
  const clean = occasion.toLowerCase().trim();
  return OCCASION_ALIASES[clean] || clean;
}

export function getScenario(occasionSlug: string, slug: string): ScenarioConfig | undefined {
  if (!slug) return undefined;

  const normOccasion = normalizeOccasionSlug(occasionSlug);
  const normSlug = slug.toLowerCase().trim();

  // 1. Exact match within normalized occasion
  const exact = SEO_SCENARIOS.find(
    (s) => s.occasionSlug === normOccasion && s.slug.toLowerCase() === normSlug
  );
  if (exact) return exact;

  // 2. Explicit alias match within normalized occasion
  const aliasMatch = SEO_SCENARIOS.find(
    (s) => s.occasionSlug === normOccasion && s.aliases?.some((a) => a.toLowerCase() === normSlug)
  );
  if (aliasMatch) return aliasMatch;

  // 3. Exact slug match across ANY occasion (in case user/ad hit /send/cards/loss-of-beloved-pet)
  const crossExact = SEO_SCENARIOS.find((s) => s.slug.toLowerCase() === normSlug);
  if (crossExact) return crossExact;

  // 4. Alias match across ANY occasion
  const crossAlias = SEO_SCENARIOS.find((s) =>
    s.aliases?.some((a) => a.toLowerCase() === normSlug)
  );
  if (crossAlias) return crossAlias;

  // 5. Keyword / tokenized fuzzy match within the occasion
  const occasionScenarios = SEO_SCENARIOS.filter((s) => s.occasionSlug === normOccasion);
  if (occasionScenarios.length > 0) {
    const cleanTokens = normSlug
      .split(/[-_]+/)
      .filter((t) => !["cards", "card", "mailed", "and", "or", "the", "for", "a", "of", "to"].includes(t));

    if (cleanTokens.length > 0) {
      let bestScenario = occasionScenarios[0];
      let bestScore = 0;

      for (const scenario of occasionScenarios) {
        let score = 0;
        const allKeywords = [
          scenario.slug,
          ...(scenario.aliases || []),
          ...scenario.keywords,
          scenario.h1Title,
        ]
          .join(" ")
          .toLowerCase();

        for (const token of cleanTokens) {
          if (allKeywords.includes(token)) {
            score++;
          }
        }

        if (score > bestScore) {
          bestScore = score;
          bestScenario = scenario;
        }
      }

      if (bestScore > 0) {
        return bestScenario;
      }
    }

    // 6. Occasion-level fallback: if the occasion is valid but the slug didn't match any specific scenario,
    // fallback to the primary scenario of this occasion instead of 404!
    // This protects ad campaigns with custom tracking, new ad variants, or dynamic keyword slugs.
    return occasionScenarios[0];
  }

  // 7. Fallback if occasionSlug itself was actually a scenario slug (e.g. /send/loss-of-pet)
  const fallbackByOccasionParam = SEO_SCENARIOS.find(
    (s) => s.slug.toLowerCase() === normOccasion || s.aliases?.some((a) => a.toLowerCase() === normOccasion)
  );
  if (fallbackByOccasionParam) return fallbackByOccasionParam;

  return undefined;
}

export function getAllScenarios(): ScenarioConfig[] {
  return SEO_SCENARIOS;
}

export function getScenariosByCategory(category: string): ScenarioConfig[] {
  return SEO_SCENARIOS.filter((s) => s.category === category);
}

export function getScenariosByOccasion(occasionSlug: string): ScenarioConfig[] {
  const norm = normalizeOccasionSlug(occasionSlug);
  return SEO_SCENARIOS.filter((s) => s.occasionSlug === norm);
}

export function getAllOccasions(): {
  occasionSlug: string;
  occasionName: string;
  count: number;
  primaryScenario: ScenarioConfig;
}[] {
  const seen = new Set<string>();
  const results: {
    occasionSlug: string;
    occasionName: string;
    count: number;
    primaryScenario: ScenarioConfig;
  }[] = [];

  for (const s of SEO_SCENARIOS) {
    if (!seen.has(s.occasionSlug)) {
      seen.add(s.occasionSlug);
      const scenarios = SEO_SCENARIOS.filter((item) => item.occasionSlug === s.occasionSlug);
      results.push({
        occasionSlug: s.occasionSlug,
        occasionName: s.occasionName,
        count: scenarios.length,
        primaryScenario: s,
      });
    }
  }

  return results;
}

/**
 * Maps legacy numerical scenario font styles ("1", "2", "3", "4") to Handwrytten SVG font keys.
 */
export function mapScenarioFontId(fontStyleId?: string): string {
  if (!fontStyleId) return "hwDavid";
  switch (fontStyleId) {
    case "1":
      return "hwKate"; // Warm Cursive
    case "2":
      return "hwKate"; // Classic Cursive
    case "3":
      return "hwAdam"; // Architect Print
    case "4":
      return "hwAdam"; // Executive Fountain Pen
    case "hwDavid":
    case "hwKate":
    case "hwAdam":
    case "hwChase":
      return fontStyleId;
    default:
      return "hwDavid";
  }
}

/**
 * Splits a pre-formatted etiquette scenario handwritten note into:
 * - salutation (e.g. "Dear [Interviewer Name],")
 * - bodyNote (the core body text)
 * - signOff (e.g. "Best regards,\n[Your Name]")
 */
export function parseScenarioNote(rawNote: string): {
  salutation: string;
  bodyNote: string;
  signOff: string;
} {
  const trimmed = rawNote.trim();
  if (!trimmed) {
    return { salutation: "", bodyNote: "", signOff: "" };
  }

  const paragraphs = trimmed.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

  if (paragraphs.length === 1) {
    return { salutation: "", bodyNote: paragraphs[0], signOff: "" };
  }

  let salutation = "";
  let signOff = "";
  const bodyParagraphs = [...paragraphs];

  // 1. Check if the first paragraph is a greeting/salutation
  const first = bodyParagraphs[0];
  if (
    /^(dear|to|hi|hello|happy\b)/i.test(first) ||
    (first.length < 50 && (first.endsWith(",") || first.endsWith("!")))
  ) {
    salutation = bodyParagraphs.shift()!;
  }

  // 2. Check if the last paragraph is a sign-off
  if (bodyParagraphs.length > 0) {
    const last = bodyParagraphs[bodyParagraphs.length - 1];
    if (
      /^(warmly|best|with|love|sincerely|cheers|yours|always|here's to)/i.test(last) ||
      last.includes("[Your Name]") ||
      (last.length < 50 && (last.includes(",") || last.includes("\n")))
    ) {
      signOff = bodyParagraphs.pop()!;
    }
  }

  return {
    salutation,
    bodyNote: bodyParagraphs.join("\n\n"),
    signOff,
  };
}

