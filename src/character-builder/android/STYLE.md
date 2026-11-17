# Android styling and theme rules

The Android Character Builder uses a printed-rulebook folio style: warm parchment,
dark ink, oxblood accents, serif headings and restrained rectangular controls.
Apply these rules to new screens and changes to existing screens.

## Titles and hierarchy

- Show each navigation title once. When the selected bottom navigation item already
  identifies the page, omit a matching heading inside the page.
- Keep headings that identify meaningful sections within the page, such as
  Abilities, Proficient skills and Notes.
- Show the character name in the shared header; do not repeat it inside each tab.
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
  corners for dialogs.
- Use 1 dp Line borders and parchment dividers.
- Primary action buttons are full width, at least 56 dp tall, with 17 sp text and
  3 dp corners. Secondary outlined buttons use a 1 dp Accent border.
- Reuse shared folio components for consistent fields, buttons, headings and
  dialogs.
- Editable details and notes are directly tappable; do not add a separate Edit
  label to the overview.

## Navigation and motion

- Use the shared fixed-height 62 dp header and oxblood back chevron.
- Selected bottom navigation labels use Accent; inactive labels use Dim.
- Route transitions slide horizontally over 220 ms without a crossfade.
- Overview, Progression and Validation support both tab taps and horizontal
  swipes, with selection synchronized to the pager.

## Scrolling

- Use the shared slim scrollbar: a muted parchment track and oxblood thumb.
- Show it only when content overflows, follow the scroll position and reserve a
  small gutter beside text.
- Apply the same treatment to lists, Overview, Validation and dialogs. Preserve
  native touch/fling and accessibility scrolling.

## Screen layout and feedback

- Overview's Level and Portrait panels have equal heights. Speed and right-aligned
  Size share a row.
- Character library rows are rectangular, with a right-aligned delete button.
  Display dates as day month year.
- Do not show status banners for successful create, save, import or delete actions,
  or for picker cancellation.
- Operational failures use a blocking modal with a Return to main menu action.
  Back/outside dismissal and retry are unavailable. Rules diagnostics belong on
  Validation.

## Sources

The implementation lives under `src/main/kotlin/dev/modern4e/builder/`, especially
`ui/theme/`, `ui/components/`, `ui/screens/` and `BuilderApp.kt`. The project README
records workflow details and validation history. HTML files in `prototypes/` are
visual references; the native implementation and these rules define the current
Android conventions.
