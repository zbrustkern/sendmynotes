# Isolated envelope preview fixture

This fixture mounts the real `EnvelopePreview` component in a small standalone page. It is not a Next.js route and does not load the checkout, draft store, payment code, or provider integrations. No address is sent anywhere; the text inputs update local React state only.

Build it from the repository root:

```sh
sh docs/sprints/evidence/SPRINT-0020/fixture/build.sh
```

Then start its allowlisted local static server:

```sh
node docs/sprints/evidence/SPRINT-0020/fixture/server.mjs
```

Open `http://127.0.0.1:3131/` in a browser. Use the scenario control for normal, long Unicode/apartment, unbroken, empty, partial, international, and deferred samples; choose any of the five supported handwriting styles; set address text size to 200% for the large-text check; edit the sender or recipient fields to see immediate changes.

Failure-state links use query parameters. The fixture server propagates the selected mode into the served JavaScript image URLs and CSS font URLs, and returns uncached 404 responses for those exact requests. The source component receives no test-only props:

- `http://127.0.0.1:3131/?fail=paper` tests the white paper fallback.
- `http://127.0.0.1:3131/?fail=stamp` tests the neutral postage fallback.
- `http://127.0.0.1:3131/?fail=fonts` makes all five local handwriting fonts fail so CSS fallback families appear.
- `http://127.0.0.1:3131/?fail=all` fails both images and all handwriting fonts.

The server binds only to `127.0.0.1:3131` and serves the fixture build, the two envelope assets, and the five approved local font files. It does not expose the rest of the repository. Compiled assets live under ignored `fixture/dist/`.
