// Preload with NODE_OPTIONS=--require to deny SDK transports, not just fetch.
// Local emulator/test endpoints remain available on loopback.
const net = require('node:net');
const http = require('node:http');
const https = require('node:https');
const tls = require('node:tls');

function hostOf(input) {
  if (typeof input === 'string') {
    try { return new URL(input).hostname; } catch { return input; }
  }
  if (input && typeof input === 'object') {
    return input.hostname || input.host || input.servername || '';
  }
  return '';
}
function allowed(input) {
  const host = String(hostOf(input)).replace(/^\[|\]$/g, '').toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.endsWith('.localhost');
}
function denied(input, method) {
  const error = new Error(`[network-guard] blocked ${method} to ${hostOf(input) || 'unknown host'}`);
  error.code = 'EXTERNAL_NETWORK_DENIED';
  return error;
}
for (const mod of [http, https]) {
  for (const method of ['request', 'get']) {
    const original = mod[method];
    mod[method] = function guarded(input, ...args) {
      if (!allowed(input)) throw denied(input, `${mod === https ? 'https' : 'http'}.${method}`);
      return original.call(this, input, ...args);
    };
  }
}
for (const mod of [net, tls]) {
  const original = mod.connect;
  mod.connect = function guarded(options, ...args) {
    const target = typeof options === 'number' && typeof args[0] === 'string' ? { host: args[0] } : options;
    if (!allowed(target)) throw denied(target, `${mod === tls ? 'tls' : 'net'}.connect`);
    return original.call(this, options, ...args);
  };
}
