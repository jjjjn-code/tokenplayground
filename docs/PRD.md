# Token management tool: product requirements (v1)

12 Nov 2026 · Jane Ngan

Live version: https://claude.ai/artifact/E9EpXkvXyFBH5Hra53s1qu

## Overview and problem

We are building a web tool that holds every UAL design token in one place, names new tokens by our rules, and syncs them to the code repo and to Figma. Today no single place can be trusted as the source of truth.

- **Figma** sets tokens up differently from how code needs them, so it cannot be the reference for developers.
- **The codebase** comes too late: by the time tokens reach code, the design work is far down the line, so it cannot guide designers while they work.
- **Storybook** does not hold design tokens at all.

Designers and developers have no shared place to look up the agreed tokens.

The result is drift. Designers struggle to name new tokens and write them into the system, newer designers apply primitives directly or miss tokens, and there is no history of decisions. Buying Tokens Studio Pro is not an option, so we will build a focused tool around our own conventions and file structure, borrowing the rules from the earlier token naming tool.

In practice this works much like Tokens Studio: one source of truth plus a companion Figma plugin for sync. The difference is that ours lives outside Figma, enforces our naming rules, and writes CSS in our own file structure.

## Goals, non-goals and success measures

v1 succeeds when a token can travel from idea to repo to Figma without being retyped, and every change along the way is logged.

**Goals**

1. One source of truth for every token: value, references, modes, status and history.
2. Every new token is named correctly first time, using the agreed convention.
3. Changes move between the tool and the repo through reviewable pull requests, in both directions.
4. Figma variables are updated from the tool, not by hand.

**Non-goals for v1**

- Twig and YAML component files. v1 writes CSS only.
- Editing component styles beyond token custom properties.
- A public documentation site. The tool is an internal workspace.

**Success measures**

- A token created in the tool reaches the repo and Figma with no manual retyping.
- No token created through the tool breaks the naming convention.
- Every change pulled back from the release branch has an accept or decline decision, with a reason and an author.
- Anyone can answer "when did this token change, and why?" from the tool alone.

## Users and roles

Adding tokens is a designer job; designers and developers both review.

| Role | Who | Can do |
| --- | --- | --- |
| Owner | Jane | Everything below, plus manage naming rules, categories and the dummy test set |
| Designer | UAL design team | Browse, create and edit tokens, push changes to the repo, review pulled changes, sync to Figma |
| Developer | UAL developers | Browse tokens, review pull requests and pulled changes, comment on decisions |

A designer approves each change pulled back from the release branch. The developer has already made the change, so one designer approval covers both sides.

## End-to-end workflow

A token change always starts and ends in the tool: designers create it there, developers can adjust it in the build, and the adjusted value only becomes official once someone accepts it back in the tool.

1. **Need in Figma.** A component needs new tokens.
2. **Create in the tool.** Named, referenced and reviewed.
3. **Pull request.** The tool writes CSS plus a changelog to the code repo.
4. **Developer build.** Values may be tuned, then merged to the release branch.
5. **Pull and review.** The tool reads the release branch; a designer accepts or declines each difference, and every decision is logged. Accepted changes update the tool.
6. **Sync to Figma.** The companion plugin updates Figma variables with approved tokens.

Designers then apply the synced variables to components in Figma, which closes the loop.

## Token model and naming rules

Tokens sit in 3 layers, and each layer has one home in code. The tool enforces the naming rules at creation, so an invalid name cannot be saved.

| Layer | Name in the tool | Name in code | Home in code | Published in Figma |
| --- | --- | --- | --- | --- |
| Primitive | `orange-700` | `--color-orange-700` | Parent CSS, in the Tailwind `@theme` block | Yes |
| Semantic (Base) | `surface-default`, `content-on-inverse` | `--color-surface-default` | Parent CSS: light values in `@theme`, dark values in `.dark` | Yes |
| Component-specific | `button-surface-primary-hover` | To confirm with developers | The component's own CSS, scoped to its class | Only `-default` states |

The sample code uses Tailwind (to confirm against the real repo): every colour token carries a `--color-` prefix, light mode is the default in `@theme`, and dark mode overrides values inside a `.dark` class. The tool stores names without the prefix and the push script adds it.

Semantic names follow `[category]-[variant]`, with categories `surface`, `content` and `line`. Variants in use: `default`, `elevated`, `inverse`, `primary`, `secondary`, `disabled`, `on-inverse`, `success`, `danger`, `success-on-inverse`, `danger-on-inverse`.

**Rules carried over from the token naming tool**

- Component-specific names follow `[component]-[category]-[role]-[state]`, always.
- Categories are a closed list: `surface`, `content`, `line`, `icon`.
- Roles in use are `primary` and `secondary`. The role segment is omitted when a component has only 1 variant.
- `-default` is always written. Focus uses the system default, so there are no focus tokens.
- States are picked from a multi-select of common states (default, hover, pressed and others), plus a custom field.
- A component uses Base semantic tokens throughout or a complete set of its own component-specific tokens, never a mix. The tool warns when a component breaks this.

