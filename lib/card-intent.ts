import { OccasionType, Order } from "./types";

export type CardIntentCategory =
  | "birthday"
  | "anniversary"
  | "thank_you"
  | "sympathy"
  | "thinking_of_you"
  | "holiday"
  | "congratulations"
  | "general";

export type InteractionMode =
  | "annual_reminder"
  | "holiday_headstart"
  | "care_checkin"
  | "address_book_retention"
  | "milestone_save";

export interface CardIntentConfig {
  category: CardIntentCategory;
  badgeLabel: string;
  badgeEmoji: string;
  badgeClass: string;
  headline: string;
  description: string;
  interactionMode: InteractionMode;
  defaultOccasionType: OccasionType;
  defaultOccasionTitle: string;
  suggestedMonth: number;
  suggestedDay: number;
  primaryButtonLabel: string;
  successTitle: string;
  successDescription: string;
  allowDateAdjustment: boolean;
}

const REGEX_PATTERNS = {
  birthday: /\b(birthday|b-day|bday|born|another year older|turning \d+|happy \d+(st|nd|rd|th) b(ir)?thday)\b/i,
  anniversary: /\b(anniversary|years together|years of marriage|happy anniversary|golden anniversary|silver anniversary)\b/i,
  thank_you: /\b(thank you|thanks so much|heartfelt thanks|so grateful|deeply grateful|sincere appreciation|thankful for you|grateful for|thanks for hosting|thanks for having me|interview thanks)\b/i,
  sympathy: /\b(sympathy|condolences|deepest condolences|sorry for your loss|loss of your|in our thoughts and prayers|thinking of you during this difficult time|heartbreaking loss|mourning|with heavy hearts)\b/i,
  thinking_of_you: /\b(thinking of you|just checking in|miss you|sending love|on my mind|sending warm thoughts|warmest thoughts|keeping you in my thoughts)\b/i,
  holiday: /\b(merry christmas|happy holidays|happy new year|season's greetings|happy valentine|mother's day|father's day|thanksgiving|easter blessings)\b/i,
  congratulations: /\b(congratulations|congrats|so proud of you|new home|new job|well deserved|huge milestone|graduation|bundle of joy|new baby)\b/i,
};

/**
 * Intelligently classifies the intent of a card based on explicit occasion tags,
 * presets, and subtle message context, ensuring post-purchase recommendations
 * remain deeply respectful, elegant, and never tone-deaf.
 */
export function detectCardIntent(order: Partial<Order>): CardIntentConfig {
  const firstName = order.recipientAddress?.firstName?.trim() || "Recipient";
  const explicitOccasionType = order.recipientOccasion?.occasionType;
  const occasionString = (order.occasion || "").toLowerCase().trim();
  const textContent = `${order.printedMessage || ""} ${order.handwrittenNote || ""}`.toLowerCase();

  // Reference date: default to today or order creation date
  const baseDate = order.scheduledSendDate
    ? new Date(order.scheduledSendDate + "T00:00:00")
    : order.createdAt
    ? new Date(order.createdAt)
    : new Date();

  const currentMonth = baseDate.getMonth() + 1; // 1-12
  const currentDay = baseDate.getDate(); // 1-31

  // 1. SYMPATHY / CONDOLENCES (Checked first for highest emotional sensitivity)
  if (
    occasionString.includes("sympathy") ||
    occasionString.includes("condolence") ||
    REGEX_PATTERNS.sympathy.test(textContent)
  ) {
    // Care check-in suggested in 3 months
    const checkinDate = new Date(baseDate);
    checkinDate.setMonth(checkinDate.getMonth() + 3);

    return {
      category: "sympathy",
      badgeLabel: "Thoughtful Care",
      badgeEmoji: "🕊️",
      badgeClass: "bg-stone-100 text-stone-700 border-stone-300",
      headline: `Your note of care to ${firstName} is on its way`,
      description: `We'll pen your words with real ink and dispatch them promptly. We've preserved ${firstName}'s address in your private address book so you can reach out whenever you wish.`,
      interactionMode: "care_checkin",
      defaultOccasionType: "custom",
      defaultOccasionTitle: `Check in with ${firstName}`,
      suggestedMonth: checkinDate.getMonth() + 1,
      suggestedDay: checkinDate.getDate(),
      primaryButtonLabel: `Remind Me to Check In (3 Months)`,
      successTitle: `Care Check-In Saved`,
      successDescription: `We'll send you a quiet note in 3 months to see if you'd like to check in on ${firstName}.`,
      allowDateAdjustment: false,
    };
  }

  // 2. BIRTHDAY
  if (
    explicitOccasionType === "birthday" ||
    occasionString.includes("birthday") ||
    occasionString.includes("bday") ||
    REGEX_PATTERNS.birthday.test(textContent)
  ) {
    const month = order.recipientOccasion?.month || currentMonth;
    const day = order.recipientOccasion?.day || currentDay;

    return {
      category: "birthday",
      badgeLabel: "Annual Birthday",
      badgeEmoji: "🎂",
      badgeClass: "bg-amber-100 text-amber-900 border-amber-300",
      headline: `Never miss ${firstName}'s birthday next year`,
      description: `We'll send a single, quiet email 14 days before their birthday next year with a 1-click personalized link to pen their card. Pure opt-in, zero spam.`,
      interactionMode: "annual_reminder",
      defaultOccasionType: "birthday",
      defaultOccasionTitle: `${firstName}'s Birthday`,
      suggestedMonth: month,
      suggestedDay: day,
      primaryButtonLabel: `Remind Me 14 Days Before`,
      successTitle: `Annual Birthday Reminder Active`,
      successDescription: `We'll remind you two weeks before ${firstName}'s birthday so our studio can pen and mail a fresh card on time.`,
      allowDateAdjustment: true,
    };
  }

  // 3. ANNIVERSARY
  if (
    explicitOccasionType === "anniversary" ||
    occasionString.includes("anniversary") ||
    REGEX_PATTERNS.anniversary.test(textContent)
  ) {
    const month = order.recipientOccasion?.month || currentMonth;
    const day = order.recipientOccasion?.day || currentDay;

    return {
      category: "anniversary",
      badgeLabel: "Annual Anniversary",
      badgeEmoji: "🥂",
      badgeClass: "bg-rose-100 text-rose-900 border-rose-300",
      headline: `Remember ${firstName}'s anniversary next year`,
      description: `We'll quietly email you 14 days before their anniversary so you always have time to compose something heartfelt without the last-minute rush.`,
      interactionMode: "annual_reminder",
      defaultOccasionType: "anniversary",
      defaultOccasionTitle: `${firstName}'s Anniversary`,
      suggestedMonth: month,
      suggestedDay: day,
      primaryButtonLabel: `Set Anniversary Reminder`,
      successTitle: `Anniversary Reminder Confirmed`,
      successDescription: `We'll send an early reminder two weeks prior so you can craft another heartfelt note.`,
      allowDateAdjustment: true,
    };
  }

  // 4. THANK YOU / GRATITUDE (Relational, not an annual birthday)
  if (
    occasionString.includes("thank") ||
    occasionString.includes("gratitude") ||
    REGEX_PATTERNS.thank_you.test(textContent)
  ) {
    return {
      category: "thank_you",
      badgeLabel: "Private Address Book",
      badgeEmoji: "✉️",
      badgeClass: "bg-indigo-100 text-indigo-900 border-indigo-300",
      headline: `Keep ${firstName} in your private address book`,
      description: `We've saved ${firstName}'s mailing address to your account. Next time you want to send a handwritten note of thanks or appreciation, it takes less than 30 seconds.`,
      interactionMode: "address_book_retention",
      defaultOccasionType: "milestone",
      defaultOccasionTitle: `Note to ${firstName}`,
      suggestedMonth: currentMonth,
      suggestedDay: currentDay,
      primaryButtonLabel: `Save ${firstName}'s Contact`,
      successTitle: `Contact Saved to Address Book`,
      successDescription: `${firstName}'s address is preserved for your next note of gratitude.`,
      allowDateAdjustment: true,
    };
  }

  // 5. HOLIDAY
  if (
    explicitOccasionType === "holiday" ||
    occasionString.includes("holiday") ||
    occasionString.includes("christmas") ||
    occasionString.includes("new year") ||
    REGEX_PATTERNS.holiday.test(textContent)
  ) {
    return {
      category: "holiday",
      badgeLabel: "Holiday Tradition",
      badgeEmoji: "🎄",
      badgeClass: "bg-emerald-100 text-emerald-900 border-emerald-300",
      headline: `Get an early head start on the holidays next year`,
      description: `Beat the postal rush. We can send you an early reminder in November with 1-click access to send cards or upload your full holiday address list.`,
      interactionMode: "holiday_headstart",
      defaultOccasionType: "holiday",
      defaultOccasionTitle: `Holiday Cards for ${firstName}`,
      suggestedMonth: 11, // November
      suggestedDay: 10,  // Nov 10
      primaryButtonLabel: `Remind Me Next November`,
      successTitle: `Holiday Head-Start Queued`,
      successDescription: `We'll send you an early reminder in November 2027 so you have plenty of time for holiday mailings.`,
      allowDateAdjustment: false,
    };
  }

  // 6. THINKING OF YOU / FRIENDSHIP
  if (
    occasionString.includes("thinking") ||
    occasionString.includes("friendship") ||
    REGEX_PATTERNS.thinking_of_you.test(textContent)
  ) {
    return {
      category: "thinking_of_you",
      badgeLabel: "Staying Connected",
      badgeEmoji: "☕",
      badgeClass: "bg-amber-100 text-amber-900 border-amber-300",
      headline: `Stay easily connected with ${firstName}`,
      description: `Spontaneous notes often mean the most. ${firstName}'s address is securely preserved so sending your next card is effortless whenever they cross your mind.`,
      interactionMode: "address_book_retention",
      defaultOccasionType: "custom",
      defaultOccasionTitle: `Stay in touch with ${firstName}`,
      suggestedMonth: currentMonth,
      suggestedDay: currentDay,
      primaryButtonLabel: `Keep in Address Book`,
      successTitle: `Address Book Updated`,
      successDescription: `${firstName} is safely saved in your address book.`,
      allowDateAdjustment: true,
    };
  }

  // 7. CONGRATULATIONS / MILESTONE
  if (
    explicitOccasionType === "milestone" ||
    occasionString.includes("congrat") ||
    occasionString.includes("milestone") ||
    REGEX_PATTERNS.congratulations.test(textContent)
  ) {
    return {
      category: "congratulations",
      badgeLabel: "Celebration & Milestones",
      badgeEmoji: "🏆",
      badgeClass: "bg-amber-100 text-amber-900 border-amber-300",
      headline: `Celebrate ${firstName}'s next big milestone`,
      description: `${firstName}'s address is safely stored in your private address book. You can easily send cards for future promotions, new homes, and celebrations.`,
      interactionMode: "milestone_save",
      defaultOccasionType: "milestone",
      defaultOccasionTitle: `${firstName}'s Milestone`,
      suggestedMonth: currentMonth,
      suggestedDay: currentDay,
      primaryButtonLabel: `Save ${firstName}'s Address`,
      successTitle: `Milestone Contact Saved`,
      successDescription: `${firstName}'s details are saved for future celebrations.`,
      allowDateAdjustment: true,
    };
  }

  // 8. GENERAL FALLBACK (Graceful, understated, polite)
  return {
    category: "general",
    badgeLabel: "Address Book",
    badgeEmoji: "✨",
    badgeClass: "bg-stone-100 text-stone-800 border-stone-200",
    headline: `Keep ${firstName} in your private address book`,
    description: `${firstName}'s mailing details are preserved for future cards. You can also opt into an annual reminder if this marks a recurring date.`,
    interactionMode: "annual_reminder",
    defaultOccasionType: "custom",
    defaultOccasionTitle: `Annual Note to ${firstName}`,
    suggestedMonth: currentMonth,
    suggestedDay: currentDay,
    primaryButtonLabel: `Remind Me Next Year`,
    successTitle: `Reminder Saved`,
    successDescription: `We'll remind you two weeks before this date next year.`,
    allowDateAdjustment: true,
  };
}
