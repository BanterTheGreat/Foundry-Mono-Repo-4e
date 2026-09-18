---
name: dnd4e-aura-effects
description: Configure or troubleshoot DnD4e Active Effects converted into auras by the Aura Effects module. Use for distance, disposition, source inclusion, early value evaluation, collision, visualization, stacking, Best formulas, or Conditional Script expressions.
---

# DnD4e Aura Effects

Aura Effects converts an Active Effect into an aura, applies copies to eligible tokens in range, and can visualize the area. Treat its controls as add-on behavior layered over Foundry VTT v14 and DnD4e 0.9.3.

## Configuration

Create the Active Effect and convert it to an aura. Configure its DnD4e changes using `dnd4e-active-effect-keys`, then set distance, source inclusion, recipient disposition, stacking, a deterministic Best Formula, early evaluation, collision behavior, and visualization as required.

Distance uses a token-attached Region. Collision Type selects which wall collision type blocks the aura; movement-blocking walls are the default. Visualization is presentational only.

## Disposition

- **Friendly** matches the source token's disposition.
- **Hostile** matches the opposed disposition and can still include the source unless source application is disabled.
- **Any** accepts every disposition.
- Neutral and Secret tokens never count as Friendly or Hostile.

## Source versus recipient evaluation

**Evaluate Changes Early** resolves effect-change roll data from the aura's parent/source before copying it. Enable it when a DnD4e variable such as `@chaMod` or `@conMod` must come from the source. Leave it disabled when each recipient should determine the value.

Foundry v14 systems may perform additional inline evaluation, so verify source-dependent formulas in the running DnD4e world.

## Conditional Script

The field expects a JavaScript expression. Truthy allows the candidate recipient; falsy rejects it regardless of other settings.

| Variable | Meaning |
| --- | --- |
| `token` | Candidate recipient Token placeable. |
| `actor` | Candidate recipient Actor. |
| `sourceToken` | Token placeable emitting the aura. |
| `rollData` | Roll data for the candidate recipient actor. |

Suppress an aura while its DnD4e source is unconscious, dazed, or blinded:

```js
!["unconscious", "dazed", "blinded"].some(
  status => sourceToken.actor.statuses.has(status)
)
```

Use DnD4e status IDs rather than display labels.

## Stacking and Best Formula

When **Aura Can Stack** is enabled, multiple same-name auras may apply. When disabled, **Best Formula** selects the winning source. It must be deterministic and is evaluated using the source actor's roll data.

```text
@chaMod
max(1, @chaMod)
```

Use DnD4e aliases from `dnd4e-active-effect-keys`, not DnD5e examples such as `@abilities.cha.mod`, unless the running DnD4e roll data confirms the path.
