# Collapsible chat-roll redesign — implementation handoff

This document and the accompanying HTML contain the accepted design and enough implementation context to continue in a new conversation. No prior chat history is required.

## Start here

Implement compact, collapsible **skill, attack, and damage roll messages** in `src/banter-4e-modifications`, using [the saved final prototype](chat-rolls-final.prototype.html) as the visual reference. Preserve DnD4e's actual rolls and automation. This is a presentation feature plus a properly integrated damage action, not a replacement rules engine.

The selected design is **Combat ledger C, with a separate, full-width Apply Damage button forming the clickable underside of damage messages**. The damage total is ordinary text. Earlier number-tile, icon-only, and merged-number explorations are superseded.

The user's priority is **legibility first, appearance second**. Do not restart the design exploration, restore rejected variants, or ask the user to repeat settled preferences.

Suggested prompt for the next conversation:

> Implement the chat-roll redesign described in `src/banter-4e-modifications/prototypes/chat-rolls-handoff/IMPLEMENTATION.md`. Read the accompanying final HTML prototype and the applicable repository/module instructions first. Follow the accepted design, reuse the existing attack/skill modifier snapshots, and preserve DnD4e 0.9.3 behavior. Work through the integration checks in the handoff, implement and test the change, then copy the module for my reload. I operate Foundry myself; do not launch or automate it.

## Saved artifacts and provenance

| File | Purpose |
| --- | --- |
| `chat-rolls-final.prototype.html` | Authoritative final visual/interaction reference, standalone and self-contained. |
| `IMPLEMENTATION.md` | This implementation contract and integration guide. |
| `../chat-rolls-apply-placement.prototype.html` | Working prototype from which the final snapshot was copied. Its historical filename does not describe the final selected design. |
| `../chat-rolls-clickable-underside.backup-20261024-114313.html` | Exact earlier backup requested before the legibility pass. Historical reference, not the final design. |

Open `chat-rolls-final.prototype.html` directly in a browser. No npm install, server, remote assets, or Foundry connection is required. The page contains a simulated chat sidebar and explanatory controls. Those controls are prototype-only.

The final HTML was copied byte-for-byte from the working prototype after removing collapsed buff tooltips. SHA-256 at handoff creation:

```text
3226e38d7a701a9a7e1d4856f5778d4063741256fef61dc5d13bd0c26a918f12
```

Date: 2026-10-24. Repository HEAD inspected: `d9ddd06` (`Add attack and skill buff badges`). Re-read current files before implementing; other work may have changed them. The user has not requested a commit or branch operation for this handoff.

The prototype is throwaway code, with accumulated CSS overrides, hardcoded sample data, and mock mutations. Rewrite production code cleanly. Do not import its script, publish its demo controls, or treat its arithmetic as the game's rules.

## Accepted product behavior

### Shared message structure

Chat is a readable history of what happened. Messages start collapsed. Keep the event, result, and exceptional contributors visible; move routine mechanics into expandable details.

Preserve Foundry's author/timestamp and message controls. The prototype's surrounding tabs, composer, header dots, timestamps, and repeated full names simulate the host; they are not a request to replace Foundry's chat sidebar.

Use real speaker/token/actor display names. The examples use `Idrani` and `Ozyn`, but do not hardcode those strings or blindly split every name at the first space. Prefer the speaker alias; preserve meaningful multiword names. Names should wrap when needed rather than conceal the event or result.

Each roll reminder has:

1. A sentence or skill label on the left.
2. A clearly separated final total on the right.
3. An appropriate short source line when needed.
4. Exceptional modifier chips only where specified below.
5. A small disclosure indicator and expandable calculation area.

The collapsed summary opens the details. Expansion is local UI state, not a world document update. Do not expand/collapse the message when using a tooltip or Apply/Undo control. Avoid duplicate click handlers on rerender and preserve local expansion through benign rerenders where practical.

### Skill checks

Example collapsed content:

```text
Ozyn rolled Acrobatics                         25
                                             TOTAL
```

The skill and total are sufficient. Do not surface training, ability, half-level, proficiency, or temporary skill modifiers as collapsed chips. Put them inside the details.

Hovering or keyboard-focusing the total shows the **natural d20**, prominently, with a short calculation if useful. In the sample: `D20 19`, then `19 + 6 = 25`. Touch may open/pin this popup. This interaction must not apply damage or open the details.

