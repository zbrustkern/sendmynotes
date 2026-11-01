import { NextRequest } from 'next/server';
import { accountError, accountJson, requireAccountActor } from '@/lib/account/http';

const retired = () => accountJson({ message: 'Manage optional occasion dates and reminders in your account.', href: '/account/dates' }, 410);

/** Legacy reminder storage bypasses current account consent and delivery gates. */
export async function GET(req: NextRequest) {
  try {
    await requireAccountActor(req);
    return retired();
  } catch (error) { return accountError(error); }
}

/** The old anonymous POST path is retired; writes must use the account Dates flow. */
export async function POST(req: NextRequest) {
  try {
    await requireAccountActor(req, true);
    return retired();
  } catch (error) { return accountError(error); }
}

export async function DELETE(req: NextRequest) {
  try {
    await requireAccountActor(req, true);
    return retired();
  } catch (error) { return accountError(error); }
}