**References.** A token can point to another token instead of holding a raw value, for example a component token pointing to a primitive. The tool stores and syncs the reference itself and shows the resolved value beside it. Sync never flattens a reference into a raw value.

**Token types.** v1 covers colour, spacing and sizing, typography, radius, border and shadow. Today only colour has a component-specific layer; naming rules for the other types still need defining.

**Dummy test set.** Before real tokens go in, we build and test every feature against a small dummy set that covers each layer, each token type, references and light and dark modes.

## v1 feature requirements

v1 has 10 features. "Must" features are needed for the round trip to work; "Should" features can follow inside v1.

| ID | Feature | Requirement | Priority |
| --- | --- | --- | --- |
| F1 | Token overview | A spreadsheet-style table of every token, 1 row per token, filterable by layer, type and component. Search by name or value. Each row shows the value or reference, resolved value, modes, status, last change and where it lives in code. | Must |
| F2 | Create and edit with naming help | A guided form: pick component, category, role and states, and the tool generates the names. It blocks invalid names and duplicates before saving. | Must |
| F3 | Token references | Set a token's value by picking another token. Show the resolved value and every token that depends on it. | Must |
| F4 | Context menu | On any token: copy name, view references, view history, edit, deprecate. | Should |
| F5 | Push to repo | Gather unpushed changes into a change set and the author writes a summary. At push time, a script converts the new and changed tokens into CSS, the format developers use directly, writes it to the right files and opens a pull request with a generated changelog. | Must |
| F6 | Pull and discrepancy review | Read token CSS from the release branch and compare it with the tool. List each difference (changed value, new token, removed token, reference replaced by a raw value). Accept or decline each one, with a reason. | Must |
| F7 | Version history and logs | Per token: a timeline of created, edited, pushed (with PR link), pulled, accepted or declined, by whom and why. Restore any earlier version. | Must |
| F8 | Decline follow-up | Declining a pulled change opens a pull request that restores the tool's value in the CSS, with the designer's reason in its description. | Should |
| F9 | Figma sync | A companion Figma plugin pulls approved tokens into Figma variables. See the Figma sync section. | Must |
| F10 | Token usage | For each token, show how many components use it and which ones, found by scanning the component CSS in the repo. Flag tokens used by 0 components so they can be deprecated or removed. Counting usage in Figma through the plugin can follow later. | Should |

**Carried over from the token namer.** F2 reuses the flow of the earlier token namer (`reference/token-namer.html`), which already works:

1. Type the component name. Spaces and capitals are stripped, so "Icon button" becomes `iconbutton`, and the user is told when this happens.
2. Pick categories, roles and states as chips. `default` is locked on, and custom roles and states can be added.
3. A matrix shows every category, role and state combination, all ticked by default. Untick the ones the component does not have.
4. Map each token to a primitive for light and dark, with a shortcut to copy the light mapping into dark.
5. Review before saving: tokens missing a mode, tokens using the same primitive in both modes, duplicate names, names with too few segments, a warning that omitting the role means renaming every token if a second variant is added later, and a count of tokens created, published and hidden.
6. The Figma variable path is generated from the name: `[group]/[Component]/[Category]/[category-role-state]`, for example `Interactive/Button/Surface/surface-primary-hover`.

The namer's JSON, CSS and ticket exports are replaced by push (F5), which writes the CSS and the pull request description.

## Repo contract

Primitive and semantic tokens go into the parent CSS; component-specific tokens go into the component's own CSS file, scoped to the component class, so they override the parent only inside that component. v1 writes CSS only; Twig and YAML are untouched.

**Generated block (proposal).** The tool writes tokens inside a marked block at the top of each file and never touches anything outside it. Developers may still edit values inside the block; the next pull picks the change up as a discrepancy.

```css
/* tokens:start (managed by the token tool) */
.button {
  --button-surface-primary-default: var(--color-orange-700);
  --button-surface-primary-hover: var(--color-orange-700-aa);
}
.dark .button {
  --button-surface-primary-default: var(--color-orange-400);
  --button-surface-primary-hover: var(--color-orange-700);
}
/* tokens:end */
```

**Pull request changelog.** Every push opens a pull request whose description follows one format:

```markdown
## Token update: button hover states

Summary (written by the author): new hover tokens for the primary button.

| Change | Token | Before | After | File |
| --- | --- | --- | --- | --- |
| Added | button-surface-primary-hover | none | orange-700-aa | components/button/button.css |
| Changed | red-700 | #FF3737 | #A80000 | parent CSS |
```

To confirm with developers: the exact path of the parent CSS and the component folders, branch naming, and who merges.

## Where tokens live

Decision: the tool's master copy is stored as data files in a dedicated GitHub repo, separate from the code repo. The tool reads it to fill the spreadsheet and writes to it when someone saves, so no other database is needed.

| | Token data repo (new) | Code repo (existing) |
| --- | --- | --- |
| Holds | The master token data, decision logs and history | The CSS developers build with |
| Written by | The tool, when someone saves | The push script, through a pull request |
| Read by | The tool only | Developers, and the tool when it pulls changes back |
| Format | JSON (W3C design tokens format) | CSS custom properties |

