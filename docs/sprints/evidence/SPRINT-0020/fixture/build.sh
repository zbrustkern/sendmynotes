#!/bin/sh
set -eu

REPO_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/../../../../.." && pwd)
FIXTURE_DIR="$REPO_ROOT/docs/sprints/evidence/SPRINT-0020/fixture"
mkdir -p "$FIXTURE_DIR/dist"
cd "$REPO_ROOT"

node_modules/.bin/esbuild "$FIXTURE_DIR/src.jsx" --bundle --outfile="$FIXTURE_DIR/dist/fixture.js" --format=iife --platform=browser --target=es2020 --log-level=info
node_modules/.bin/tailwindcss -c "$FIXTURE_DIR/tailwind.config.cjs" -i "$FIXTURE_DIR/input.css" -o "$FIXTURE_DIR/dist/fixture.css" --minify
cp "$FIXTURE_DIR/index.html" "$FIXTURE_DIR/dist/index.html"
echo "Fixture built at $FIXTURE_DIR/dist"
