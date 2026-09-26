import { OccasionType } from "./types";

export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export const MONTH_SHORT_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/**
 * Returns number of days until the next occurrence of month/day.
 * E.g. 0 if today, 14 if in two weeks.
 */
export function calculateDaysUntilNextOccasion(month: number, day: number): number {
  const now = new Date();
  const currentYear = now.getFullYear();

  // Create date at start of day in local time
  const today = new Date(currentYear, now.getMonth(), now.getDate());
  let target = new Date(currentYear, month - 1, day);

  if (target.getTime() < today.getTime()) {
    // Already happened this calendar year, look to next year
    target = new Date(currentYear + 1, month - 1, day);
  }

  const diffMs = target.getTime() - today.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

export function formatOccasionDate(month: number, day: number, year?: number): string {
  const mName = MONTH_SHORT_NAMES[month - 1] || `Month ${month}`;
  if (year) {
    return `${mName} ${day}, ${year}`;
  }
  return `${mName} ${day}`;
}

export function getOccasionTypeDisplay(type: OccasionType): {
  label: string;
  iconName: string;
  emoji: string;
  badgeClass: string;
} {
  switch (type) {
    case "birthday":
      return {
        label: "Birthday",
        iconName: "Gift",
        emoji: "🎂",
        badgeClass: "bg-amber-100 text-amber-800 border-amber-300",
      };
    case "anniversary":
      return {
        label: "Anniversary",
        iconName: "Heart",
        emoji: "🥂",
        badgeClass: "bg-rose-100 text-rose-800 border-rose-300",
      };
    case "holiday":
      return {
        label: "Holiday",
        iconName: "Calendar",
        emoji: "🎄",
        badgeClass: "bg-indigo-100 text-indigo-800 border-indigo-300",
      };
    case "milestone":
      return {
        label: "Milestone",
        iconName: "Award",
        emoji: "🏆",
        badgeClass: "bg-emerald-100 text-emerald-800 border-emerald-300",
      };
    case "custom":
    default:
      return {
        label: "Special Date",
        iconName: "Sparkles",
        emoji: "⭐️",
        badgeClass: "bg-stone-100 text-stone-800 border-stone-300",
      };
  }
}
