# Token management tool

A web tool that is the single source of truth for UAL design tokens. Designers name and create tokens here; the tool pushes CSS to the code repo as pull requests, pulls developer changes back for review, and syncs approved tokens to Figma through a companion plugin.

The full product requirements are in `docs/PRD.md`. Read it before starting any phase.

## Owner and working style

- Owner: Jane Ngan, UX Designer (design systems) at UAL. She is a designer, not a developer: explain technical choices in plain terms and ask before big architectural decisions.
- Write in British English. No contractions and no em dashes in documentation or UI copy. Use numerals (12, not twelve).
- When Jane needs to decide something, offer clickable options with the recommended one first.

## Key decisions already made

- Master token data lives as JSON (W3C design tokens format) in a separate private GitHub repo. No other database.
- The tool itself is in its own GitHub repo, hosted on a service such as Vercel for the proof of concept.
- A third sandbox repo holds a copy of the CSS structure (parent file plus 1 or 2 component files) to test push and pull.
- All 3 repos sit on Jane's personal GitHub account for now and move to UAL's organisation later.
- Push writes CSS, not JSON, to the code repo, and opens a pull request with a generated changelog.
- Primitive and semantic tokens go in the parent CSS (Tailwind `@theme` for light, `.dark` for dark). Component-specific tokens go in the component's own CSS file, scoped to its class, inside a `/* tokens:start */ ... /* tokens:end */` block.
- A designer approves changes pulled back from the release branch. Declining opens a pull request restoring the tool's value.
- Figma sync uses a plugin, because the Figma Variables REST API is Enterprise only and UAL is on Figma Pro.

## Naming rules

- Primitives: `[colour]-[step]`, for example `orange-700`, `neutral-100`. In code: `--color-orange-700`.
- Semantic: `[category]-[variant]`, for example `surface-default`, `content-on-inverse`.
- Component-specific: `[component]-[category]-[role]-[state]`, for example `button-surface-primary-hover`.
- Categories: `surface`, `content`, `line`, `icon` (closed list). Role omitted when a component has only 1 variant. `-default` always written. No focus tokens.
- A component uses Base semantic tokens or a complete set of its own tokens, never a mix.
- Only `-default` component tokens are published in Figma; other states are hidden.
- References are always kept as references, never flattened to raw values.

## Reference files

- `docs/reference/token-namer.html`: the earlier token namer. Reuse its creation flow for F2 (chips, matrix, light and dark mapping, review checks, Figma path).
- `docs/reference/colors-sample.css`: a sample of the code's colour file. It is a sample only; Figma is the more up-to-date reference.
- `docs/reference/colour-page.png`: the design system Colour page (light-mode reference labels on it are known to be wrong).

## Build order

Follow the 5 phases in `docs/PRD.md`. Build and test each phase against a dummy token set before moving on. Do not import real UAL tokens until phase 4 passes.

## Project set-up

- Next.js and TypeScript, hosted on Vercel. Tests use Vitest: run `npm test`.
- The rules engine is in `src/lib/tokens/`. Naming rules settings are in `src/lib/tokens/rules.ts`.
- Until the token data repo exists, the dummy set lives in `data/dummy/tokens.json`.
- Provisional decisions are listed in `README.md`.