**Why this works.** Git keeps version history for free, people can sign in with their GitHub accounts, and developers never see the data files.

**Watch-outs.** Each save is a commit, so the tool holds edits until the user saves a batch. If 2 people edit the same token at once, the second save must show a clear "someone else changed this" message.

**Hosting.** v1 runs on a hosted service (for example Vercel) so we can see how it works. Moving to UAL internal hosting is a later decision.

## Figma sync

Figma sync runs through a companion plugin, because on our Pro plan the Figma Variables REST API is not available: it is limited to full seats in Enterprise organisations ([Figma docs](https://developers.figma.com/docs/rest-api/variables)). The plugin API can create and update variables on any plan.

**Plugin flow**

1. A designer opens the plugin in the target Figma file.
2. The plugin fetches the latest approved token set from the tool.
3. It shows what will be added, changed or removed against the file's current variables.
4. The designer confirms; the plugin creates or updates variables in the right collections and groups, keeps references as variable aliases, and sets light and dark modes.
5. Non-default state tokens are hidden from publishing, so designers only see `-default` tokens.
6. The plugin reports the sync back to the tool, which logs it on each token.

To confirm: which Figma files and collections the plugin writes to, and how Figma groups map to token names.

## Phasing and build order

We build in 5 phases, each tested against the dummy token set before the next starts. Real UAL tokens are imported only after phase 4 passes.

1. **Foundations.** Data model, the 3 layers, references, modes and the naming rules engine. Create the dummy token set.
2. **Overview and creation (F1 to F4).** Browse, search, create and edit tokens with naming help. Export CSS locally to check the output.
3. **Push to repo (F5).** Generate CSS into the parent and component files, open a pull request with the changelog. Test on the sandbox repo first.
4. **Pull and history (F6 to F8).** Read CSS back from the release branch, review discrepancies, log decisions, restore versions.
5. **Figma plugin (F9).** Sync approved tokens into Figma variables, starting with a test Figma file.

**Set-up.** We build in GitHub from day 1, on Jane's personal account for the proof of concept, using 3 private repos:

| Repo | Holds |
| --- | --- |
| Tool | The web app itself, deployed to a hosted service |
| Token data | The master token data, decision logs and history |
| Sandbox code | A copy of the CSS structure (parent file plus 1 or 2 component files) to test push and pull safely |

The repos move to UAL's GitHub organisation once the proof of concept works, and the sandbox is swapped for the real code repo.

## Drift examples for the test set

Comparing the sample `colors.css` (`reference/colors-sample.css`) with the Colour page (last updated 30 Jun 2026) shows 6 mismatches. The CSS is a sample and Figma is the more up-to-date reference, but these are exactly the kinds of drift the tool must catch, so they go into the dummy set as test cases for the pull and discrepancy review (F6).

**01. `red-700` has the wrong value in code.** Code sets `#FF3737`, the same as `red-400`; the design system says `#A80000`.

**02. `orange-700-aa` is missing from code.** It exists as a primitive in the design system but has no `--color-orange-700-aa`.

**03. 3 line tokens are missing from code.** `line-inverse`, `line-disabled` and `line-danger` are in the design system but not in the CSS.

**04. `line-default` breaks the code pattern.** It is `--line-default` instead of `--color-line-default`.

**05. 2 tokens exist only in code.** `--color-hover` and `--color-active` are not in the design system and do not follow the `[category]-[variant]` pattern.

**06. The Colour page shows the wrong references in light mode.** The light column repeats the dark references. Swatches are right; labels are wrong.

## Open questions

- [ ] Token data repo: name, who owns it, and who has write access.
- [ ] Hover and active tokens in code (`--color-hover`, `--color-active`): rename to the semantic pattern, or retire.
- [ ] Naming rules for spacing, sizing, typography, radius, border and shadow, and whether any of them get a component-specific layer.
- [ ] Non-colour tokens: where spacing, typography, radius, border and shadow live in code today.
- [ ] Component tokens in code: confirm with developers that dark values go under `.dark .button`, and whether component tokens take the `--color-` prefix.
- [ ] Colour page: fix the light-mode reference labels (drift item 06).
- [ ] Decline pull requests: who reviews and merges the pull request that restores a declined value.
- [ ] Repo details: parent CSS path, component folder structure, branch naming, who merges.
- [ ] Figma: which files and collections the plugin writes to.
- [ ] Internal hosting: when and how to move from the hosted service to UAL infrastructure.
- [ ] Sketch note "during the sync, cannot just add or replace": confirm it means references must be kept, not flattened.
- [ ] Token structure: can a role or state ever be more than 1 word (for example `on-hover`)? Today each part must be 1 word. (From the message review, N14.)
- [ ] Focus tokens: today there are none. If they arrive later, they would sit in the semantic layer, not the component layer. (N15.)
- [ ] Spacing tokens: spacing works differently from colour. Space primitives feed a semantic layer with min and max (fluid) values instead of light and dark; people make customised pairs of spacing tokens; grid tokens exist too. Define the naming and data rules before building spacing, as it changes the Light and Dark columns for those tokens. (N16.)