Expanded content includes the raw d20 result, modifier breakdown, skill/ability identity, and complete calculation.

### Attack rolls

Use sentence-style outcomes:

```text
Idrani Hit Kell-Guild Blade                    25
Steel Serpent Strike                         TOTAL
[+2 Hellsworn Blessing]  ← green glow, no extra explanation
```

Other states include `Idrani Missed Kell-Guild Blade` and `Idrani Critically Hit Kell-Guild Blade`. The accepted wording is definitive **Hit / Miss**, never “Probably” or “Probable.” Preserve special results such as critical, fumble, immunity, or unresolved attack state rather than forcing everything into an inaccurate binary.

If no target defense/outcome is available, show a neutral event such as `Idrani attacked Kell-Guild Blade` with its total. Do not invent Hit/Miss. This is a fallback for missing mechanical information, not a return to probabilistic wording.

The source line identifies the power/attack. Weapon, ability-vs-defense text, formula, natural roll, and ordinary bonuses belong inside the details.

**No Damage/Roll Damage button on attack-roll messages.** This does not remove buttons from separate power/item cards, active-defense workflows, or other unrelated system messages.

Hover/focus the attack total for its natural d20 popup, just as for skills. Use the active/kept d20 result. Do not show the final total or the first discarded die as the natural roll.

#### Exceptional attack modifier visibility

Show a temporary modifier in the collapsed summary only if it changed the outcome:

- A positive contribution that changed a miss into a hit gets a restrained **green glow**.
- A negative contribution that changed a hit into a miss gets a restrained **red glow**.
- A comfortable hit with an unnecessary temporary bonus hides that bonus in the details.
- A miss that still misses without its positive bonus also hides that bonus in the details.
- Permanent/base contributors such as Strength, half-level, proficiency, and weapon enhancement stay in the details.

Do not add “turned miss → hit,” “Hit resolved,” “Miss resolved,” explanatory stars, or similar visible prose. The chip's signed value, name, and glow are enough. Retain an accessible explanation of the outcome-changing state, without adding visible clutter.

**Collapsed buff chips are plain labels:** no tooltips, `title`, `data-tooltip`, `data-tip`, dotted underlines, help cursor, or tooltip-only tab stops. This applies to both attack and damage chips. Total-result tooltips remain enabled for skills/attacks. Expanding the message exposes contributor details.

For an ordinary attack, the relevant counterfactual uses the already rolled total and the actual marginal contribution after stacking:

```text
positive decisive: actual outcome is hit AND total - loss < defense
negative decisive: actual outcome is miss AND loss < 0 AND total - loss >= defense
```

Reuse the existing `resolveBuffBadges` logic described below. Do not compare a buff's printed value when its marginal contribution differs. Critical/fumble/immune outcomes must not receive false flat-bonus causality.

Multiple buffs need consistent handling: honor the existing per-source marginal decision when it is reliable. If several jointly necessary buffs are individually redundant, that is not permission to label every effect as decisive. Treat grouped attribution as a separate capability requiring accurate roll-time data; never guess.

### Damage rolls

Example collapsed content:

```text
Idrani damaged Kell-Guild Blade                28
Steel Serpent Strike                         DAMAGE
[Flame infusion · +2d8 + 2 fire]
────────────────────────────────────────────────
                 Apply Damage
```

The summary shows the final result, its source, and temporary/sudden damage contributors. In the sample, `17 physical + 11 fire = 28`; the fire contributor is named **`Flame infusion · +2d8 + 2 fire`**, not `+11 fire`. The user's requirement is to show the **dice formula in the buff label**, rather than the rolled value. Flat additions remain signed flat formulas. Keep damage type and source name identifiable.

The total uses actual rolled results. The details show the dice results and rolled contribution, e.g. `2d8 [5, 4] + 2 = 11 fire`. A zero roll does not erase a known applicable dice-buff source. Avoid attributing dice terms to an effect merely because their formulas happen to match.

If the system applies an explicit roll-wide divisor (for example weakened or half damage on a miss), make the collapsed result reflect that effective rolled damage using the system's scaling/rounding rules. Show the raw roll, divisor, and reason in details; do not divide twice when applying it. Target-specific resistance/vulnerability may still make applied HP loss differ from this result. The sample has divisor 1 and no target mitigation.

