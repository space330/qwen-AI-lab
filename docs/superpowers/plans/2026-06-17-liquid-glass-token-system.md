# Liquid Glass Token System Upgrade

## Summary

Unify Qwen Agent Lab's scattered liquid-glass styling into a token-driven visual system. The goal is clearer glass hierarchy, stronger translucency, and lower rendering cost by reducing repeated large-area blur.

## Scope

- Add global glass tokens for shell, rail, panel, card, control, floating surface, overlay, borders, shadows, and blur levels.
- Update the landing page, integrated welcome layer, console shell, topbar, sidebar, panels, message cards, input dock, drawers, and export dock to use those tokens.
- Keep chart rendering surfaces transparent and avoid adding blur inside scroll-heavy message/chart areas.
- Keep application behavior, API behavior, routing, and storage logic unchanged.

## Implementation Steps

1. Add a CSS contract test that verifies the required glass tokens and key selectors.
2. Extend `src/styles.css` with the unified token set.
3. Replace major hard-coded glass backgrounds, borders, shadows, and large blur values with token references.
4. Reduce repeated expensive `backdrop-filter` use on nested regions and floating panels.
5. Update project notes and Obsidian records because visual system changes are engineering changes.

## Verification

- Run the new liquid-glass CSS contract test and confirm it fails before implementation.
- Run the same test after implementation and confirm it passes.
- Run the full test suite.
- Run `npm audit --omit=dev`.
- Run `git diff --check`.
- Open `http://127.0.0.1:5173/app` in the in-app browser and verify the welcome layer and console remain usable.

## Notes

- This plan does not introduce SwiftUI or macOS APIs. The referenced liquid-glass guidance is adapted as visual-system principles for the web app.
- No Git commit is included unless explicitly requested.
