import { OAuth2Client } from "google-auth-library";

const oidc = new OAuth2Client();

export async function offerSchedulerAuthorized(req: Request) {
  const account = process.env.OFFER_SCHEDULER_IDENTITY;
  const audience = process.env.OFFER_SCHEDULER_AUDIENCE;
  const token = req.headers.get("authorization")?.match(/^Bearer ([A-Za-z0-9._-]+)$/)?.[1];
  if (!account || !audience || !token || token.length > 8192) return false;
  try {
    const result = await oidc.verifyIdToken({ idToken: token, audience });
    const claims = result.getPayload();
    return claims?.email_verified === true && claims.email === account;
  } catch {
    return false;
  }
}
