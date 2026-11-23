# Token Library

The single source of truth for UAL design tokens. Designers name and create tokens here; the tool pushes CSS to the code repo as pull requests, pulls developer changes back for review, and syncs approved tokens to Figma.

The product requirements are in [`docs/PRD.md`](docs/PRD.md).

## Status

| Phase | What | Status |
| --- | --- | --- |
| 1 | Foundations: data model, rules engine, references, dummy set | Done |
| 2 | Overview and creation (F1 to F4) | Done |
| 3 | Push to repo (F5) | Done, tested live on the sandbox |
| 4 | Pull and history (F6 to F8) | Done, deployed |
| 5 | Figma plugin (F9) | Built and tested with a fake Figma. Next: test in a real Figma file |
| F12 | Component scan | Steps 1 to 3 of 4 done: scan logic, the Scan component tab (6 screens) and the endpoint in the tool, tested with a fake Figma and in demo mode. Next: test on the Control frame in the UAL UI Sandbox file |

## Running it

```bash
npm install
```

```bash
npm test
```

```bash
npm run dev
```

To try saving and pushing with a fake GitHub inside the tool:

```bash
npm run demo
```

To connect real GitHub, follow [`docs/SETUP.md`](docs/SETUP.md).

## Look and feel

The interface uses [shadcn/ui](https://ui.shadcn.com) components on Tailwind CSS, with the neutral theme and a light and dark mode. The overview works like a spreadsheet, and the way tokens are organised follows Tokens Studio: a sidebar of token sets, modes as columns, references shown as pills.

## Screens

| Page | What it does |
| --- | --- |
| Overview (`/`) | A spreadsheet of tokens. Pick a token set in the sidebar, click a value to change it, use arrow keys to move between cells, right-click a row for actions, tick rows for bulk actions, click a name for details |
| Create (`/create`) | Component tokens using the token namer flow, with choices on the left and a live preview on the right. Single primitive or semantic tokens are created from the New button |
| Send to code (`/push`) | The changes since the last push, a preview of every file and the pull request text, and the button that opens the pull request |
| Review code changes (`/pull`) | Compares the release branch with the saved tokens and lists every difference. Accept (the code is right) or decline (the tool is right), with a reason. Declines open a pull request that puts the tool's values back |
| Export CSS (`/export`) | Preview, copy or download the CSS that push will write, and the token data as JSON |

The tool runs in 1 of 3 modes:

- **GitHub**: once set up, you sign in with GitHub. Tokens load from `ual-tokens-data`; edits are held as unsaved changes until you press Save, which writes 1 commit. If someone else saved first, your edits are reapplied on top of theirs and any token you both changed is listed.
- **Demo**: the same, with a fake GitHub inside the tool (`npm run demo`).
- **Local**: no GitHub; edits stay in your browser. "Reset" at the bottom of the sidebar reloads the dummy set.

## Where things are

| Path | Holds |
| --- | --- |
| `src/lib/tokens/types.ts` | The data model: layers, token types, modes, references, history |
| `src/lib/tokens/rules.ts` | Naming rules settings: categories, variants, roles, states |
| `src/lib/tokens/naming.ts` | Builds, reads and checks token names; code names; Figma paths |
| `src/lib/tokens/references.ts` | Resolves references and finds dependent tokens |
| `src/lib/tokens/validate.ts` | Checks a whole set, and the check that runs before saving |
| `src/lib/tokens/dtcg.ts` | Reads and writes the W3C design tokens JSON files |
| `src/lib/tokens/history.ts` | Version history and decision log |
| `src/lib/tokens/css.ts` | Turns tokens into CSS for the parent and component files |
| `src/lib/tokens/repo.ts` | Where each token lives in the code repo (provisional paths) |
| `app/` | The screens. Shared pieces are in `app/_components/`; the working copy is in `app/_lib/store.tsx` |
| `src/lib/git/` | Saving to the token data repo and pushing to the code repo, with a fake GitHub for tests and demo mode |
| `src/lib/server/` and `app/api/` | Sign-in with the GitHub App and the endpoints the screens call |
| `src/lib/figma/` | Figma sync: tokens to variable specs, the compare plan, and writing variables. Component scan: `scan.ts` drafts the tokens, `scan-figma.ts` reads a component set and writes the result |
| `figma-plugin/` | The Figma plugin, with 2 tabs: Sync from tool (`ui.ts`) and Scan component (`scan-ui.ts`). Build with `npm run plugin:build`; this also makes `public/token-library-figma-plugin.zip` |
| `src/lib/git/scan.ts` and `app/api/figma/scan/` | Token Library receives the tokens a component scan made, as 1 commit. Sending the same scan again changes nothing |
| `components/ui/` | shadcn/ui components, added with the shadcn command line tool |
| `data/dummy/` | Dummy token set and history. Moves to the token data repo in phase 3 |
| `fixtures/` | Test material: release branch CSS sample, the 6 drift cases, simulated component usage |
| `tests/` | Automated tests |
| `docs/` | PRD and reference files from the handoff |

## Data file format

Tokens are stored as W3C design tokens (DTCG) JSON, grouped as `primitive.<type>`, `semantic.<type>` and `component.<component>`. `$value` holds the light (default) value. Dark values, the token type and status sit under `$extensions["uk.ac.ual.tokens"]`. References are written as aliases such as `{primitive.color.orange-700}` and are never flattened.

## Provisional decisions

These are working assumptions until the open questions in the PRD are answered:

- Non-colour token names start with a word from a list per layer, following the groups in the Figma file. Primitives: `spacing-`, `grid-`, `font-family-`, `font-size-`, `font-weight-`, `duration-`, `ease-` and so on. Semantic: `space-`, `grid-`, `step-`, `paragraph-spacing-`. The lists are `NON_COLOUR_PREFIXES` in `src/lib/tokens/rules.ts`.
- Each token set has a column set (`COLUMN_SETS` in `rules.ts`). Primitives always have 1 Value, Motion included. Semantic motion tokens, if added, have Default and Reduced motion. Semantic colour, border and shadow have Light and Dark. Semantic spacing, sizing and typography are fluid, with Min and Max. Semantic radius has 1 Value.
- Fluid tokens are written to CSS as 1 `clamp()` value, worked out as the Utopia calculator does. The screen widths are 400 and 1600 pixels with a 16 pixel root font size (`FLUID_VIEWPORT` in `rules.ts`). Change them to the UAL grid widths.
- A fluid `clamp()` is the 1 place where the CSS holds worked-out numbers instead of `var()`. A comment on the same line names the min and max tokens. The token data keeps the references.
- Sizes are plain numbers, as in Figma, and are written in px in CSS (`16` becomes `16px`). Font weights stay plain numbers.
- The Motion collection in Figma has a reduced-motion mode. Motion primitives write only to its first mode, so the plugin leaves the reduced-motion mode as it is.
- Reduced motion values (semantic motion only) go in `@media (prefers-reduced-motion: reduce) { :root { ... } }`, and only where they differ from the default.
- A primitive may refer to another primitive (for example the Figma space base, which follows `spacing-max-l`). Other layers only refer downwards.
- Fluid typography may refer to spacing sizes (for example paragraph spacing).
- Component tokens have no `--color-` prefix in code.
- Semantic tokens may only use the categories `surface`, `content` and `line`. `icon` is for component tokens only.
- Each token can keep its Figma variable name (`figma` in the data, for example `spacing/max/3xs`). The table groups tokens by these Figma folders. Without a stored name, the plugin works one out (see below).
- New tokens start as active. Change the status in the Status column of the sheet. Draft and active change straight away; deprecating needs a reason.
- Review code changes compares only active tokens. Drafts and deprecated tokens are left out.
- Figma collections match the UAL UI Kit file: Colour primitives, Type primitives, Space primitives, Motion, Colour tokens (with component tokens under Interactive) and Fluid tokens. Radius, border and shadow, which the file does not have yet, go in Other primitives and Other tokens. The Figma UI Kit collection is left alone.
- Figma variable names without a stored name: colour primitives at the top level (`orange-700`), semantic colours under Base (`Base/Surface/surface-default`), component tokens by their Figma path, other tokens under their type.
- Modes in Figma are matched without case, so `dark`, `Dark` and `reduced-motion`, `Reduced motion` are the same mode. A collection with 1 mode uses that mode whatever it is called.
- The plugin never changes a variable's type, because that would delete it and unbind every layer that uses it. It lists the variable instead.
- Tokens with several parts (border and shadow) are not synced to Figma, because Figma variables hold 1 value only. They could become Figma styles later.
- The plugin network address is `https://tokenplayground-drab.vercel.app`, set in `figma-plugin/manifest.json`. Change it there and in `figma-plugin/src/ui.ts` if the address changes.
- Parent CSS path is `styles/colors.css`; component files are `components/[name]/[name].css`.
- Typography tokens with several parts (older data) are still written Tailwind style: the font size is the main value, with `--line-height`, `--font-weight` and `--font-family` alongside. New semantic typography tokens are fluid sizes.
- Component scan: a coloured layer whose name is not `surface`, `line`, `content` or `icon` is listed as a warning and left unchanged. It does not block the scan.
- Component scan: a raw colour is matched to the primitive with exactly the same colour. With no match, the designer chooses the light and dark primitives.
- Component scan: the role comes from the 1 variant property apart from `State` that has more than 1 value. With 2 or more such properties, the scan stops.
- Component scan: when 2 layers with the same name in 1 state have different colours, the scan stops, because they would share 1 token.
- Component scan: a state that looks the same as the default reuses the `-default` token. A part bound to a primitive counts as that primitive in both themes when compared.
- The dummy set has a `transparent` primitive (`#00000000`), as in the handoff.
- Component scan: Token Library refuses scanned tokens that it already has with different values, and tells the designer which ones. It does not overwrite them.
- Component scan: when Token Library does not receive the tokens, the plugin keeps them on that computer and offers Send again each time it opens, until they arrive. It also offers them as a JSON download. Token Library has no import button for that JSON yet.
- Component scan: "the same primitive in light and dark" is checked only where the designer chose the value. Tokens copied from a semantic token keep the semantic token's values without a note.
- Component scan: transparent parts are not flagged "shows the same in both themes".
