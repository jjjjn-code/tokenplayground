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

v1 has 12 features. "Must" features are needed for the round trip to work; "Should" features can follow inside v1.

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
| F11 | Connect and sync | Bring tokens in from Figma and code, and settle every difference, when the tool is connected to a new source: the first real day, the switch from the sandbox to the real code repo, and the move to UAL's GitHub organisation. See the Connect and sync section. | Must before real tokens |
| F12 | Component scan | In the Figma plugin, scan a finished component set and its dark duplicate. If any part uses a primitive or a raw value, draft a complete set of component tokens for the whole component. The designer accepts the names, publishes the variables, applies them to the layers and sends them to the tool, as separate steps. See the Component scan section. | Should |

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
4. The designer confirms; the plugin creates or updates variables in the right collections and groups, keeps references as variable aliases, and sets each collection's modes (Value; Light and Dark; Min and Max; Default and Reduced motion).
5. Non-default state tokens are hidden from publishing, so designers only see `-default` tokens.
6. The plugin reports the sync back to the tool, which logs it on each token.

To confirm: which Figma files and collections the plugin writes to, and how Figma groups map to token names.

## Connect and sync (F11)

**Why.** The tool is connected to a new source at least 3 times: on the first real day (the tool is empty), when the sandbox code repo is swapped for the real one, and when the repos move to UAL's GitHub organisation. Each time, everything must be compared, not only what changed since the last push. Day-to-day review (F6) stays as it is; it is a small version of the same job.

It is not a multi-organisation product: there are no sign-ups or billing. It is 1 guided flow that can be run again whenever a source changes.

**When it runs**

| Moment | Tool | Figma | Code |
| --- | --- | --- | --- |
| First real day | Empty | Full set | Full set |
| Sandbox to real code repo | Full set | Unchanged | New, compare everything |
| Move to UAL's GitHub | Moves with its history | Unchanged | New address, compare everything |

**Flow**

1. **Choose sources.** Figma, code, or both. The code repo and branch come from the tool's settings. Figma tokens come from the plugin, through a new Send to Token Library button that sends every variable in the chosen collections.
2. **Scan.** The tool reads every source into 1 list. For each token it works out the layer, type and column set:
   - From Figma: the collection gives the layer and column set (for example Fluid tokens gives semantic, Min and Max), the variable name gives the Figma path, aliases give references.
   - From code: the CSS block gives the mode (`@theme`, `.dark`, the reduced motion media query, a component class), the name prefix gives the type, `var()` gives a reference.
3. **Sort into piles.** Each pile has an "accept all" action and can be opened to decide 1 by 1:
   - Matches everywhere.
   - New: in Figma or code, not in the tool.
   - Different between sources: pick the right one.
   - Breaks the naming rules: the tool suggests a corrected name.
   - Only in 1 place: add it, or mark it to be removed.
4. **Link what code cannot tell us.** A fluid `clamp()` in code holds numbers, not references. When Figma has the same token, its Min and Max aliases are used. When it does not, the tool suggests the min and max primitives whose sizes match, for a person to confirm.
5. **Save.** All decisions are saved in 1 commit with a summary. If code must change (renames, missing tokens, declined values), 1 pull request with a changelog goes to developers. If Figma must change, the next plugin sync does it. The result becomes the new baseline, so F6 from then on shows only real changes.

**What it reuses.** Reading and comparing CSS (F6), reading Figma variables (F9 plugin), saving to GitHub and opening pull requests (F5, F8), the naming rules engine and the column sets.

**What is new**

| Part | Notes |
| --- | --- |
| Figma import | A button in the plugin and an endpoint in the tool that receives the variables, protected by the existing sync key |
| Type and column guessing | Rules that turn a Figma collection or a CSS name into a layer, type and column set |
| 3-way comparison | Tool, Figma and code at the same time, instead of tool and code only. The largest piece |
| Sync screen | The piles, accept all, rename suggestions and the clamp() linking step |
| Connection settings | A page that shows, and lets an owner change, the connected repos and branch. Today these are set where the tool is deployed |

