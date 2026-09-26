import { NextRequest, NextResponse } from "next/server";
import { saveOccasionReminder, getRemindersForUser, deleteReminder } from "@/lib/reminders";
import { OccasionType, MailingAddress } from "@/lib/types";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId") || undefined;
    const email = searchParams.get("email") || undefined;

    if (!userId && !email) {
      return NextResponse.json({ error: "userId or email required" }, { status: 400 });
    }

    const reminders = await getRemindersForUser({ userId, email });
    return NextResponse.json({ reminders });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error fetching reminders";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      id,
      recipientName,
      userEmail,
      userId,
      occasionType = "birthday",
      occasionTitle,
      month,
      day,
      year,
      remindDaysBefore = 14,
      recipientAddress,
      recipientId,
      orderId,
      notes,
    } = body;

    if (!recipientName || typeof recipientName !== "string" || !recipientName.trim()) {
      return NextResponse.json({ error: "Recipient name is required." }, { status: 400 });
    }

    if (!userEmail || typeof userEmail !== "string" || !userEmail.includes("@")) {
      return NextResponse.json({ error: "A valid notification email is required." }, { status: 400 });
    }

    const m = Number(month);
    const d = Number(day);

    if (isNaN(m) || m < 1 || m > 12) {
      return NextResponse.json({ error: "Please select a valid month (1-12)." }, { status: 400 });
    }

    if (isNaN(d) || d < 1 || d > 31) {
      return NextResponse.json({ error: "Please select a valid day (1-31)." }, { status: 400 });
    }

    const title =
      occasionTitle && typeof occasionTitle === "string" && occasionTitle.trim()
        ? occasionTitle.trim()
        : `${recipientName.trim()}'s ${occasionType.charAt(0).toUpperCase() + occasionType.slice(1)}`;

    const reminder = await saveOccasionReminder({
      id: id || undefined,
      recipientName: recipientName.trim(),
      userEmail: userEmail.trim().toLowerCase(),
      userId: userId || undefined,
      occasionType: occasionType as OccasionType,
      occasionTitle: title,
      month: m,
      day: d,
      year: year ? Number(year) : undefined,
      remindDaysBefore: Number(remindDaysBefore) || 14,
      optIn: true,
      recipientAddress: recipientAddress as MailingAddress | undefined,
      recipientId: recipientId || undefined,
      orderId: orderId || undefined,
      notes: notes || undefined,
    });

    return NextResponse.json({
      success: true,
      reminder,
      message: `Reminder set! We will email you ${reminder.remindDaysBefore} days before ${reminder.occasionTitle}.`,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error saving occasion reminder";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Reminder ID required" }, { status: 400 });
    }

    const success = await deleteReminder(id);
    return NextResponse.json({ success });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error deleting reminder";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
