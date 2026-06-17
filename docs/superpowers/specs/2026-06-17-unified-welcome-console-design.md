# Unified Welcome Console Design

## Goal

Merge the existing landing/welcome experience with the console so `/app` no longer feels like a separate destination after the homepage. The standalone `/` homepage remains available, but `/app` gets an integrated welcome layer before the user starts working.

## Approved Approach

Use approach A: an in-console welcome layer.

- When the console renders with `welcomeVisible: true`, show a full-shell welcome layer above the app chrome.
- The layer reuses the current warm wood and glass design language.
- The primary action hides the layer and focuses the main input.
- The top-left Lysandra brand control reopens the layer.
- Existing `/` landing page and `/app` routing stay intact.
- No conversation, IndexedDB, model, API, attachment, or mode state is reset.

## Component Changes

- `src/state.js`: add runtime-only `welcomeVisible`.
- `src/components/render.js`: render the welcome layer and expose brand reopen action.
- `src/main.js`: bind close/reopen actions.
- `src/styles.css`: add lightweight overlay styles and motion.
- `tests/landing.test.js`: cover the integrated console welcome markup.

## Verification

- Unit tests cover the new markup and existing landing route.
- Browser preview verifies `/app` shows the welcome layer and the primary action reveals the console.
- Obsidian sync is required before completion.
