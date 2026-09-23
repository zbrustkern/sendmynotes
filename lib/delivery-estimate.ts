/**
 * USPS First Class Mail Delivery Window Calculator
 * Accounts for 1 business day studio inking + 3 to 5 business days USPS transit (excluding Sundays).
 */

function addBusinessDays(startDate: Date, days: number): Date {
  const result = new Date(startDate);
  let added = 0;
  while (added < days) {
    result.setDate(result.getDate() + 1);
    // 0 = Sunday
    if (result.getDay() !== 0) {
      added++;
    }
  }
  return result;
}

export interface DeliveryWindow {
  dispatchDate: string; // Formatted date card is inked and dropped in mailbox
  earliestDate: string; // e.g. "Wed, Oct 1"
  latestDate: string;   // e.g. "Fri, Oct 3"
  formattedRange: string; // e.g. "Oct 1 – Oct 3"
  isScheduled: boolean;
}

export function calculateDeliveryEstimate(scheduledDateString?: string): DeliveryWindow {
  const now = new Date();
  let baseDate: Date;
  let isScheduled = false;

  if (scheduledDateString && /^\d{4}-\d{2}-\d{2}$/.test(scheduledDateString)) {
    const [year, month, day] = scheduledDateString.split("-").map(Number);
    baseDate = new Date(year, month - 1, day);
    isScheduled = true;
  } else {
    // If ordered after 2 PM local time, dispatch starts next business day
    baseDate = new Date();
    if (now.getHours() >= 14) {
      baseDate.setDate(baseDate.getDate() + 1);
    }
  }

  // 1 business day for studio pen inking and USPS carrier pickup
  const dispatchDate = isScheduled ? baseDate : addBusinessDays(baseDate, 1);

  // USPS First Class Mail: 3 to 5 business days from dispatch
  const earliestDelivery = addBusinessDays(dispatchDate, 3);
  const latestDelivery = addBusinessDays(dispatchDate, 5);

  const formatShort = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const formatFull = (d: Date) =>
    d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

  const formattedRange = `${formatShort(earliestDelivery)} – ${formatShort(latestDelivery)}`;

  return {
    dispatchDate: formatFull(dispatchDate),
    earliestDate: formatFull(earliestDelivery),
    latestDate: formatFull(latestDelivery),
    formattedRange,
    isScheduled,
  };
}
