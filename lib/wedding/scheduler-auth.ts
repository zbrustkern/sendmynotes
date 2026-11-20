import { OAuth2Client } from 'google-auth-library';

const verifier = new OAuth2Client();
type Claims = { email?: string; email_verified?: boolean };
type Verify = (token: string, audience: string) => Promise<Claims | undefined>;

async function verifyGoogleToken(token: string, audience: string) {
  const ticket = await verifier.verifyIdToken({idToken: token, audience});
  return ticket.getPayload();
}

/** Authorizes the configured Cloud Scheduler identity for staging or production reconciliation. */
export async function weddingSchedulerAuthorized(
  req: Request, env: NodeJS.ProcessEnv = process.env, verify: Verify = verifyGoogleToken,
): Promise<boolean> {
  let configuredProject: string | undefined;
  try {
    configuredProject = JSON.parse(env.FIREBASE_CONFIG || '{}').projectId;
  } catch {
    configuredProject = undefined;
  }
  const project = (
    env.FIREBASE_PROJECT_ID ||
    env.GOOGLE_CLOUD_PROJECT ||
    env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    configuredProject ||
    ''
  ).toLowerCase();
  const isStagingProject =
    project.includes('staging') ||
    (env.K_SERVICE || '').toLowerCase().includes('staging');
  if (isStagingProject && env.STAGING_REVIEW_ONLY !== 'true') return false;
  if (!isStagingProject && env.STAGING_REVIEW_ONLY === 'true') return false;

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
