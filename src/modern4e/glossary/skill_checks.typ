#import "../helpers/theme.typ" as theme;

#let dcTable(rows: ()) = {
  table(
    columns: (4em, 4em, 5em, 4em, 5em),
    stroke: 0.5pt + theme.tableDivider,
    align: horizon,
    fill: theme.defaultTableStyleWithFirstColumnHeaders(),
    inset: 6pt,
    [*Level*], [*Easy*], [*Normal*], [*Hard*], [*Extreme*],
    ..rows,
  )
}

#let skillChecksPage() = {
  return [
    #theme.pageTitle(title: "Skill Checks");
    = Skills

    #grid(
      columns: (1fr, 1fr),
      gutter: 1cm,
      [
        Through skills, you can show what specializations your character has. Each skill is tied to a specific ability, which is shown on the right.

        == Proficiency
        You may be proficient in a skill through your background, class or some other method. When you are proficient in a skill, you add a +5 bonus to any roll made with that skill.

        = Making a skill check
        Whenever an adventurer tries to do something while outside of combat, the GM may call for a Skill check. The GM will say what ability fits the action the most and then the adventurer rolls 1D20 + their points in that ability + any other bonuses that may apply, such as their background.

        Each Skill check has a target number that needs to be hit, that is the Difficulty Class (DC). When rolling for a Skill check, decide whether you want it be an Easy, Normal, Hard, or Extreme task, and use the corresponding DC from the table below, then compare your total roll to that DC to determine the degree of success:

        - If you rolled equal to or greater than the DC, you succeed, but pay a cost in the form of a minor hurdle, unless you qualify for perfect success.
        - For Normal and Hard tasks, if you rolled equal to or greater than the next higher step in difficulty, you succeed perfectly.
        - If you rolled less than the DC, you fail, and something bad happens, unless you qualify for catastrophic failure.
        - For Normal and Hard tasks, if you rolled equal to or lower than the previous step in difficulty, you fail catastrophically.
        - Easy and Extreme tasks cannot result in perfect success or catastrophic failure based on the total roll.
        - Natural 20s are always a perfect success, and something extra happens; natural 1s are always a catastrophic failure. These outcomes override the other rules, including for Easy and Extreme tasks.

        The table below shows the DCs for each level and difficulty, it is generally recommended to use the level of the characters for deciding the DC. For when you want a bit of leeway, use the DCs of 1 or 2 levels lower or higher than the characters.

      ],
      [
        #table(
          columns: (1fr, 1fr),
          stroke: 0.5pt + theme.tableDivider,
          align: horizon,
          fill: theme.defaultTableStyle(),
          inset: 4pt,
          [*Skill*], [*Ability*],
          [Acrobatics], [Dexterity],
          [Stealth], [Dexterity],
          [Thievery], [Dexterity],
          [Bluff], [Charisma],
          [Diplomacy], [Charisma],
          [Intimidate], [Charisma],
          [Endurance], [Constitution],
          [Arcana], [Intelligence],
          [Crafting], [Intelligence],
          [Society], [Intelligence],
          [Medicine], [Intelligence],
          [Athletics], [Strength],
          [Insight], [Wisdom],
          [Nature], [Wisdom],
          [Perception], [Wisdom],
          [Religion], [Wisdom],
        )
      ],
    );

    = DC By Level
    #columns(3)[
      #dcTable(rows: (
        [1], [7], [12], [17], [22],
        [2], [8], [13], [18], [23],
        [3], [8], [13], [18], [23],
        [4], [9], [14], [19], [24],
        [5], [10], [15], [20], [25],
        [6], [10], [15], [20], [25],
        [7], [11], [16], [21], [26],
        [8], [11], [16], [21], [26],
        [9], [12], [17], [22], [27],
        [10], [13], [18], [23], [28],
      ))

      #colbreak()

      #dcTable(rows: (

        [11], [14], [19], [24], [29],
        [12], [15], [20], [25], [30],
        [13], [15], [20], [25], [30],
        [14], [16], [21], [26], [31],
        [15], [17], [22], [27], [32],
        [16], [17], [22], [27], [32],
        [17], [18], [23], [28], [33],
        [18], [18], [23], [28], [33],
        [19], [19], [24], [29], [34],
        [20], [20], [25], [30], [35],
      ))

      #colbreak()

      #dcTable(rows: (

        [21], [21], [26], [31], [36],
        [22], [22], [27], [32], [37],
        [23], [22], [27], [32], [37],
        [24], [23], [28], [33], [38],
        [25], [24], [29], [34], [39],
        [26], [24], [29], [34], [39],
        [27], [25], [30], [35], [40],
        [28], [25], [30], [35], [40],
        [29], [26], [31], [36], [41],
        [30], [27], [32], [37], [42],
      ))
    ]
  ]
}
