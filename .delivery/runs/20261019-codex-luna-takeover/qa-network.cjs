require('./lib/testing/deny-external-network.cjs');
const originalFetch = globalThis.fetch;
globalThis.fetch = function(input, options) {
 const raw = typeof input === 'string' ? input : input.url || String(input);
 const parsed = new URL(raw, 'http://127.0.0.1:3107');
 if (!['localhost','127.0.0.1','[::1]'].includes(parsed.hostname)) throw new Error('Isolated QA: outbound fetch denied');
 return originalFetch(input, options);
};
