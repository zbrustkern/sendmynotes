#!/usr/bin/env bash
set -u

BASELINE_ROOT="${1:-/private/tmp/sendmynotes-international-20261026}"
NETWORK_GUARD="$BASELINE_ROOT/.delivery/runs/20261020-first-sale-cleanup/deny-network.cjs"
PATH_VALUE="/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"
TEMP_ROOT="$BASELINE_ROOT/.baseline-tmp"
BROWSER_TEST_ARTIFACT_ROOT="$BASELINE_ROOT/.baseline-browser-parent"
PLAYWRIGHT_MODULE="/Users/zeke/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright"
CHROMIUM_EXECUTABLE="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
failures=0
suite_number=0

if [[ ! -x "$BASELINE_ROOT/node_modules/.bin/tsx" ]]; then
  echo "Missing shared node_modules/tsx in $BASELINE_ROOT" >&2
  exit 2
fi
if [[ ! -f "$NETWORK_GUARD" ]]; then
  echo "Missing external-network guard: $NETWORK_GUARD" >&2
  exit 2
fi
mkdir -p "$TEMP_ROOT"
rm -rf "$BROWSER_TEST_ARTIFACT_ROOT"
trap 'rm -rf "$TEMP_ROOT" "$BROWSER_TEST_ARTIFACT_ROOT"' EXIT

run() {
  label="$1"
  known_failure="$2"
  shift
  shift
  suite_number=$((suite_number + 1))
  suite_root="$TEMP_ROOT/suite-$suite_number"
  mkdir -p "$suite_root"
  echo "=== $label ==="
  echo "COMMAND: $*"
  (cd "$suite_root" && env -i PATH="$PATH_VALUE" TMPDIR="$TEMP_ROOT" npm_config_cache="$TEMP_ROOT/npm-cache" NODE_ENV=test RESEND_API_KEY=re_mock_release_gate NODE_OPTIONS="--require=$NETWORK_GUARD" "$@") > "$suite_root/output.log" 2>&1
  status=$?
  cat "$suite_root/output.log"
  if [[ $status -eq 0 ]]; then
    echo "EXIT: 0"
  elif [[ -n "$known_failure" ]] && [[ $status -eq 1 ]] && grep -Fq "$known_failure" "$suite_root/output.log" && [[ $(grep -c '❌ FAIL:' "$suite_root/output.log") -eq 1 ]]; then
    echo "KNOWN BASELINE FIXTURE FAILURE (no test harness isolation): $known_failure"
  else
    echo "EXIT: $status"
    failures=$((failures + 1))
  fi
}

if [[ -f "$PLAYWRIGHT_MODULE/index.js" ]]; then
  run "mounted checkout repricing — parent flow" "" env "SMN_PLAYWRIGHT_MODULE=$PLAYWRIGHT_MODULE" "SMN_CHROMIUM_EXECUTABLE=$CHROMIUM_EXECUTABLE" node "$BASELINE_ROOT/tests/payment-checkout-parent.test.mjs"
  run "mounted checkout repricing — payment discount" "" env "SMN_PLAYWRIGHT_MODULE=$PLAYWRIGHT_MODULE" "SMN_CHROMIUM_EXECUTABLE=$CHROMIUM_EXECUTABLE" node "$BASELINE_ROOT/tests/payment-discount-browser.test.mjs"
  run "mounted international address editor" "" env "SMN_PLAYWRIGHT_MODULE=$PLAYWRIGHT_MODULE" "SMN_CHROMIUM_EXECUTABLE=$CHROMIUM_EXECUTABLE" node "$BASELINE_ROOT/tests/international-addressing-browser.test.mjs"
else
  echo "SKIP mounted checkout repricing browser suites: no available Playwright module; no dependency was installed."
fi

run "payment mode safety" "" node --import "$BASELINE_ROOT/node_modules/tsx/dist/loader.mjs" "$BASELINE_ROOT/tests/payment-mode-safety.test.ts"
run "international address UI and draft behavior" "" node --import "$BASELINE_ROOT/node_modules/tsx/dist/loader.mjs" "$BASELINE_ROOT/tests/international-addressing-ui.test.tsx"
run "international quote arithmetic" "" node --import "$BASELINE_ROOT/node_modules/tsx/dist/loader.mjs" "$BASELINE_ROOT/tests/international-pricing.test.ts"
run "international checkout integration and offer redemption" "" node --import "$BASELINE_ROOT/node_modules/tsx/dist/loader.mjs" "$BASELINE_ROOT/tests/international-checkout.integration.test.ts"
run "sender validation" "" node --import "$BASELINE_ROOT/node_modules/tsx/dist/loader.mjs" "$BASELINE_ROOT/tests/sender-validation.test.ts"
run "offer engine and pricing integrity" "" node --import "$BASELINE_ROOT/node_modules/tsx/dist/loader.mjs" "$BASELINE_ROOT/tests/sprint-0005-offer-engine.test.ts"
run "transaction security" "" node --import "$BASELINE_ROOT/node_modules/tsx/dist/loader.mjs" "$BASELINE_ROOT/tests/transaction-security.test.ts"

echo "FAILED_COMMANDS: $failures"
if [[ $failures -ne 0 ]]; then exit 1; fi
