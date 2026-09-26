import assert from "assert";
import {
  calculateDaysUntilNextOccasion,
  formatOccasionDate,
  getOccasionTypeDisplay,
  saveOccasionReminder,
  getRemindersForUser,
  getUpcomingReminders,
  deleteReminder,
  MONTH_NAMES,
  MONTH_SHORT_NAMES,
} from "../lib/reminders";
import { sendOccasionReminderEmail } from "../lib/email-alerts";

async function runReminderTests() {
  console.log("=================================================");
  console.log("🧪 RUNNING OCCASION REMINDERS & MILESTONES TESTS");
  console.log("=================================================\n");

  // 1. Test Date Math & Days Until Next Occasion
  console.log("--- 1. Testing Days Until Next Occasion Math ---");
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentDay = now.getDate();

  const daysToday = calculateDaysUntilNextOccasion(currentMonth, currentDay);
  assert.strictEqual(daysToday, 0, "Days until today should be 0");
  console.log("✅ PASS: Today's date calculates to exactly 0 days remaining");

  // Test tomorrow
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const daysTomorrow = calculateDaysUntilNextOccasion(tomorrow.getMonth() + 1, tomorrow.getDate());
  assert.strictEqual(daysTomorrow, 1, "Days until tomorrow should be 1");
  console.log("✅ PASS: Tomorrow's date calculates to exactly 1 day remaining");

  // Test 14 days out
  const inTwoWeeks = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  const daysInTwoWeeks = calculateDaysUntilNextOccasion(inTwoWeeks.getMonth() + 1, inTwoWeeks.getDate());
  assert.strictEqual(daysInTwoWeeks, 14, "Days in two weeks should be 14");
  console.log("✅ PASS: 14 days ahead correctly triggers reminder window threshold");

  // 2. Test Formatting & Display Helpers
  console.log("\n--- 2. Testing Formatting & Display Helpers ---");
  const formattedNoYear = formatOccasionDate(4, 18);
  assert.strictEqual(formattedNoYear, "Apr 18");
  console.log("✅ PASS: Formatted date without year: 'Apr 18'");

  const formattedWithYear = formatOccasionDate(10, 5, 2026);
  assert.strictEqual(formattedWithYear, "Oct 5, 2026");
  console.log("✅ PASS: Formatted date with year: 'Oct 5, 2026'");

  const bdayDisplay = getOccasionTypeDisplay("birthday");
  assert.strictEqual(bdayDisplay.emoji, "🎂");
  assert.strictEqual(bdayDisplay.label, "Birthday");
  console.log("✅ PASS: Birthday display emoji and label correct");

  const annivDisplay = getOccasionTypeDisplay("anniversary");
  assert.strictEqual(annivDisplay.emoji, "🥂");
  assert.strictEqual(annivDisplay.label, "Anniversary");
  console.log("✅ PASS: Anniversary display emoji and label correct");

  // 3. Test Persistence (Save, Query, Upcoming, Delete)
  console.log("\n--- 3. Testing Reminder Persistence & Queries ---");
  const testEmail = "test_reminder_user@example.com";
  const testUserId = "usr_test_reminder_999";

  const savedReminder = await saveOccasionReminder({
    recipientName: "Grandma Rose",
    userEmail: testEmail,
    userId: testUserId,
    occasionType: "birthday",
    occasionTitle: "Grandma Rose's 85th Birthday",
    month: inTwoWeeks.getMonth() + 1,
    day: inTwoWeeks.getDate(),
    year: 1941,
    remindDaysBefore: 14,
    optIn: true,
  });

  assert.ok(savedReminder.id.startsWith("rem_"));
  assert.strictEqual(savedReminder.recipientName, "Grandma Rose");
  assert.strictEqual(savedReminder.userEmail, testEmail);
  assert.strictEqual(savedReminder.remindDaysBefore, 14);
  console.log("✅ PASS: Reminder record created and persisted to Firestore");

  const userReminders = await getRemindersForUser({ email: testEmail });
  assert.ok(userReminders.length >= 1, "Should find saved reminder by email");
  const found = userReminders.find((r) => r.id === savedReminder.id);
  assert.ok(found, "Saved reminder should exist in user's query results");
  console.log("✅ PASS: Reminder retrieved by customer email");

  const upcomingList = await getUpcomingReminders(14);
  const foundUpcoming = upcomingList.find((u) => u.reminder.id === savedReminder.id);
  assert.ok(foundUpcoming, "Reminder 14 days out should appear in upcoming list");
  assert.strictEqual(foundUpcoming.daysRemaining, 14);
  console.log("✅ PASS: Reminder identified in getUpcomingReminders(14) queue");

  // 4. Test Email Alert Generation
  console.log("\n--- 4. Testing Reminder Email Dispatch Engine ---");
  const emailResult = await sendOccasionReminderEmail({
    toEmail: testEmail,
    recipientName: savedReminder.recipientName,
    occasionTitle: savedReminder.occasionTitle,
    occasionDateFormatted: formatOccasionDate(savedReminder.month, savedReminder.day, savedReminder.year),
    daysRemaining: 14,
    sendCardUrl: "https://sendmynotes.com/?toName=Grandma+Rose&occasion=Birthday",
  });
  assert.ok(emailResult.success, "Reminder email dispatch should succeed");
  console.log("✅ PASS: Reminder email dispatch formatted and logged successfully");

  // 5. Test Cleanup
  console.log("\n--- 5. Testing Deletion & Opt-Out ---");
  const deleted = await deleteReminder(savedReminder.id);
  assert.strictEqual(deleted, true);
  const remaining = await getRemindersForUser({ email: testEmail });
  const stillFound = remaining.find((r) => r.id === savedReminder.id);
  assert.strictEqual(stillFound, undefined, "Reminder should be deleted");
  console.log("✅ PASS: Reminder successfully deleted / opted out");

  console.log("\n=================================================");
  console.log("All Milestone & Reminder Tests Passed! 🎂🥂");
  console.log("=================================================\n");
}

runReminderTests().catch((err) => {
  console.error("❌ Test Failed:", err);
  process.exit(1);
});
