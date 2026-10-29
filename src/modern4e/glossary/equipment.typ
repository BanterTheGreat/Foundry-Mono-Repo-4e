#import "../helpers/theme.typ" as theme;

#let weaponTable(equipment: ()) = {
  return table(
    columns: (1fr, 1fr, 1fr, 1fr, 1fr),
    stroke: 0.5pt + theme.tableDivider,
    align: left,
    fill: theme.defaultTableStyle(),
    inset: 8pt,
    [*Weapon*],
    [*Proficiency Bonus*],
    [*Damage*],
    [*Properties*],
    [*Weapon Category*],
    ..equipment,
  )
}

#let armorTable(equipment: ()) = {
  return table(
    columns: (1fr, 1fr, 1fr, 1fr),
    stroke: 0.5pt + theme.tableDivider,
    align: left,
    fill: theme.defaultTableStyle(),
    inset: 8pt,
    [*Armor*],
    [*Armor Bonus*],
    [*Speed Penalty*],
    [*Skill Penalty*],
    ..equipment,
  )
}

#let equipmentPage() = {
  return [
    #theme.pageTitle(title: "Equipment");

    = Weapons
    == Improvised One-Handed Melee Weapons
    #weaponTable(equipment: (
      "Unarmed Attack",
      "",
      "1d4",
      "",
      "Unarmed",
    ))

    == Simple One-Handed Melee Weapons
    #weaponTable(equipment: (
      "Club",
      "+2",
      "1d6",
      "Off-hand",
      "Club",
      "Dagger",
      "+3",
      "1d4",
      "Off-hand, Thrown",
      "Light Blade",
      "Handaxe",
      "+2",
      "1d6",
      "Thrown 5/10",
      "Axe",
      "Javelin",
      "+2",
      "1d6",
      "Thrown 5/10",
      "Spear",
      "Mace",
      "+2",
      "1d8",
      "None, Implement",
      "Hammer",
      "Sickle",
      "+2",
      "1d6",
      "Off-hand",
      "Light Blade",
    ))

    == Simple Two-Handed Melee Weapons
    #weaponTable(equipment: (
      "Greatclub",
      "+2",
      "1d10",
      "None",
      "Club",
      "Quarterstaff",
      "+2",
      "1d8",
      "Versatile, Implement",
      "Staff",
      "Spear",
      "+2",
      "1d8",
      "Thrown 5/10",
      "Spear",
    ))

    == Simple One-Handed Ranged Weapons
    #weaponTable(equipment: (
      "Pistol",
      "+2",
      "2d4",
      "Load Standard, Ranged 10/20, Brutal 2, High Crit, Off-Hand",
      "Firearm",
    ))

    == Simple Two-Handed Ranged Weapons
    #weaponTable(equipment: (
      "Sling",
      "+2",
      "1d6",
      "Ranged 20/40",
      "Sling",
      "Light Crossbow",
      "+2",
      "1d8",
      "Load Minor, Ranged 15/30",
      "Crossbow",
      "Carbine",
      "+2",
      "2d6",
      "Load Standard, Ranged 15/30, brutal 2, High Crit",
      "Firearm",
      "Shotgun",
      "+2",
      "2d8",
      "Load Standard, Ranged 3/6",
      "Firearm",
    ))

    #pagebreak();

    == Military One-Handed Melee Weapons
    #weaponTable(equipment: (
      "Battleaxe",
      "+3",
      "1d10",
      "Versatile",
      "Axe",
      "Flail",
      "+3",
      "1d8",
      "None",
      "Flail",
      "Longsword",
      "+3",
      "1d8",
      "Versatile",
      "Heavy Blade",
      "Pick",
      "+3",
      "1d8",
      "Brutal",
      "Hammer",
      "Rapier",
      "+3",
      "1d8",
      "High Crit",
      "Light Blade",
      "Scimitar",
      "+3",
      "1d8",
      "None",
      "Heavy Blade",
      "Shortsword",
      "+3",
      "1d6",
      "Off-hand",
      "Light Blade",
      "Warhammer",
      "+3",
      "1d10",
      "Versatile",
      "Hammer",
    ))

    == Military One-Handed Ranged Weapons
    #weaponTable(equipment: (
      "Throwing Hammer",
      "+3",
      "1d6",
      "Thrown 5/10",
      "Hammer",
      "Throwing Shield",
      "+3",
      "1d6",
      "Thrown 5/10, Defensive",
      "Shield",
    ))

    == Military Two-Handed Melee Weapons
    #weaponTable(equipment: (
      "Glaive",
      "+3",
      "1d10",
      "Reach, Versatile",
      "Heavy Blade",
      "Greataxe",
      "+3",
      "1d12",
      "Brutal",
      "Axe",
      "Greatsword",
      "+3",
      "1d10",
      "High Crit",
      "Heavy Blade",
      "Halberd",
      "+3",
      "1d10",
      "Reach, Severe",
      "Polearm",
      "Longspear",
      "+3",
      "1d10",
      "Reach",
      "Spear",
      "Maul",
      "+3",
      "2d6",
      "Brutal",
      "Hammer",
      "Warpick",
      "+3",
      "1d12",
      "Severe",
      "Hammer",
    ))

    == Military Two-Handed Ranged Weapons
    #weaponTable(equipment: (
      "Composite Bow",
      "+3",
      "1d8",
      "Load Free, Ranged 20/40",
      "Bow",
      "Greatbow",
      "+3",
      "1d10",
      "Load Minor, Ranged 25/50",
      "Bow",
      "Heavy Crossbow",
      "+3",
      "1d10",
      "Load Minor, Ranged 20/40",
      "Crossbow",
      "Sling Staff",
      "+3",
      "1d10",
      "Ranged 15/30, Versatile",
      "Sling",
    ))

    #pagebreak();

    == Superior One-Handed Melee Weapons
    #weaponTable(equipment: (
      "Bastard Sword",
      "+3",
      "1d10",
      "Versatile",
      "Heavy Blade",
      "Double-Bladed Dagger",
      "+3",
      "1d8",
      "Off-hand",
      "Light Blade",
      "Parrying Dagger",
      "+3",
      "1d6",
      "Defensive, Off-hand",
      "Light Blade",
    ))

    == Superior Two-Handed Melee Weapons
    #weaponTable(equipment: (
      "Fullblade",
      "+3",
      "1d12",
      "Brutal, Severe",
      "Heavy Blade",
      "Execution Axe",
      "+3",
      "1d12",
      "High Crit",
      "Axe",
      "Spiked Chain",
      "+3",
      "2d4",
      "Reach, Versatile",
      "Flail",
    ))

    == Superior Ranged Weapons
    #weaponTable(equipment: (
      "Recurve Bow",
      "+3",
      "1d8",
      "Ranged 25/50, Load Free",
      "Bow",
      "Repeating Heavy Crossbow",
      "+3",
      "1d10",
      "Load Free, Ranged 25/50",
      "Crossbow",
      "Musket",
      "+3",
      "2d8",
      "Load Standard, Ranged 20/40, Brutal 2, High Crit",
      "Firearm",
    ))

    = Properties
    #columns(3)[
      == Balanced
      A balanced weapon is particularly easy to maneuver under pressure. A proficient character wielding only weapons with the balanced property reduces their armor check penalty to skill and ability checks by 2 while in combat, and when you replace the ability score for the melee basic attack power or ranged basic attack power using a balanced weapon, you may use the full replacement ability score, rather than half, for the associated damage roll.

      == Brutal
      A brutal weapon's minimum damage is higher than that of a normal weapon. When rolling the damage from a weapon attack made with a brutal weapon, reroll any damage die that displays a value of 2 or lower until it shows 3 or greater, then use the new value.

      == Defensive
      A defensive weapon grants you a +1 bonus to AC while you wield at least one defensive weapon you are proficient with. Multiple defensive weapons do not stack.

      == Implement
      A weapon with the Implement property may be used as an implement, even if they are held in only one hand.

      == Severe
      A severe weapon's maximum damage is higher than that of a normal weapon.
      When rolling the damage from a weapon attack made with a severe weapon, whenever you roll a die that displays its maximum value, that die explodes: roll a second damage die of the same size, and add these dice to the original roll as extra damage.


      == High Crit
      A high crit weapon deals more damage when you score a critical hit with it.
      A critical hit with a weapon attack deals maximum rolled damage and an extra [W] based on level:
      - 1[W] at 1st–5th levels
      - 2[W] at 6th–10th levels
      - 3[W] at 11th–15th levels
      - 4[W] at 16th–20th levels
      - 5[W] at 21st–25th levels
      - 6[W] at 26th–30th levels
      This extra damage is in addition to any critical damage the weapon supplies if it is a magic weapon.

      == Innocuous
      Weapons with the innocuous keyword easily pass as peaceful tools.
      A character visibly carrying only an innocuous weapon adds its proficiency bonus to any check made to pretend they are not armed.

      == Thrown
      A thrown weapon may be used to make ranged attacks without penalty.
      You hurl most thrown weapons from your hand, rather than using the weapon to loose a projectile.

      A thrown weapon with a specified load speed is instead a launcher that can be used with enchanted ammunition if desired-- the launcher is not thrown at the target.


      == Versatile
      Versatile weapons are one-handed but deal bonus damage and qualify as a two-handed weapon for power riders and requirements when supported with a second hand.
      This bonus is equal to:
      - +1 to each `[W]` die at levels 1–10
      - +2 at levels 11–20
      - +3 at levels 21–30

      The versatile bonus may be gained by supporting the weapon with an off-hand occupied by a light shield or weapon in the unarmed group, but no bonuses from the item equipped in the off-hand apply to the attack, and the unarmed weapon cannot be used to attack until the grip is released.
      Changing grip is a free action.
    ]

    = Armor
    == Light Armor

    #armorTable(equipment: (
      "Cloth",
      "Intelligence or Dexterity",
      "-",
      "-0",
      "Leather",
      "Intelligence + 2 or Dexterity + 2",
      "-",
      "-0",
      "Hide",
      "Intelligence + 3 or Dexterity + 3",
      "-",
      "-0",
    ))

    == Heavy Armor
    #armorTable(equipment: (
      "Chainmail",
      "+6",
      "-1",
      "-0",
      "Scale",
      "+7",
      "-1",
      "-0",
      "Plate",
      "+9",
      "-1",
      "-1",
    ))

    == Shields
    #armorTable(equipment: (
      "Light Shield",
      "+1",
      "-",
      "-0",
      "Heavy Shield",
      "+2",
      "-",
      "-1",
    ))

    *Skill Penalty:* The penalty to Strength-, Dexterity-, and Constitution-based skill checks that a creature takes while wearing the armor. This penalty is called an armor check penalty.
  ]
}

Armor
Armor Bonus
Speed Penalty
Cloth
-
-
Leather
+2
-
Hide
+3
-

Heavy Armor
Armor
Armor Bonus
Speed Penalty
Chainmail
+6
-1
Scale
+7
-1
Plate
+9
-1

Shields
Shield
Armor Bonus
Speed Penalty
Light Shield
+1
-
Heavy Shield
+2
-