Permanent/equipment contributors stay inside the details: Strength, enhancement, Bracers of Might Striking, weapon die, etc. The main source line names the power; the details can name the selected weapon and individual typed components.

**The damage total is ordinary text, not an Apply control or tooltip trigger.** Clicking its area may act like the surrounding disclosure, but it must never apply damage. The number and DAMAGE label must be vertically centered against the whole summary, including the extra buff row, so adding a chip does not make the number look top-aligned.

Do not add `XX damage ready`, hit/miss resolution status, or duplicate rolled-contribution labels beside the buff.

#### Apply Damage underside

Use a real, keyboard-operable button labelled **Apply Damage**. It forms the card's full-width clickable underside:

- Flush with the outside left/right card edges; no inset gap or separate inner button rectangle.
- Attached directly under the entire message content, including expanded details.
- Shared bottom corner silhouette with the card; the main content has square lower corners where it joins the action.
- Always visible while the calculation is collapsed.
- Clear ember fill, a warm top separator, high-contrast label, restrained hover/pressed/focus treatment.
- The final legibility pass uses **24px button height and 12px bold text**. The earlier 17–18px versions were superseded because readability takes precedence.
- No icon-only Apply, number tile, separate footer status, or combined number/action design.
- Clicking the button does not toggle the disclosure and does not reroll damage.

The prototype changes the button to **Undo Damage** in the same space after application. This is a mock; a real Undo must meet the requirements below. Never equate applying negative damage/healing with undoing a previous application.

## Visual specification

Load the repo's module skill and the HUD style guide at `.agents/skills/dnd4e-health-display/SKILL.md`. This task remains in Banter; consulting the HUD guide does not mean moving chat behavior into the health-display module.

The final prototype is the authority for proportions and hierarchy. Its last CSS rules override earlier exploratory rules; copying the first definition of a selector will produce the wrong version.

| Element | Final direction / useful reference |
| --- | --- |
| Surfaces | Neutral charcoal, approximately `#2d2e35` → `#23242b`; sidebar `#202127` → `#141519`. |
| Main text | Warm parchment, approximately `#f1e8d8`. Use `var(--font-h1, Georgia, serif)` where the design uses display type. |
| Main sentence | About 14px with 1.4 line height; allow wrapping. |
| Source line | About 11px, muted but readable; wrapping is preferable to losing meaning. |
| Total | About 30px; tabular numerals; DAMAGE/TOTAL label about 8px. |
| Buff labels | About 10px; small radius and padding; no tooltip underline. |
| Author/time | About 10px. Reuse Foundry's host header rather than creating duplicates. |
| Borders | Thin warm/slate dividers; crimson accents for attacks, ember accents for damage; small 4–6px corners. |
| Decisive chips | Green/red border and modest glow restricted to actual outcome-changing state. |
| Apply underside | 24px high, 12px bold label; approximately `#945846` → `#783e33`, text `#fff7ed`, top divider `#e0a07c`. |
| Hover | Noticeably lighter ember, no gap-producing movement of the attached underside. |
| Focus | Visible warm outline; inset for the flush action so card clipping does not hide it. |

Keep brass as a small structural/focus accent. The user explicitly rejected broad olive/green/brown washes as drab and samey. Preserve a charcoal base and clear contrast between information types. Do not recolor the whole attack card green for a hit.

For vertical centering, the reference uses a two-row summary grid. The damage main text occupies column 1/row 1; buff chips column 1/row 2; total column 2/rows 1–2; chevron column 3/rows 1–2. Center the total and chevron across those rows. Verify with and without chips and with wrapped names.

## Repository integration map — verified locally

Target module manifest: `src/banter-4e-modifications/module.json`, ID `banter-4e-modifications`, currently minimum Foundry **13**, verified **14**, stylesheet `styles/main.css`, ES module `scripts/main.js`. Preserve minimum 13 compatibility unless intentionally changed. The skill's general v14 description does not override the manifest.

Relevant existing code:

| File, relative to module root | Why it matters |
| --- | --- |
| `scripts/main.js` | Registers `AttackBuffs`, `SkillBuffs`, both chat render hooks, active defense, trigger prompts, and socket actions. |
| `scripts/modules/attack-buffs/attack-buffs.js` | Captures roll-time temporary sources before effects expire; wraps per-target multiattack rolls; stores badges in `roll.options.banterAttackBuffs`; supplies `renderBadges`. |
| `scripts/modules/attack-buffs/attack-buff-math.js` | `totalBonuses`, `findBonusLoss`, `resolveBuffBadges`; understands typed stacking and marginal loss. |
| `scripts/modules/skill-buffs/skill-buffs.js` | Wraps `Actor#rollSkill`; stores `flags['banter-4e-modifications'].skillCheck` containing `skillId`, `dc`, and badges. |
| `scripts/modules/player-defense/player-defense*.js` | Custom NPC-vs-PC active-defense workflow; preserve its messages, state, dialogs and hooks. |
| `scripts/modules/player-defense/socket-helper.js` | Existing GM-authoritative queue for message mutations and defense resolution. Its damage methods roll damage; they are not generic Apply Damage APIs. |
| `scripts/modules/trigger-prompts/attack-result-capture.js` | Attack capture and natural-d20 extraction example; do not copy its single pending context as a universal concurrent-message correlation mechanism. |
| `scripts/modules/opportunity-attack-chat/opportunity-attack-chat-actions.js` | Existing native/jQuery render-root handling and power-card actions; preserve separate item cards. |
| `styles/main.css` | Existing `.banter-attack-buffs` / `.banter-attack-buff*` styles and decisive states. |
| `test/attack-buffs.test.js`, `test/skill-buffs.test.js` | Reuse/extend tests around serialized modifier snapshots. |
| `test/main-lifecycle.test.js`, `test/player-defense-*.test.js`, trigger-prompt tests | Regression coverage for hook ordering and neighboring workflows. |

`AttackBuffs.renderBadges` currently appends all nonzero badges below `.dice-total`, gives chips tab stops and `title` tooltips, and runs on both `renderChatMessageHTML` and `renderChatMessage`. That existing rendering does **not** match the new design. Reuse its data, but prevent duplicate/bare legacy rows and tooltip attributes in redesigned summaries. Keep ordinary/base badges in details. Leave a legacy fallback for unsupported messages if needed.

Existing `AttackBuffs.isTemporary` includes system durations, save/encounter effects, aura recipients, and appropriate actor-owned effects. Do not redefine “temporary” as only `effect.isTemporary`; do not classify permanent transferred equipment/feat bonuses as sudden buffs.

## Verified DnD4e 0.9.3 seams and limitations

Primary source tree checked through GitHub at ref `0.9.3`, tree SHA `3476b34c1c2b4e3d1cb1e3a780eb4c3a4ae5e156`. These are source-level checks, not a running Foundry validation. Recheck source before modifying wrappers; never assume latest upstream APIs.

