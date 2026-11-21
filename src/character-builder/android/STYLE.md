# Android styling and theme rules

The Android Character Builder uses a printed-rulebook folio style: warm parchment,
dark ink, oxblood accents, serif headings and restrained rectangular controls.
Apply these rules to new screens and changes to existing screens.

## Titles and hierarchy

- Show each navigation title once. When the selected bottom navigation item already
  identifies the page, omit a matching heading inside the page.
- Keep headings that identify meaningful sections within the page, such as
  Abilities, Proficient skills and Notes.
- Show the character name in the shared header; do not repeat it inside each tab. Tapping it renames the character; there is no pencil icon.
- Overview already follows this rule. Progression and Validation currently repeat
  their navigation labels as page headings and need alignment when those screens
  are next updated.

## Palette and theme

Use the shared tokens in `ui/theme/FolioTheme.kt` rather than introducing slightly
different local colours.

| Token | Colour | Use |
| --- | --- | --- |
| Paper | `#F3EDDF` | Screen, field and modal backgrounds |
| Ink | `#322B25` | Primary text |
| Dim | `#71675C` | Labels and secondary text |
| Line | `#C9BDA7` | Borders, dividers and scrollbar track |
| Accent | `#863F36` | Primary actions, selected tabs and prominent values |
| Wash | `#E8DDCB` | Shaded panels and supporting surfaces |

The current app uses a light Material 3 colour scheme throughout, including
modals. Dark mode and dynamic system colours are not implemented.

## Typography

- Use the system serif family for titles, section headings, character names and
  prominent values. Use default Material typography for controls and supporting
  text.
- Shared section headings use 23 sp; header titles use 24 sp.
- Editable field labels use uppercase 10 sp text, Dim and 1 sp letter spacing;
  their values use 18 sp serif text.
- Keep text hierarchy restrained. The home wordmark and level value are deliberate
  larger display treatments.

## Surfaces and controls

- Prefer rectangular surfaces with subtle corners: generally 2–3 dp, with 6 dp
  corners for dialogs. Buttons, steppers, tabs and the Levels "Level up ›" button are
  always 3 dp; nothing on the Levels tab is fully rounded.
- Use 1 dp Line borders and parchment dividers.
- Reuse shared folio components for consistent fields, buttons, headings and
  dialogs.
- Editable details and notes are directly tappable; do not add a separate Edit
  label to the overview.

## Buttons

Never use a stock Material `Button`, `OutlinedButton`, `TextButton`, `IconButton`,
`FilterChip` or `AlertDialog` directly. Use the shared controls in
`ui/components/FolioComponents.kt`, which fix the shape, colour and size. All button
text is title case, a verb or short verb phrase ("Save", "Import"), not
"OK" or "Yes", except OK on a notice that has nothing to confirm.

| Role | Component | Look | Use |
| --- | --- | --- | --- |
| Screen action | `FolioButton` | Full width, 56 dp min, 17 sp, filled Accent | The main thing to do on a screen: New, Choose a file |
| Alternative screen action | `FolioButton(outlined = true)` | Same size, 1 dp Accent border | A second action beside the primary one (Import beside New); at most one filled button per screen |
| Dialog / sheet / card action | `FolioButton(compact = true)` | 40 dp min, 14 sp | The primary action of a dialog, sheet or card (Save, Create, Confirm, Learn). Filled unless it is one of several alternatives, then outlined |
| Destructive action | `FolioButton(destructive = true)` | Error colour instead of Accent | Anything that deletes data (Delete). Never style a destructive action like an ordinary one |
| Dismiss / back out | `FolioTextButton` | Text only, 14 sp | Cancel and Close; also inline links such as "Show defense breakdown" |
| Stepper | `FolioStepper` | 48 dp square, 1 dp Accent border, 24 sp symbol | − / + on a number (level, ability points). One size everywhere |
| Icon-only | `FolioIconButton` | 48 dp touch target, hand-drawn 24 dp icon | Back, the character menu, Settings, delete. Always gives a content description |
| Tab | `FolioTab` / the footer | Accent when selected, Dim otherwise, with a 2–3 dp Accent underline | Switching between sibling views. Selection is shown by colour and underline together, never colour alone |

### Dialog, sheet and picker footers

- Put footer buttons in `FolioActions`: right-aligned, 8 dp apart, **primary action
  last**, with Cancel (a `FolioTextButton`) immediately before it. Do not spread
  Cancel and the primary action to opposite edges.
- A single-button footer is right-aligned too. Close is a `FolioTextButton`; an
  acknowledgement (OK) is a filled compact button.
- A secondary action that clears or resets (Clear) goes at the left edge via
  `FolioActions(leading = …)`.
- A dialog that offers several different outcomes (Export, Import review, Recovery
  copies) lists them as full-width `FolioButton`s above the footer, the first filled
  and the rest outlined. Cancel stays in the footer.
- Keep the disabled state: a button that cannot act yet is disabled, not hidden.
- Use `FolioDialog` for every dialog, including confirmations. The stock
  `AlertDialog` is not used because its shape, padding and heading differ.

### Choosing between options

