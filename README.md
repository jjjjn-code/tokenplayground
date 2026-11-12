# Token tool

The single source of truth for UAL design tokens. Designers name and create tokens here; the tool pushes CSS to the code repo as pull requests, pulls developer changes back for review, and syncs approved tokens to Figma.

The product requirements are in [`docs/PRD.md`](docs/PRD.md).

## Status

| Phase | What | Status |
| --- | --- | --- |
| 1 | Foundations: data model, rules engine, references, dummy set | Done |
| 2 | Overview and creation (F1 to F4) | Next |
| 3 | Push to repo (F5) | Not started |
| 4 | Pull and history (F6 to F8) | Not started |
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