**Build steps.** Each step is useful and tested on its own before the next:

1. Figma import: fill an empty tool from the plugin. Test with the UAL UI Kit file.
2. Code import: fill an empty tool from the code repo, using the F6 engine with accept all and type guessing.
3. Full sync: the 3-way screen, the piles and the save step.

**Done when** an empty tool can be filled from the UAL UI Kit file and the code repo in 1 sitting, every difference has a recorded decision, and an F6 review straight afterwards finds nothing.

## Component scan (F12)

**Why.** A component uses Base semantic tokens or a complete set of its own tokens, never a mix. While building a component, a designer often finds that 1 part cannot use a semantic token in both themes. For example, the control's hover surface is `neutral-200` and its pressed surface is `neutral-600`, and no semantic token covers those. That 1 part switches the whole component to component tokens, and parts that were fine are renamed too: `base-line-default` becomes `control-line-default`, with the same colour. Today this means leaving Figma and creating the tokens in the tool by hand. The scan does it in the canvas, where the component is built.

Agreed on 23 Nov 2026 (handoff note from Jane Ngan). Changed on 24 Nov 2026 after mapping the workflow (`docs/workflow-map.html`): the dark colours come from a duplicate dark frame, and accepting names, publishing and applying are separate steps.

**Where it lives.** The same Figma plugin as sync (F9): 1 plugin, 2 tabs, "Sync from tool" and "Scan component".

**What the plugin reads**

| Input | Rule |
| --- | --- |
| Selection | The component set and its dark duplicate, selected together. The component set has a `State` variant property (for example `State=Hover`). The dark duplicate always has the same layers, with only the colours changed. No variables need to exist first. |
| Layers | In every variant, the variant frame's own fill is `surface` and its stroke is `line`. Layers named `surface`, `line`, `content` or `icon` are also read, and the layer name gives the category. Every coloured layer inside an instance (for example the arrow inside a library icon) is `content`. Masks are not read, because Figma does not draw them. Any other coloured layer is listed as unknown, for the designer to rename. Decided 23 Nov 2026 after reading the real control. |
| Where it runs | In the file that owns the `Colour tokens` collection (the UAL UI Kit, or a copy of it for testing). A plugin cannot add variables to a library collection from a file that only uses the library, so in any other file the scan stops and says so. Decided 23 Nov 2026. |
| State and role | State from the `State` variant property; role from the other variant property, when there is 1. The option after the `=` is matched against the tool's naming rules (`rules.ts`). Disabled is a state, like hover and pressed. An option the rules do not know is flagged as a possible new state, for the designer to accept or rename. |
| Light and dark | Light from the component set, dark from the matching layer in the dark duplicate. Layers are paired by their position in each variant. A semantic binding resolves in light mode on the light side and dark mode on the dark side, whatever mode the frame is set to. A layer with no match in the other frame is flagged, and the designer pairs it or chooses its dark value. |

**When it acts.** If every part is bound to a semantic token, the plugin says the component is fine and stops. If any part is bound to a primitive or a raw value, it drafts a complete set of component tokens for the whole component.

**Drafting rules**

1. Every drafted token is named `[component]-[category]-[role]-[state]`, for example `control-surface-hover`. The role is left out when the component has only 1 variant.
2. Every component token points to a primitive, never to a semantic. A part that used a semantic gets the primitive behind that semantic in each mode. For example, `control-line-default` points to whatever `base-line-default` points to, in each mode.
3. If a state has the same value as the default in both modes, no new token is made and the layer is bound to the `-default` token.
4. Primitives have no modes, so the dark value of a primitive part comes from the dark duplicate. Only when a layer has no match does the designer choose the dark value before anything is created. The same primitive in both modes is only a warning, because some tokens rightly share 1 (the Promo CTA bar hover uses `orange-700` in both).
5. `transparent` is a primitive (`#000000` at 0% opacity), so transparent parts never need a raw value.
6. Icons inside a control use the `content` category. The control's arrow is `control-content-default`, not `icon`.
7. Variables go in the `Colour tokens` collection, group `Interactive / [Component] / [Category]`, for example `Interactive / Control / Surface`. The Figma variable name drops the component prefix, because the group carries it (`surface-hover`). The tool and the code keep the full name (`control-surface-hover`).
8. Only `-default` tokens are published. All other states are hidden from publishing.

