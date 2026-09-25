import { ScenarioConfig } from "./types";

export const SEO_SCENARIOS: ScenarioConfig[] = [
  // 1. CAREER: Post Job Interview Thank You
  {
    slug: "after-job-interview",
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
    coverUrl: "https://images.unsplash.com/photo-1583521214690-73421a1829a9?auto=format&fit=crop&w=1250&h=1750&q=80",
    coverPrompt: "Minimalist executive desk with a vintage brass fountain pen, warm natural light, quiet luxury aesthetic",
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
    coverUrl: "https://images.unsplash.com/photo-1497633762265-9d179a990aa6?auto=format&fit=crop&w=1250&h=1750&q=80",
    coverPrompt: "Warm library study with antique leather books, warm morning sunlight, brass reading lamp, literary aesthetic",
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
    coverUrl: "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1250&h=1750&q=80",
    coverPrompt: "Modern architectural sanctuary with sunlit limestone, lush green olive branches, quiet luxury aesthetic",
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

  // 4. SYMPATHY: Loss of a Beloved Pet
  {
    slug: "loss-of-beloved-pet",
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
    coverUrl: "https://images.unsplash.com/photo-1534361960057-19889db9621e?auto=format&fit=crop&w=1250&h=1750&q=80",
    coverPrompt: "Gentle watercolor meadow with soft golden sunlight, gentle wildflowers, quiet peaceful landscape, soft earth tones",
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
    coverUrl: "https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&w=1250&h=1750&q=80",
    coverPrompt: "Misty evergreen forest at dawn, quiet mountain mist, peaceful serene watercolor nature, contemplative landscape",
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
    coverUrl: "https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=1250&h=1750&q=80",
    coverPrompt: "Charming sunlit doorway surrounded by flowering jasmine and terracotta pots, welcoming warm aesthetic watercolor",
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

  // 8. BIRTHDAY: Milestone 50th, 60th, or 70th Birthday
  {
    slug: "milestone-birthday",
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
    occasionSlug: "get-well",
    occasionName: "Thinking of You",
    category: "support",
    badgeText: "Healing & Care",
    h1Title: "Send a Get Well Soon Card for Surgery Recovery",
    heroTagline: "Recovering from surgery is exhausting and lonely. Brighten their bedside table with real handwritten encouragement.",
    metaTitle: "Get Well Soon Card After Surgery | Real Handwritten Delivery ($9)",
    metaDescription: "Send gentle healing wishes after a surgery or hospital stay. Crafted with real ballpoint pen ink on 5x7 folded cardstock with USPS stamp.",
    keywords: [
      "get well soon card after surgery",
      "what to write someone recovering from surgery",
      "surgery recovery get well card mail",
    ],
    coverUrl: "/presets/thinking-of-you-coffee.jpg",
    coverPrompt: "Warm ceramic tea cup with steam curling into soft clouds, morning sunlight, cozy healing watercolor illustration",
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
    coverUrl: "/presets/thank-you-botanical.jpg",
    coverPrompt: "Quiet wildflower meadow at twilight, soft lavender and sage tones, gentle minimalist landscape painting",
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

export function getScenario(occasionSlug: string, slug: string): ScenarioConfig | undefined {
  return SEO_SCENARIOS.find(
    (s) => s.occasionSlug.toLowerCase() === occasionSlug.toLowerCase() && s.slug.toLowerCase() === slug.toLowerCase()
  );
}

export function getAllScenarios(): ScenarioConfig[] {
  return SEO_SCENARIOS;
}

export function getScenariosByCategory(category: string): ScenarioConfig[] {
  return SEO_SCENARIOS.filter((s) => s.category === category);
}
