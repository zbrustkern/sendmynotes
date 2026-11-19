// A private, per-draft nonce scopes guest checkout retries. It is separate from
// analytics IDs and the exported draft. Never persist Stripe client secrets.
const memory = new Map<string, string>();

export function checkoutDraftKey(scope: string): string {
  const name = "smn_checkout_" + scope;
  let saved: string | undefined;
  try {
    saved = document.cookie.split("; ").find(item => item.startsWith(name + "="))?.slice(name.length + 1);
  } catch { /* This browser can still keep its active checkout in memory. */ }
  if (saved && /^[a-f0-9]{48}$/.test(saved)) return saved;
  const key = memory.get(name) ?? Array.from(crypto.getRandomValues(new Uint8Array(24)), b => b.toString(16).padStart(2, "0")).join("");
  memory.set(name, key);
  try {
    document.cookie = name + "=" + key + "; Max-Age=172800; Path=/; SameSite=Strict" + (location.protocol === "https:" ? "; Secure" : "");
  } catch { /* The in-memory key still covers navigation and retries. */ }
  return key;
}

export function clearCheckoutDraftKey(scope: string): void {
  const name = "smn_checkout_" + scope;
  memory.delete(name);
  try { document.cookie = name + "=; Max-Age=0; Path=/; SameSite=Strict"; } catch { /* storage is optional */ }
}

export function previousCheckoutProof() {
  try {
    const orderId = sessionStorage.getItem("smn_checkout_order_id");
    const viewToken = sessionStorage.getItem("smn_checkout_view_token");
    return orderId && viewToken ? { orderId, viewToken } : undefined;
  } catch { return undefined; }
}
