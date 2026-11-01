export const STARTER_LETTERING = ['Thank You', 'Happy Birthday', 'Thinking of You', 'Congratulations', "You're Wonderful"] as const;

/** A suggestion only: this deliberately catches likely requests, not ordinary
 * descriptions such as “a person writing a letter”. It never edits the prompt. */
export function promptRequestsText(value: string): boolean {
  const prompt = value.trim();
  if (!prompt) return false;
  return /\b(?:write|say|text|words|lettering|spell|put)\b.{0,100}\b(?:on (?:the )?(?:card|front|it)|cover|card|front|image|says?|words?|text)\b/i.test(prompt)
    || /\b(?:add|include|show|print)\b.{0,80}\b(?:text|words|lettering|“[^”]+”|"[^"]+")/i.test(prompt)
    || /\b(?:happy birthday|thank you|congratulations|thinking of you)\b.{0,60}\b(?:on|card|cover|front)\b/i.test(prompt);
}

export function heicGuidance(fileName: string, mimeType: string): boolean {
  return /\.(?:heic|heif)$/i.test(fileName) || /image\/(?:heic|heif)/i.test(mimeType);
}

/** Only use browser history for the in-flow builder handoff. A copied edit URL
 * otherwise has no known return page, so cancellation safely falls back to the
 * card builder. */
export function studioCancelDestination(returnTo: string | null, referrer: string, origin: string): 'back' | '/new' {
  if (returnTo !== 'builder' || !referrer || !origin) return '/new';
  try {
    const from = new URL(referrer);
    const current = new URL(origin);
    return from.origin === current.origin && (from.pathname === '/new' || from.pathname === '/preview/entry') ? 'back' : '/new';
  } catch { return '/new'; }
}

/** Begin a candidate request without discarding the previously accepted front. */
export function beginStudioGeneration<T extends { status: string; generationId: string }>(current: T): T {
  return { ...current, status: 'pending', generationId: '' };
}