**Flow**

1. **Select.** Select the component set and its dark duplicate. The plugin shows the component's name, the number of variants and the number of coloured layers, and says whether every layer has a match in the other frame.
2. **Scan.** It reads every named layer in every variant, light from the component set and dark from the duplicate. It shows each layer's current binding (semantic, primitive or raw value) with a colour swatch and the value in light and dark. Layers with no match are flagged.
3. **Changes.** A before and after list for every layer: the current binding, then the component token it will be bound to, both with a colour swatch and the token value. Layers that reuse a `-default` token are shown too.
4. **Accept names.** The drafted tokens, grouped by category (`Interactive / Control / Surface`, `Line`, `Content`). Each shows its Figma name, full name, published or hidden, source, and a light and dark primitive picker, filled in from the scan. Flagged tokens need a value before you can go on. The checks from F2 run here: naming rules, duplicates, missing modes, the same primitive in both modes, the role warning and possible new states. Button: Accept names. Nothing is created before this step.
5. **Save and publish.** A summary, for example: "This creates 8 variables in Colour tokens / Interactive / Control and hides 5 from publishing." Button: Save and publish. The variables are created; no layer changes yet.
6. **Apply to layers.** The before and after list from step 3 again, now with the real variables. Button: Apply. Every layer in the component set is bound to its component token. The dark duplicate is bound to the same tokens and set to Dark mode, so it looks the same as before; the designer can delete it afterwards.
7. **Send to the tool.** Button: Send to Token Library. The tokens arrive as drafts marked "new from Figma", with the component name and the designer's name.
8. **Done.** The plugin shows the new tokens as they appear in the tool (status: unpushed) and the CSS that push (F5) will write. A reminder says to publish the library from the Assets panel. In the tool, any designer reviews the new tokens before pushing them to code.

**Creating and sending.** Creating the variables, binding the layers and sending the tokens to the tool are 3 separate steps, so the designer can check each one. If the plugin is closed between steps, the next scan finds the variables already made and carries on from the step that is left. The tool receives the tokens through a new endpoint, protected by the existing sync key, and saves them to the token data repo as 1 commit.

**What the plugin does not do.** The Figma plugin API cannot publish a library. After the scan, the designer publishes from the Assets panel as usual.

**If sending fails.** The Figma changes stay. The plugin shows the failure with a Retry button and offers the tokens as a JSON download in the tool's format (W3C design tokens), so Figma and the tool never drift without anyone knowing.

**Worked example: the control.** 4 states, 3 parts, 8 drafted tokens. Sample values only: read the real ones from the Figma file.

| State | surface (fill) | line (stroke) | content (arrow) |
| --- | --- | --- | --- |
| Default | `transparent` (primitive) | `line-default` (semantic) | `content-default` (semantic) |
| Hover | `neutral-200` (primitive) | `line-default` (semantic) | `content-default` (semantic) |
| Pressed | `neutral-600` (primitive) | `line-default` (semantic) | `content-on-inverse` (semantic) |
| Disabled | `transparent` (primitive) | `line-disabled` (semantic) | `neutral-400` (primitive) |

| Figma group | Figma name | Full name | Published | Note |
| --- | --- | --- | --- | --- |
| Surface | `surface-default` | `control-surface-default` | Yes | `transparent` in both |
| Surface | `surface-hover` | `control-surface-hover` | No | Light `neutral-200`; dark from the dark duplicate |
| Surface | `surface-pressed` | `control-surface-pressed` | No | Light `neutral-600`; dark from the dark duplicate |
| Line | `line-default` | `control-line-default` | Yes | From `line-default` |
| Line | `line-disabled` | `control-line-disabled` | No | From `line-disabled` |
| Content | `content-default` | `control-content-default` | Yes | From `content-default` |
| Content | `content-pressed` | `control-content-pressed` | No | From `content-on-inverse` |
| Content | `content-disabled` | `control-content-disabled` | No | Light `neutral-400`; dark from the dark duplicate |

