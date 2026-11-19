import { OAuth2Client } from 'google-auth-library';

const verifier = new OAuth2Client();
type Claims = { email?: string; email_verified?: boolean };
type Verify = (token: string, audience: string) => Promise<Claims | undefined>;

async function verifyGoogleToken(token: string, audience: string) {
  const ticket = await verifier.verifyIdToken({idToken: token, audience});
  return ticket.getPayload();
}

/** Only the staging wedding scheduler may advance jobs when every tab is closed. */
export async function weddingSchedulerAuthorized(
  req: Request, env: NodeJS.ProcessEnv = process.env, verify: Verify = verifyGoogleToken,
): Promise<boolean> {
  if (env.FIREBASE_PROJECT_ID !== 'sendmynotes-staging' ||
      env.STAGING_REVIEW_ONLY !== 'true') return false;
  const account = env.WEDDING_SCHEDULER_IDENTITY;
  const audience = env.WEDDING_SCHEDULER_AUDIENCE;
  if (!account || !audience) return false;
  const token = req.headers.get('authorization')?.match(/^Bearer ([A-Za-z0-9._-]+)$/)?.[1];
  if (!token || token.length > 8192) return false;
  try {
    const claims = await verify(token, audience);
    return claims?.email_verified === true && claims.email === account;
  } catch {
    return false;
  }
}
