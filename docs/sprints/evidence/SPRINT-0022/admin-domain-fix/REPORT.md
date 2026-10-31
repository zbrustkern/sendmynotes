# Staging admin custom-domain sign-in repair — 2026-10-31

The screenshot error was reproduced: Firebase's project-config request returned 403 when Referer was `https://staging.sendmynotes.com/`, but 200 for the App Hosting URL used in the initial sprint checks. Firebase Authentication already authorized the custom domain; the browser API key's separate referrer restrictions omitted it.

Enabled the API Keys management API in the staging project and added only `https://staging.sendmynotes.com/*` to the matching staging browser key. Preserved existing referrers and API-target restrictions. No app deployment or production change was required.

After propagation, project-config probes returned 200 for both staging URLs and 403 for an unrelated domain. A fresh mobile-viewport Chrome session loaded the actual custom-domain admin page and opened Google sign-in, with a 200 Firebase config response and no referrer error. This verifies sign-in initiation; no user credentials were entered and no user Google sign-in was completed.

Before/after settings and browser evidence are stored alongside this report. Future release checks must cover the custom staging domain as well as the App Hosting URL.