Reused, not created: the hover line, pressed line, hover content and disabled surface all use the matching `-default` token.

**Build steps**

1. Scan logic in `src/lib/figma/`, tested against the worked example with a fake Figma.
2. The Scan component tab in the plugin, with all 6 screens.
3. The endpoint in the tool that receives the drafted tokens, with retry and the JSON fallback.
4. Test on the Control frame in the UAL UI Sandbox file: read only first, write only after Jane agrees.
5. Done 24 Nov 2026 (tested with a fake Figma, not yet in the sandbox file): read dark values from the dark duplicate, flag variant options the rules do not know, and split Create and sync into Save and publish, Apply to layers, and Send to the tool.
6. Test run on 2 or 3 more real components to find edge cases, such as interactive states not yet in the rules.

**Done when** scanning the control and its dark duplicate in the sandbox file creates the 8 variables in the right group with no dark value picked by hand, rebinds every layer, leaves the dark theme correct for hover and pressed, and the 8 tokens appear in the tool as unpushed.

## Phasing and build order

We build in 5 phases, each tested against the dummy token set before the next starts. Real UAL tokens are imported only after phase 4 passes.

1. **Foundations.** Data model, the 3 layers, references, modes and the naming rules engine. Create the dummy token set.
2. **Overview and creation (F1 to F4).** Browse, search, create and edit tokens with naming help. Export CSS locally to check the output.
3. **Push to repo (F5).** Generate CSS into the parent and component files, open a pull request with the changelog. Test on the sandbox repo first.
4. **Pull and history (F6 to F8).** Read CSS back from the release branch, review discrepancies, log decisions, restore versions.
5. **Figma plugin (F9).** Sync approved tokens into Figma variables, starting with a test Figma file.
6. **Connect and sync (F11).** Figma import, then code import, then the full sync screen. Needed before the real UAL tokens go in.

**Component scan (F12)** is built ahead of phase 6, decided on 23 Nov 2026, because it is needed while components are being built in Figma. It is tested against the dummy set and a fake Figma first, then on the UAL UI Sandbox file. It does not change phases 1 to 6.

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
- [ ] Fluid tokens: the min and max screen widths of the UAL grid (provisional: 400 and 1600 pixels).
- [ ] Fluid tokens in code: confirm developers want 1 `clamp()` value per token (Utopia style), and the code names (`--space-s`, `--space-s-l`, `--step-0`).
- [ ] Negative font steps: Utopia writes `--step--1`, which breaks the 1 hyphen rule. Choose a name, for example `step-minus-1`.
- [ ] Grid @min and Grid @max: which variables they hold.
- [ ] Connect and sync: which Figma file and collections are the source on the first real day, and who may change the connected repos.
- [ ] Connect and sync: when Figma and code disagree on the first real day, which wins by default (proposal: Figma, as the more up-to-date reference).
- [ ] Component scan: how to treat a coloured layer with no recognised name, a raw value not bound to any variable, and a component with more than 1 variant (where the role is needed, and which variant property gives it).
- [x] Component scan: the variant property that gives the state is `State`. Decided 23 Nov 2026.
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
- [x] Spacing tokens: spacing works differently from colour. Space primitives feed a semantic layer with min and max (fluid) values instead of light and dark; people make customised pairs of spacing tokens; grid tokens exist too. (N16.) Decided 20 Nov 2026: each token set has a column set (Value; Light and Dark; Min and Max; Default and Reduced motion). Primitives have 1 Value, except Motion. Theming starts at the semantic layer: colour by light and dark, spacing and type by min and max. Space pairs and custom space pairs are fluid tokens with a min from 1 step and a max from another. Naming for these is still provisional (see README).