- [MultiAttackRoll](https://github.com/EndlesNights/dnd4eBeta/blob/0.9.3/module/rolls/multi-attack-roll.mjs): `addNewRoll`, `populateMultirollData`, `toMessage`. Individual rolls get `options.multirollData`, including `target`, `targetID`, `hitstate`, `critstate`, `def`, and result data. `message.rolls` contains the individual rolls. A message may contain different outcomes against multiple targets. Do not summarize all targets with `message.rolls[0]` or recompute outcomes from current actor defenses.
- [Single-roll template](https://github.com/EndlesNights/dnd4eBeta/blob/0.9.3/templates/chat/roll-template-single.hbs): `.dice-roll`, `.dice-result`, `.dice-container[data-action='expandRoll']`, `.dice-total`, `.chatDamageButtons`, and native `.chat-damage-button[data-action='Damage']`. Preserve native roll/context-menu integration where needed.
- [Chat helpers](https://github.com/EndlesNights/dnd4eBeta/blob/0.9.3/module/helpers/chat.mjs): exported `clickRollMessageDamageButtons`; `applyChatCardDamageInner` is private, not an importable API. Native application uses **controlled tokens**, extracts typed contributions from evaluated roll terms, accounts for `options.divisors[options.hitType].value`, and calls actors' `calcDamage`. It does not simply subtract the displayed number.
- [Dice helpers](https://github.com/EndlesNights/dnd4eBeta/blob/0.9.3/module/helpers/dice.mjs): `d20Roll`, `dnd4e.preAttackRoll`, and damage-roll construction. The final damage roll sets `options.hitTypeDamage`, `options.hitType`, and healing state separately. Do not classify healing as damage.
- [Item document](https://github.com/EndlesNights/dnd4eBeta/blob/0.9.3/module/documents/item.mjs): `rollDamage` builds `extraDamageParts` through `utils.applyEffects`, constructs normal/crit/miss variants, fires `dnd4e.rollDamage(item, speaker)`, then calls the damage helper and expires damage-duration effects. The hook does **not** supply the final rolled damage or its terms.
- [RollWithOriginalExpression](https://github.com/EndlesNights/dnd4eBeta/blob/0.9.3/module/rolls/roll-with-expression.mjs): preserves formula/expression metadata, typed flavor, `hitTypeDamage`, `hitTypeHealing`, `multirollData`, and divisor display. Original formula is useful but is not guaranteed source attribution.
- [ChatMessage4e](https://github.com/EndlesNights/dnd4eBeta/blob/0.9.3/module/documents/chat-message.mjs): can resolve item roll data from `flags.dnd4e.itemUuid`, or item data plus actor UUID. Check presence on the actual message type; these are not guaranteed on every roll.

Important source caveat: `Item#rollDamage` constructs `messageData` with `flags.dnd4e.roll`, but the checked damage helper signature does not consume that `messageData` parameter, and its final `toMessage` call passes speaker/flavor only. Do not assume those flags identify all damage messages. Use verified roll options and a properly correlated capture adapter; test reload/deserialization.

## Recommended implementation structure

This is a proposed module-local structure, not existing code:

```text
scripts/modules/chat-rolls/
  chat-rolls.js                 # registration, orchestration, render lifecycle
  chat-roll-data.js             # serialized-message -> presentation model
  damage-source-capture.js      # roll-time source/formula snapshots
  chat-roll-actions.js          # native damage action adapter / application state
templates/chat-rolls/
  roll-message.hbs              # summary, details, attached action
styles/chat-rolls.css           # scoped production styles
test/chat-roll-*.test.js
```

Use focused helpers; do not mirror every prototype function. Register through `scripts/main.js`; if adding a stylesheet, list it in the manifest. Use braced multiline `if` blocks and JSDoc. Namespace CSS and flags under this module; no global `summary`, `.action`, `.score`, or `button` restyles.

Prefer transforming supported roll bodies in the chat-render lifecycle while retaining the ChatMessage document, rolls, header, permissions, and native action wiring. Avoid replacing the entire chat application or mutating a document every time a user renders it.

Suggested flow:

1. Identify eligible system roll messages using durable data. Reject hidden/private content for unauthorized viewers before building any additional HTML/tooltips.
2. Normalize each skill/attack/damage result into a presentation model. For multiattacks, create one result entry per target; never invent a combined attack total.
3. Render the module's summary/details around retained roll data. Preserve original formulas/calculations in the expanded section when possible.
4. Position the damage action as a sibling following the disclosure, so it remains visible when details close and cannot toggle them.
5. Bind local details state and tooltips once per render. Respect native and jQuery hook payloads (`html?.[0] ?? html`) and idempotency across both supported hooks.
6. Route application through a version-checked native adapter. Do not alter evaluated rolls, re-trigger attack/effect automation, or emit extra roll messages during rendering.

If introducing a world setting, default this requested design on and provide a graceful system/unsupported-message fallback. Do not introduce extra setup or per-card switches into the product flow without a concrete reason.

### Durable data and source attribution

Capture names, IDs/UUIDs, formulas, applied totals, and contributor identity at roll time. An effect may expire immediately after the roll, an item may be renamed, or a target may later leave the scene. Chat history must not change based on today's actor state.

Reuse existing attack and skill snapshots. For damage, **new provenance capture is required**; the current module has no equivalent named damage-contributor snapshot. Design its seam against the pinned source before implementation. A hook that supplies only item/speaker is insufficient for safely correlating concurrent dialogs.

Store plain JSON in per-roll options or module-namespaced message flags, not live documents, DOM nodes, or cached Item objects. Add a schema version. A proposed model should distinguish:

```js
{
  version: 1,
  kind: 'damage',
  source: { actorUuid, itemUuid, itemName, weaponName, speakerName },
  targetRefs: [], // confirmed roll context, not a guess based on present selection
  total: 28,
  contributors: [{
    sourceUuid,
    name: 'Flame infusion',
    temporary: true,
    displayFormula: '2d8 + 2',
    damageType: 'fire',
    rolledContribution: 11,
    termRefs: [], // actual correlated terms if available
    attribution: 'verified'
  }]
}
```

This is an illustrative schema, not a mandate to duplicate totals already persisted in Rolls. Do not serialize private target defenses in newly public flags/tooltips. Use stable source IDs for grouping, not translated names.

Never evaluate a random buff again to discover its contribution. Capture the already evaluated term or preserve the source-to-formula mapping while the system builds the expression. Respect typed stacking, maximized critical additions, miss formulas/divisors, and damage-duration expiration. Only show collapsed contributors that actually apply to the selected roll variant. For ambiguous legacy data, retain the full breakdown and omit an unprovable attribution rather than fabricate it.

History without new snapshots must still render a useful total/source/calculation. Do not manufacture past effects from current active effects.

### Natural d20 popups

Read active/kept results from the evaluated roll's actual d20 terms. Respect keep-high/keep-low, rerolls, and multiple targets. Critical thresholds belong to the system outcome, not an assumed natural-20-only rule. No d20 means no invented d20 popup.

Use a safe Foundry tooltip or a module-owned accessible popup. Escape names/formulas; do not inject arbitrary effect descriptions as trusted HTML. Support pointer hover, focus, Escape dismissal, and touch without expanding the card. Keep the popup within the visible sidebar/window. Do not add tooltip affordances back to collapsed buff labels.

### Real Apply Damage behavior

The prototype applies nothing to actors. Its fixed `applied` Boolean, hardcoded target, and Undo toggle must not be copied into production.

Preserve native **controlled-token** application semantics by default. The sentence's named target is historical context; it must not silently redefine which actors the system damages. The prototype's target-specific aria label is illustrative, not proof of native targeting behavior. Production labels/help should describe the actual selection. If no applicable controlled actor is available, do not mark the message applied; use the normal system feedback. Applying directly to a stored target would be a separate behavioral change, not a CSS consequence.

Two feasible implementation paths need verification:

- Reuse/restyle the actual native `data-action='Damage'` button, keeping the `.message[data-message-id]` ancestry and handler behavior intact; preserve event routing when the button moves outside the collapsed content.
- Build a small adapter around the pinned typed-damage application algorithm when reliable completion receipts are required. Match flavored terms, untyped remainder allocation, damage variant divisor, `calcDamage`, and authority checks; do not call the private helper as if it were exported.

Prefer native behavior with minimal wrapping. The exported native click handler does not await/return the private damage Promise, so simply calling it and immediately displaying success is not sufficient for a reliable receipt or Undo. Resolve that integration explicitly.

The pinned native handler also reads `event.target` as the button, rather than resolving a nested element. Keep the production action's click target compatible or normalize it in the adapter. Do not accidentally cause double application by binding a second native listener to a button that already has one.

Preserve resistances, vulnerabilities, immunity, temporary HP, weakened/miss damage scaling, and target permissions. Keep other native context-menu options and healing/temp-HP rolls working. Do not remove half-damage/healing behavior globally because the new collapsed card shows one primary action.

Prevent duplicate requests while an application is in flight. Persist shared application/receipt state if it affects what other clients see; local DOM flags cannot coordinate users. Validate authority server-side/GM-side for any new SocketLib operation, with source message and target UUIDs rather than arbitrary actor update payloads. Existing socket queues are useful context, not automatic authorization for a new endpoint.

For a real **Undo Damage**, record an authoritative receipt containing affected actors and the actual reversible changes. Do not implement it by healing the rolled amount or blindly resetting old HP. Temporary HP, resistance, intervening HP changes, and system-triggered effects make those incorrect. Before restoring state, verify that the touched fields still match the recorded post-application state; reject stale undo rather than overwrite subsequent changes. If the chosen native integration cannot support reliable undo, report that limitation and use an honest applied state instead of shipping a fake Undo. This is the main integration uncertainty, not an unresolved visual decision.

### Neighboring workflows and graceful fallback

Keep player-defense dialogs/messages, trigger prompts, opportunity-attack power-card actions, and roll-duration effect expiration working. A presentation hook must not create a second semantic attack outcome or roll damage again.

Do not hardcode a one-target assumption. Target-less rolls, scene-token speakers, synthetic/unlinked actors, deleted targets, renamed/deleted source items, blind/whisper/GM rolls, and old messages need fallbacks. Preserve the native message if reliable classification is unavailable. Do not leak hidden content through popup text, attributes, flags, or inaccessible-but-present DOM.

## Verification and delivery

### Prototype checks already performed

The final working prototype was rendered at 728px and narrow widths during iteration. Checks covered the attached Apply/Undo behavior, damage-total centering with/without a buff, explicit d20 popups, no tooltip attributes/underline on collapsed buff labels, and the formula-vs-result distinction. These verify the mockup only; they are not Foundry integration tests.

### Required automated behavior tests for implementation

- Skill summary shows skill/total; all routine modifiers appear only expanded.
- Natural d20 extraction chooses the active die, including keep/reroll cases and per-target rolls.
- Attack uses stored hit/crit state; unknown outcome stays neutral; total matches its own target.
- Positive decisive, negative decisive, unneeded bonus, ineffective bonus, typed overlap, and critical/fumble/immunity cases.
- Collapsed attack/damage chips have no tooltip/title/help underline or tooltip-only keyboard stop.
- Dice-buff label preserves `2d8 + 2`, while the actual rolled contribution affects the total and appears in details.
- Effects expiring or being deleted after the roll do not change history.
- Renderer is idempotent across both hooks and rerenders; legacy badges are not duplicated.
- Permissions/private rolls do not leak values or private defenses.
- Apply Damage is always outside the disclosure, spans the card, and never applies from clicking the plain damage total.
- Typed damage, miss/critical divisors, no controlled tokens, unauthorized users, repeated/in-flight requests, and multi-client state are handled correctly.
- If implementing Undo: real receipt success, partial failures, intervening actor changes, stale receipt rejection, and temporary-HP/resistance cases.

Do not write tests that merely snapshot every CSS selector. Use browser rendering/manual checks for geometry and meaningful unit/integration tests for the behavior above.

Run the existing module suite and syntax/diff checks:

```powershell
# From src/banter-4e-modifications:
npm test

# From repository root, for every changed/new JS file:
node --check src/banter-4e-modifications/scripts/modules/chat-rolls/chat-rolls.js
git diff --check
```

If the real module manifest/hooks change, request the user's Foundry reload and browser-console results after copying. **The user exclusively operates Foundry: do not launch, inspect its running UI, automate, or directly validate it yourself.** Source inspection is distinct from claiming runtime validation.

Manual checklist for the user:

1. Roll a skill, hit, miss, critical, damage, and a multi-target attack. Check collapsed readability and totals.
2. Hover/focus skill/attack totals; check natural d20. Hover collapsed buffs: no popup or dotted underline.
3. Test a decisive buff, unneeded buff, and decisive penalty. No “turned miss/hit” prose appears.
4. Roll a temporary dice damage bonus. The chip shows its formula; details show the actual dice contribution.
5. Expand/collapse, rerender, reload history, and let effects expire. Snapshots remain correct.
6. Check the damage total is vertically centered with/without a chip and with a long wrapped name.
7. Check Apply Damage is an edge-to-edge 24px underside with a legible 12px label, clear hover/focus, and no separate inset button.
8. Apply against controlled tokens, including temp HP and resistance. Check actual actor changes and any supported Undo.
9. Verify private rolls/players/GM views, player defense, trigger prompts, and separate power-card actions.
10. Check sidebar and popout layouts at normal and narrow widths, keyboard access, and browser console.

After production changes, synchronize only the affected module:

```powershell
npm run copy-module -- banter-4e-modifications
```

The prototype/docs alone do not require deployment. Never copy `modern4e`. Respect the repository's issue/changelog conventions; the handoff is an explicitly requested implementation artifact, not a new local TODO tracker.

## Completion criteria

The work is complete when supported Foundry roll messages match the saved final design, use real persisted roll/source data, preserve existing automation and visibility, keep the primary damage action separate from its plain-text total, and pass relevant tests plus the user's reload verification. Report any unsupported legacy/provenance/Undo cases explicitly. Save the reference artifacts so the visual decision remains reviewable; do not ship the prototype's control panel as product UI.
