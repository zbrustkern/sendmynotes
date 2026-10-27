import type { Order } from "./types";
import { saveOccasionReminder } from "./reminders";
import { effectiveOrderEmail } from "./checkout-contact-policy";
export { contactEmailChoice, effectiveOrderEmail, normalizeCheckoutEmail, checkoutEmailRequired } from "./checkout-contact-policy";

/** Save only after checkout succeeds and only when the sender explicitly opted in. */
export async function savePaidOrderReminder(order: Order, email: string): Promise<void> {
  const occasion = order.recipientOccasion;
  if (!occasion?.remindMe || !email || !occasion.month || !occasion.day) return;
  await saveOccasionReminder({
    id: `order_rem_${order.id}`,
    recipientName: `${order.recipientAddress.firstName || ""} ${order.recipientAddress.lastName || ""}`.trim() || "Recipient",
    recipientAddress: order.recipientAddress,
    userEmail: email,
    ...(order.userId ? { userId: order.userId } : {}),
    occasionType: occasion.occasionType || "birthday",
    occasionTitle: occasion.occasionTitle || `${occasion.occasionType || "Occasion"} Reminder`,
    month: Number(occasion.month), day: Number(occasion.day),
    ...(occasion.year ? { year: Number(occasion.year) } : {}),
    remindDaysBefore: occasion.remindDaysBefore || 14,
    optIn: true,
    orderId: order.id,
  });
}
