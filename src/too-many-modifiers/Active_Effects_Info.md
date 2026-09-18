# Active Effect keys and DnD4e variables

Reference for DnD4e [`0.9.3`](https://github.com/EndlesNights/dnd4eBeta/tree/0.9.3). Keys and variables are case-sensitive.

## Standard actor keys

These change a stored actor property.

| What it changes | Key |
| --- | --- |
| AC | `system.defences.ac.<bonus-type>` |
| Fortitude | `system.defences.fort.<bonus-type>` |
| Reflex | `system.defences.ref.<bonus-type>` |
| Will | `system.defences.wil.<bonus-type>` |
| Speed | `system.movement.base.<bonus-type>` |
| Global attack modifier | `system.modifiers.attack.<bonus-type>` |
| Global damage modifier | `system.modifiers.damage.<bonus-type>` |
| Saving throws | `system.details.saves.<bonus-type>` |

`<bonus-type>` is normally `power`, `item`, `race`, or `untyped`. Use **Upgrade** for typed bonuses so only the highest bonus of that type is retained. Use **Add** for untyped bonuses and penalties.

Examples:

```text
system.defences.ac.power
system.defences.fort.item
system.movement.base.untyped
system.modifiers.attack.power
```

## Resistance and vulnerability keys

```text
system.resistances.<damage-type>.res
system.resistances.<damage-type>.vuln
```

Valid `<damage-type>` values:

```text
damage  ongoing  acid  cold  fire  force  lightning
necrotic  physical  poison  psychic  radiant  thunder
```

Examples:

```text
system.resistances.cold.res
system.resistances.fire.vuln
system.resistances.damage.res
```

Use **Upgrade** for resistance and **Downgrade** for vulnerability. TMTT uses a positive value for resistance and a negative value for vulnerability.

## Conditional DnD4e roll keys

Conditional keys affect a roll without changing a stored actor property:

```text
<scope>.<target>.<filter>.<bonus-type>
```

Their change mode is ignored; DnD4e applies them as bonuses and handles 4e stacking from `<bonus-type>`. Untyped bonuses and penalties stack.

### Scopes

| Scope | Meaning |
| --- | --- |
| `power` | Match properties of the power being used. Also use this for a creature's defence against a matching incoming power. |
| `weapon` | Match properties of the weapon or implement being used. |
| `effect` | Match properties of an effect, normally for saves or save DCs. |
| `grants` | Match an attack made **against** this creature and modify the attacker's roll for that attack. |

The important distinction:

- `power.defence...` changes this creature's defence against a matching incoming power.
- `grants.attack...` changes the attacker's roll when the attacker targets this creature. Use a negative value when the creature imposes an attack penalty.

### Targets

```text
attack  damage  defence  save  saveDC
```

### Filters

Filters are internal, case-sensitive power, weapon, effect, or damage properties. Multiple dot-separated filters are **AND** conditions. Comma-separated filters are **OR** conditions. Use `global` when no narrower filter is needed.

Common filters:

```text
global  opp  melee  ranged  weapon  usesImplement
vsAc  vsFort  vsRef  vsWil  fire  cold  radiant
```

| Effect | Key and value |
| --- | --- |
| +2 AC against opportunity attacks | `power.defence.opp.vsAc.untyped = 2` |
| +2 AC against all attacks | `power.defence.vsAc.untyped = 2` |
| Target grants +2 to incoming attacks | `grants.attack.global.untyped = 2` |
| Target imposes −2 on incoming attacks | `grants.attack.global.untyped = -2` |
| +1 attack with fire powers | `power.attack.fire.untyped = 1` |
| +2 damage with melee weapon powers | `power.damage.meleeWeapon.untyped = 2` |
| +2 to saves against enchantment effects | `effect.save.enchantment.untyped = 2` |
| Extra fire damage | `power.damage.fire.roll = 1d6[fire]` |

### AC capitalization warning

DnD4e 0.9.3 constructs the runtime AC filter as `vsAc`, not `vsAC`:

```text
power.defence.vsAc.untyped
```

`vsAC` does not match because filtering is case-sensitive. This was confirmed with an Aura Effects recipient: the aura correctly created a normal effect with `flags.auraeffects.fromAura`, but DnD4e rejected the `vsAC` filter. The same capitalization pattern gives `vsFort`, `vsRef`, and `vsWil`.

## Variables in effect values

Active Effect values use actor roll data. With **Use Source Actor Data** enabled, a transferred effect resolves variables from its source actor when applied. Otherwise, values are evaluated from the affected actor where the roll permits it.

### Actor aliases

| Variable | Value |
| --- | --- |
| `@strMod`, `@conMod`, `@dexMod`, `@intMod`, `@wisMod`, `@chaMod` | Ability modifiers |
| `@maxMod` | Highest ability modifier |
| `@lv` | Level |
| `@lvhalf` | Half level, rounded down |
| `@tier` | Tier number: 1, 2, or 3 |
| `@heroic`, `@paragon`, `@epic` | `1` in that tier, otherwise `0` |
| `@heroicOrParagon` | `1` below level 21 |
| `@paragonOrEpic` | `1` at level 11 or higher |
| `@bloodied` | `1` while bloodied |
| `@enhArmour` | AC enhancement bonus |
| `@enhNAD` | Lowest Fortitude, Reflex, or Will enhancement bonus |
| `@name` | Actor name |
| `@charaID`, `@charaUID` | Actor ID and UUID |

### Actor data paths

Actor `system` properties are available without the `system.` prefix:

```text
@abilities.str.value
@abilities.str.mod
@attributes.hp.value
@attributes.hp.max
@defences.ac.value
@defences.fort.value
@details.level
@details.saves.value
@movement.base.value
@modifiers.attack.value
@resistances.cold.value
@skills.arc.value
@resources.primary.value
```

### Status variables

Use `@statuses.<status-key>`. The value is `1` when the actor has the status and `0` otherwise.

```text
@statuses.prone
@statuses.dazed
@statuses.stunned
@statuses.blinded
@statuses.bloodied
```

For example, `5 * @statuses.prone` evaluates to `5` while prone and `0` otherwise.

### Custom variables

An Active Effect key beginning with `@` defines a custom variable for later formulae:

```text
@MyBonus = 2
```

It can then be referenced as `@MyBonus`. `@atkMod` and `@dmgMod` are conventional custom variables and exist only if something defines them.

### Formula helper

Use `scale(level, offset)` for tier-style scaling:

```text
scale(@lv, 1)
```

The older `@scale` and `@scale4` variables are not provided by `Actor4e.getRollData()` in 0.9.3.

### Power- and weapon-only variables

These belong to an item/power roll and should not be assumed to exist in a general actor-owned Active Effect value:

```text
@mod  @powerMod  @powerLevel  @itemLevel
@wepAttack  @wepDamage  @wepCritBonus  @wepDice  @wepMax
@powBase  @powMax  @enhance  @profBonus
@impAttack  @impDamage  @isCharge  @isOpp  @item.*
```

Use `@lv` or `@details.level` for actor level; `@level` is not a built-in actor alias in DnD4e 0.9.3.