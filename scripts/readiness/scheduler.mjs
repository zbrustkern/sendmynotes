// Safe scheduler inventory/planning. This script intentionally does not create,
// pause, resume, patch, run, or delete jobs: Cloud Scheduler's Job.state is
// output-only, so create-then-pause would expose an invocation window.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { selectTarget } from './contracts.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(resolve(here, 'targets.json'), 'utf8'));
const [mode, targetName, project, output] = process.argv.slice(2);
assert(mode === 'plan', 'Usage: node scripts/readiness/scheduler.mjs <plan> <staging|production> <exact-project-id> [report.json]');
const target = selectTarget(manifest, targetName, project);

const MAX_RUN_MS = 60_000;
const REQUEST_TIMEOUT_MS = 8_000;
const MAX_ATTEMPTS = 4;
const startedAt = Date.now();
const routes = manifest.jobs.map(job => ({
  id: job.id,
  path: job.path,
  uri: new URL(job.path, target.origin).toString(),
  schedule: job.schedule,
  method: 'POST',
  timeZone: 'UTC',
  attemptDeadline: '300s',
  retryConfig: { retryCount: 2, maxRetryDuration: '300s', minBackoffDuration: '30s', maxBackoffDuration: '120s', maxDoublings: 2 },
  secretResource: job.secret,
}));

function safeError(error) {
  return {
    status: Number.isInteger(error?.status) ? error.status : null,
    reason: error?.reason || 'request_failed',
  };
}

function getAccessToken() {
  try {
    const token = execFileSync(process.env.SMN_GCLOUD_BIN || 'gcloud', ['auth', 'print-access-token'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 10_000,
    }).trim();
    assert(token.length > 20, 'An authenticated gcloud token is required.');
    return token;
  } catch {
    throw new Error('Could not obtain an authenticated Google Cloud access token; no credentials were emitted.');
  }
}

async function requestJson(url, token) {
  let lastError;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    if (Date.now() - startedAt >= MAX_RUN_MS) throw new Error('Scheduler preflight reached its total deadline.');
    try {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}`, 'x-goog-user-project': project },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) {
        const error = new Error('Google API request rejected.');
        error.status = response.status;
        error.reason = response.status === 403 ? 'forbidden_or_api_disabled' : response.status === 404 ? 'not_found' : 'api_error';
        if (![429, 500, 502, 503, 504].includes(response.status) || attempt === MAX_ATTEMPTS) throw error;
        lastError = error;
      } else {
        return await response.json();
      }
    } catch (error) {
      if (error.status) {
        if (![429, 500, 502, 503, 504].includes(error.status) || attempt === MAX_ATTEMPTS) throw error;
        lastError = error;
      } else {
        lastError = error;
        if (attempt === MAX_ATTEMPTS) throw error;
      }
    }
    const wait = Math.min(250 * (2 ** (attempt - 1)), 2_000);
    if (Date.now() + wait - startedAt >= MAX_RUN_MS) throw new Error('Scheduler preflight reached its total deadline.');
    await new Promise(resolveWait => setTimeout(resolveWait, wait));
  }
  throw lastError || new Error('Google API request failed.');
}

async function listPages(url, key, token) {
  const records = [];
  let pageToken = '';
  do {
    const pageUrl = new URL(url);
    if (pageToken) pageUrl.searchParams.set('pageToken', pageToken);
    const page = await requestJson(pageUrl.toString(), token);
    records.push(...(Array.isArray(page[key]) ? page[key] : []));
    pageToken = page.nextPageToken || '';
  } while (pageToken);
  return records;
}

async function main() {
  const token = getAccessToken();
  const report = {
    checkedAt: new Date().toISOString(),
    mode,
    target: targetName,
    project,
    region: target.region,
    readOnly: true,
    mutationsApplied: false,
    secretPayloadRead: false,
    secretPayloadLogged: false,
    jobs: [],
    prerequisite: null,
  };

  let service;
  try {
    service = await requestJson(`https://serviceusage.googleapis.com/v1/projects/${project}/services/cloudscheduler.googleapis.com`, token);
  } catch (error) {
    report.prerequisite = error.status === 403
      ? 'Cloud Scheduler API state is unavailable or access is denied; verify project API state and operator IAM. This script will not enable the API.'
      : 'Cloud Scheduler API state could not be verified; no jobs were changed.';
    report.apiState = safeError(error);
  }

  if (!report.prerequisite && service?.state !== 'ENABLED') {
    report.apiState = service?.state || 'UNKNOWN';
    report.prerequisite = 'Cloud Scheduler API is not enabled. Enablement is a separately reviewed prerequisite; this script will not enable it.';
  }

  if (!report.prerequisite) {
    try {
      const locations = await listPages(`https://cloudscheduler.googleapis.com/v1/projects/${project}/locations`, 'locations', token);
      const jobsByLocation = await Promise.all(locations.map(location =>
        listPages(`https://cloudscheduler.googleapis.com/v1/${location.name}/jobs`, 'jobs', token)));
      const existing = jobsByLocation.flat();
      for (const wanted of routes) {
        const matches = existing.filter(job => job.httpTarget?.uri === wanted.uri);
        report.jobs.push({
          id: wanted.id,
          route: wanted.path,
          method: wanted.method,
          schedule: wanted.schedule,
          timeZone: wanted.timeZone,
          attemptDeadline: wanted.attemptDeadline,
          retryConfig: wanted.retryConfig,
          secretResource: wanted.secretResource,
          matches: matches.map(job => ({
            name: job.name,
            state: job.state || 'UNKNOWN',
            schedule: job.schedule || null,
            timeZone: job.timeZone || null,
            method: job.httpTarget?.httpMethod || null,
            attemptDeadline: job.attemptDeadline || null,
            retryConfig: job.retryConfig || null,
            authenticated: Boolean(job.httpTarget?.headers?.Authorization || job.httpTarget?.oidcToken || job.httpTarget?.oauthToken),
            matchesProposedConfig: job.schedule === wanted.schedule
              && job.timeZone === wanted.timeZone
              && job.attemptDeadline === wanted.attemptDeadline
              && job.httpTarget?.httpMethod === wanted.method,
          })),
          action: matches.length ? 'retain_existing_without_changes' : 'deferred_pending_safe_paused_create',
        });
      }
      report.creationPolicy = 'Deferred: the Cloud Scheduler API marks Job.state as output-only. Creating an ENABLED job and pausing it afterward has an invocation window; no new job is created.';
      report.apiState = 'ENABLED';
    } catch (error) {
      report.prerequisite = 'Scheduler inventory could not be completed; no jobs were changed.';
      report.apiError = safeError(error);
    }
  }

  report.readOnly = true;
  report.mutationsApplied = false;
  report.deadlineMs = Date.now() - startedAt;
  if (output) writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main().catch(error => {
  process.stderr.write(`${error.message || 'Scheduler readiness check failed.'}\n`);
  process.exitCode = 1;
});
