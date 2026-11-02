// Preload before SDK imports in test/build subprocesses. Loopback and Unix sockets
// remain available; all unrecognized hosts fail closed. Never log URL/query/auth.
const net = require('node:net');
const tls = require('node:tls');
const http = require('node:http');
const https = require('node:https');
const allowed = (host) => {
  const h = String(host || '').replace(/^\[|\]$/g, '').toLowerCase();
  return h === 'localhost' || h.endsWith('.localhost') || h === '127.0.0.1' || h === '::1' || h === '0:0:0:0:0:0:0:1';
};
const blocked = (host) => {
  const error = new Error(`External network access blocked by test guard (host: ${String(host || 'unknown')})`);
  error.code = 'ERR_EXTERNAL_NETWORK_BLOCKED';
  return error;
};
const hostFromArgs = (args) => {
  const first = args[0];
  if (typeof first === 'object' && first) return first.path ? null : first.host || first.hostname;
  if (typeof first === 'number') return typeof args[1] === 'string' ? args[1] : 'unknown';
  if (typeof first === 'string' && /^\//.test(first)) return null;
  return typeof args[1] === 'string' ? args[1] : 'unknown';
};
const originalNetConnect = net.connect;
net.connect = function (...args) {
  const host = hostFromArgs(args);
  if (host && !allowed(host)) throw blocked(host);
  return originalNetConnect.apply(this, args);
};
const originalSocketConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const host = hostFromArgs(args);
  if (host && !allowed(host)) throw blocked(host);
  return originalSocketConnect.apply(this, args);
};
const originalTlsConnect = tls.connect;
tls.connect = function (...args) {
  const first = args[0];
  const host = typeof first === 'object' ? first.host || first.hostname : (typeof args[1] === 'string' ? args[1] : undefined);
  if (host && !allowed(host)) throw blocked(host);
  if (!host && !(first && typeof first === 'object' && first.socket)) throw blocked('unknown');
  return originalTlsConnect.apply(this, args);
};
for (const mod of [http, https]) {
  for (const name of ['request', 'get']) {
    const original = mod[name];
    mod[name] = function (input, ...rest) {
      let host;
      try { host = typeof input === 'string' || input instanceof URL ? new URL(input).hostname : input?.hostname || input?.host; } catch {}
      if (!allowed(host)) throw blocked(host);
      return original.call(this, input, ...rest);
    };
  }
}
