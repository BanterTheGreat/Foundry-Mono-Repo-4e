# Plinth Banner + Party Pulse

Status: design validated in the horizontal HUD prototype. This document is the implementation target; the prototype HTML is exploratory only.

## Intent

Keep the player's nested health radial as the visual anchor. Spend the space to its right on the few decisions and awareness cues that matter during combat:

1. Four immediate action controls.
2. Initiative and speed at a glance.
3. A qualitative pulse of up to three companions, without exposing their exact HP.

The design deliberately does **not** show defences in this area. The radial retains its own HP, surge, and temporary-HP information.

## Layout

```text
┌────────────── nested player radial ──────────────┬────────── right deck ──────────┐
│                                                   │ [ AP ] [ Heals ] [ Saves ] [ Rests ]
│                                                   │
│                                                   │ [        Init 12 | Speed 5       ]
│                                                   │
│                                                   │             COMPANIONS
│                                                   │      ◉          ◉          ◉
│                                                   │    name       name       name
│                                                   │    class      class      class
└───────────────────────────────────────────────────┴───────────────────────────────┘
```

- The radial stays at its current large size and touches the vertical rhythm of the HUD.
- The action row and Init/Speed bar share the same left and right bounds. Preserve the right inset used by the action controls.
- Use a small 6px gap between the action row and the Init/Speed bar.
- `COMPANIONS` is centred over the three companion cards.

## Action row

Render four equal-width, icon-first buttons. Their visible labels stay one word and their full accessible labels explain the combined action.

| Visible label | Icon | Action represented |
| --- | --- | --- |
| AP | lightning | Spend/use an Action Point |
| Heals | heart | Heal and Second Wind |
| Saves | star | Saving Throw and Death Save |
| Rests | crescent | Short Rest and Extended Rest |

- Buttons use the existing dark panel, aged-brass border, and warm hover treatment.
- Each button needs a `title`, an accessible name, visible keyboard focus, and a restrained hover lift/brightness change.

## Init and Speed bar

The bar is full-width within the right deck and split into two equal cells:

- **Init**: compass/initiative icon, then the current initiative value.
- **Speed**: movement/stride icon, then current speed.

Both cells have equal hierarchy. Use a shared border and a single divider between them—not two unrelated chips. The values use the compact display face; labels are small uppercase.

## Companion pulse

Show a maximum of three other party members. Each companion card is a vertically aligned stack:

1. A 64px qualitative health radial.
2. Name.
3. Class.

No numeric HP, percentage, `Healthy`, `Hurt`, or `Bloodied` text is shown. The radial is the health signal.

### Six-segment health radial

- Six equal segments, starting at 12 o’clock and proceeding clockwise.
- Lit segments use the health crimson; unlit segments use muted dark burgundy. Leave a small dark gap between segments.
- The ring has a plain dark centre. Do not add the player radial's teal temporary-HP rim, brass surge ring, or any inner decoration.
- Quantize current HP to six segments using `ceil(currentHP / maxHP * 6)`, clamped to `0…6`.
- A living creature at a positive HP value always shows at least one lit segment. A creature at 0 HP shows none; optional defeated styling may be added later.
- The radial must include an accessible text equivalent, such as `"Kest health: approximately 4 of 6"`.

## Data required

The presentation data for this deck needs:

```js
{
  initiative: 12,
  speed: 5,
  companions: [
    { id, name: 'Kest', className: 'Wizard', currentHP, maxHP },
    // maximum three
  ],
  quickActions: {
    actionPoint,
    healAndSecondWind,
    saves,
    rests,
  },
}
```

The prototype names/classes are placeholders. Populate companions from the appropriate party/owned-actor source during production design work; do not hard-code them.

## Visual rules

- Background: near-black charcoal with subtle gradients.
- Borders/dividers: muted aged brass.
- Important values: parchment/gold display type.
- Health is the only saturated crimson signal in companion cards.
- Density should remain compact, but preserve enough horizontal room that companion names do not truncate at typical HUD width.
- On narrow displays, allow the existing HUD responsive layout to stack; do not shrink the 64px companion radials below readability.

## Implementation notes

- Implement this in the actor-display template/data/controller and matching stylesheet, not by adapting the PoC's appended scripts.
- Keep the action handlers in the actor display controller; the banner only owns presentation markup.
- Reuse existing module colour variables/classes where practical.
- Before promotion, test controlled-token switching, no-companion and fewer-than-three-companion cases, and the zero-HP companion state.

## Prototype reference

The visual reference is `compass-combat-stats-variants-prototype.html?variant=plinth` in this directory. It is intentionally throwaway and contains earlier exploration layers; this document supersedes those implementation details.