- A set of two or three exclusive options in a row (the main ability) is a row of
  equal-width compact `FolioButton`s: filled for the current choice, outlined for
  the others. Do not use `FilterChip`.
- A longer list of options is a list of `ChoiceCard`s, where a tick, a 2 dp Accent
  border and a Wash background mark the choice.

### Tappable surfaces

- Fields, choice cards, library rows, the Level box and the portrait panel are
  tappable surfaces rather than buttons. Give them a content description that names
  the action ("Edit Name", "Change level, currently 3") and `Role.Button` where the
  tap does something other than select.
- Open question: these surfaces do not yet look tappable beyond their framing. Do
  not invent a one-off affordance on a single screen; any change should be applied
  to all of them together.

## Levels tab

- Base and each level open with a slim heading: serif number (30 sp; Base is 24 sp), a 10 sp
  LEVEL label, a Line hairline and a status at the right: "N to choose" (Accent, 11 sp bold), a
  green ✓, or for an upcoming level an outlined Accent "Level up ›" button. The character's
  level number is Accent and upcoming numbers are Dim. Do not use a filled banner.
- Gender, Age, Deity and the equipment slots use the same card (`LevelChoice`); an empty optional one reads "+ Add…" or "+ Choose…" in Dim.
- A filled choice is a Paper card: 11 sp sentence-case label above a 16 sp serif value. Powers
  tint the label and the 3 dp left edge with the power frequency colour.
- A choice not yet made is a transparent dashed outline reading "+ Choose…": Accent when
  required, Line and Dim when optional or upcoming. An illegal saved choice keeps the red fill.
- Same-kind powers at one level are ordinary choices laid out in a row of two (the two At-Wills,
  the two Dailies); a kind with one slot is full width. Never squeeze more than two powers into one row.

## Navigation and motion

- Use the shared fixed-height 62 dp header: oxblood back chevron, a centered 22 sp serif title and, on
  character pages, a small uppercase Dim line beneath it ("Level 1 · Fighter"; Loading…, Saving… or
  Exporting… while work is in progress). The trailing 48 dp slot holds the cog menu on character pages
  and stays reserved elsewhere so the title is centered. Home uses the same cog and right-side cabinet, with Recovery Copies opening a dated, scrollable list.
- The character footer is a 42 dp status strip (Wash background, 3 dp Accent left rule, Line when
  complete) above three text tabs with a 3 dp Accent underline that slides between them. The strip reports
  required choices left and its Continue action opens Levels and scrolls the first open (red) row to just below the header; once none remain the strip is not shown.
- Selected footer tab labels use bold Accent; inactive labels use Dim.
- Route transitions slide horizontally over 220 ms without a crossfade.
- Overview, Progression and Stats support both tab taps and horizontal swipes, with selection
  synchronized to the pager. Validation is only reachable from the cabinet; it joins the pager while open
  and swiping from Stats never opens it.

## Scrolling

- Use the shared slim scrollbar: a muted parchment track and oxblood thumb.
- Show it only when content overflows, follow the scroll position and reserve a
  small gutter beside text.
- Apply the same treatment to lists, Overview, Validation and dialogs. Preserve
  native touch/fling and accessibility scrolling.

## Screen layout and feedback

- Overview's Level and Portrait panels have equal heights. Speed and right-aligned
  Size share a row.
- Overview's Level panel opens the Change level dialog instead of navigating: 38 sp serif
  Accent target level, 48 dp outlined − / + steppers (`FolioStepper`) with a 1 dp Accent border, and an
  Accent incomplete-automation note above level 2.
- The Portrait panel is tappable and opens the system image picker; the chosen image fills
  the panel (cropped to fit). Problems with a picked image use a small dismissible notice
  dialog, not the blocking error modal, since nothing in the session is at risk.
- Character library rows are a ledger: hairline Line dividers (no card borders), a 28 sp serif Accent level
  numeral over a 9 sp LEVEL label, the name (18 sp serif) over a 12 sp Dim ancestry and class line, the save
  date and a right-aligned delete icon button. A `FolioSearchField` and a Recent / A–Z / Level row of equal
  compact `FolioButton`s sit above it. Display dates as day month year.
- Do not show status banners for successful create, save, import or delete actions,
  or for picker cancellation.
- Operational failures use a blocking modal with a Return to main menu action.
  Back/outside dismissal and retry are unavailable. Rules diagnostics belong on
  Validation.
- The blocking error modal has a full-bleed banner image (`error_banner`, 170 dp, cropped) with a
  Accent/Paper hazard stripe, then the title, the unsaved-changes sentence, the
  `FolioAlertButton` "Send this to Banter" and a full-width Return to main menu `FolioButton`.
  It never shows the error message or stack trace; they travel only in the shared report
  (Android share sheet, plain text). `FolioAlertButton` is the one raised, pulsing call to action
  and is reserved for things a player must not skip; do not use it for ordinary actions.

## Sources

The implementation lives under `src/main/kotlin/dev/modern4e/builder/`, especially
`ui/theme/`, `ui/components/`, `ui/screens/` and `BuilderApp.kt`. The project README
records workflow details and validation history. HTML files in `prototypes/` are
visual references; the native implementation and these rules define the current
Android conventions.
