# Token tool

The single source of truth for UAL design tokens. Designers name and create tokens here; the tool pushes CSS to the code repo as pull requests, pulls developer changes back for review, and syncs approved tokens to Figma.

The product requirements are in [`docs/PRD.md`](docs/PRD.md).

## Status

| Phase | What | Status |
| --- | --- | --- |
| 1 | Foundations: data model, rules engine, references, dummy set | Done |
| 2 | Overview and creation (F1 to F4) | Done |
| 3 | Push to repo (F5) | Built and tested in demo mode; real GitHub needs the set-up in [`docs/SETUP.md`](docs/SETUP.md) |
| 4 | Pull and history (F6 to F8) | Next |
| 5 | Figma plugin (F9) | Not started |

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
| Push to code (`/push`) | The changes since the last push, a preview of every file and the pull request text, and the button that opens the pull request |
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
| `components/ui/` | shadcn/ui components, added with the shadcn command line tool |
| `data/dummy/` | Dummy token set and history. Moves to the token data repo in phase 3 |
| `fixtures/` | Test material: release branch CSS sample, the 6 drift cases, simulated component usage |
| `tests/` | Automated tests |
| `docs/` | PRD and reference files from the handoff |

## Data file format

Tokens are stored as W3C design tokens (DTCG) JSON, grouped as `primitive.<type>`, `semantic.<type>` and `component.<component>`. `$value` holds the light (default) value. Dark values, the token type and status sit under `$extensions["uk.ac.ual.tokens"]`. References are written as aliases such as `{primitive.color.orange-700}` and are never flattened.

## Provisional decisions

These are working assumptions until the open questions in the PRD are answered:

- Non-colour token names start with their type word (`spacing-`, `size-`, `font-size-`, `radius-`, `border-`, `shadow-` and so on).
- Component tokens have no `--color-` prefix in code.
- Semantic tokens may only use the categories `surface`, `content` and `line`. `icon` is for component tokens only.
- Figma paths are only defined for component tokens.
- Parent CSS path is `styles/colors.css`; component files are `components/[name]/[name].css`.
- Typography tokens are written Tailwind style: the font size is the main value, with `--line-height`, `--font-weight` and `--font-family` alongside.
