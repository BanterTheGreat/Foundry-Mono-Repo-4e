#import "../helpers/theme.typ" as theme;

#let balanceChangesPage() = {
  [
    #theme.pageTitle(title: "Smaller Changes & Variant Rules");
    #columns(2)[
      = Player Facing

      == Action Points cleanses
      #theme.quoteBox([
        "Drats, I am stunned, well, see you the next round"
      ])

      *Players* may spend an Action Point to ignore the effects of the Stun condition on their turn. When using an Action Point in this way, they do not get any other benefits of the Action Point.

      == Melee Basic Attack versatility
      #theme.quoteBox([
        "Oh nice! A free basic melee attack, unfortunately I don't got any strength."
      ])

      All characters may use their Main Ability for Melee Basic Attacks, but only add half the bonus to the damage rolls if it is not Strength.

      == Baseline Versatile Expertise & Improved Defenses
      #theme.quoteBox([+1 Attack, Fort, Ref, and Will per tier (+1 at 1st, +2 at 11th, +3 at 21st)])

      Making these two feats baseline abrogates the "feat tax" of having to spend feat points on the objectively best feats in the game.

      == Defense rolls
      Instead of the DM rolling to attack the players, the players roll their defense rolls against the attack's bonus + 2. This increases engagement outside of their turns.

      A natural 1 on a defense roll means the enemy's attack scores a critical hit. A natural 20 means the enemy's attack critically fails and misses.

      If a power or feature would make the enemy reroll its attack, you instead roll your defense twice and use the better result.

      = DM facing

      == Monster Math
      #theme.quoteBox([
        "WHY WONT YOU DIE!"
      ])

      When using monsters, keep in mind to only use creatures from the Monster Manual 3 and Monster Vault unless absolutely neccessary.

      This is because the other monster books suffer from creatures dealing too little damage and having way too much health.

      == Intrinsic bonuses
      #theme.quoteBox(["What, another magic item? Add it to the pile"])
      By default, add only *+TIER to attack rolls, Fortitude, Reflex, and Will* (+1/+2/+3 by tier). This is the baseline bonus above; apply it only once.

      *Items still provide their normal bonuses* to attack, damage, AC, defenses, and critical-hit damage.

      The full table is *optional; GM opt-in only*.

      == Skill Changes
      Some skills got merged into other skills and renamed. 

      *Dungeoneering* is now part of Nature while some of their Utility powers have been taken by other skills. *Crafting* is a new skill that handles knowledge about mechanical devices as well as alchemy. Meanwhile *Streetwise* is now part of History which has been renamed to *Society*, *Religion* is now a Wisdom skill and *Heal* has been renamed to *Medicine* and taken to Intelligence.

      #colbreak();


      #block(fill: theme.headerColor, inset: 10pt, [
        #align(center)[
          == OPTIONAL VARIANT
          *Full intrinsic bonuses by level*
        ]

        *GM opt-in only.* Use this table to replace item progression. Its attack and defense totals already include the +TIER bonus; do not add that bonus again. Use an item's bonus instead wherever it is higher.

        #table(
          columns: (1fr, 1fr, 1fr, 1fr, 1fr),
          stroke: theme.tableDivider,
          align: left,
          fill: theme.defaultTableStyle(),
          inset: 4pt,
          [*Level*], [*Attack & Damage*], [*Crit*], [*AC*], [*Defenses*],
          [1], [+1], [–], [–], [+1],
          [2], [+2], [+1d6], [–], [+1],
          [3], [+2], [+1d6], [–], [+1],
          [4], [+2], [+1d6], [+1], [+1],
          [5], [+2], [+1d6], [+1], [+1],
          [6], [+2], [+1d6], [+1], [+1],
          [7], [+3], [+2d6], [+1], [+1],
          [8], [+3], [+2d6], [+1], [+1],
          [9], [+3], [+2d6], [+2], [+2],
          [10], [+3], [+2d6], [+2], [+2],
          [11], [+4], [+2d6], [+2], [+3],
          [12], [+5], [+3d6], [+2], [+3],
          [13], [+5], [+3d6], [+2], [+3],
          [14], [+5], [+3d6], [+3], [+4],
          [15], [+5], [+3d6], [+3], [+4],
          [16], [+5], [+3d6], [+3], [+4],
          [17], [+6], [+4d6], [+3], [+4],
          [18], [+6], [+4d6], [+3], [+4],
          [19], [+6], [+4d6], [+4], [+5],
          [20], [+6], [+4d6], [+4], [+5],
          [21], [+7], [+4d6], [+4], [+7],
          [22], [+8], [+5d6], [+4], [+7],
          [23], [+8], [+5d6], [+4], [+7],
          [24], [+8], [+5d6], [+5], [+8],
          [25], [+8], [+5d6], [+5], [+8],
          [26], [+8], [+5d6], [+5], [+8],
          [27], [+9], [+6d6], [+5], [+8],
          [28], [+9], [+6d6], [+5], [+8],
          [29], [+9], [+6d6], [+6], [+9],
          [30], [+9], [+6d6], [+6], [+9],
        )
      ])
    ]
  ]
}
