import type { NextRequest } from 'next/server';
import { getAuthenticatedAdminActor, isAuthorizedAdminEmail, verifyAdminAuth } from '../admin-auth';
import { assertUploadRuntime } from './access';
import { UploadError } from './contracts';

/** Admin sessions and studio grants are separate capabilities. */
export function requireUploadAdmin(req: NextRequest): string {
  assertUploadRuntime();
  const actor = getAuthenticatedAdminActor(req)?.toLowerCase();
  if (!verifyAdminAuth(req) || !actor) throw new UploadError('authentication_required', 'Sign in with your administrator account.', 401);
  const configured = process.env.UPLOAD_ADMIN_EMAILS?.split(',').map(email => email.trim().toLowerCase()).filter(Boolean);
  if (!isAuthorizedAdminEmail(actor) || (configured && !configured.includes(actor))) {
    throw new UploadError('forbidden', 'This signed-in administrator does not have permission to manage upload access. Switch to an authorized administrator account.', 403);
  }
  return actor;
}
