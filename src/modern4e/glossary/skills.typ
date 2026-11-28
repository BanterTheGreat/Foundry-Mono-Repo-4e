#import "../helpers/configuration.typ" as config
#import "../helpers/revised_rules.typ" as revised
#import "../helpers/theme.typ" as theme

#let rulesTable(columns, headers, rows) = table(
  columns: columns,
  stroke: theme.tableDivider,
  fill: theme.defaultTableStyle(),
  align: left,
  inset: 5pt,
  table.header(..headers.map(strong)),
  ..rows.flatten().map(value => if type(value) == int { str(value) } else { value }),
)

#let dcTable(start) = rulesTable(
  (auto, 1fr, 1fr, 1fr, 1fr, 1fr),
  ("Level", "Very Easy", "Easy", "Normal", "Hard", "Very Hard"),
  range(start, start + 10).map(level => {
    let normal = revised.normalDcs.at(level - 1)
    (level, ..(-6, -3, 0, 3, 6).map(offset => normal + offset))
  }),
)

#let skillsPage() = [
  #theme.pageTitle(title: "Skills & Checks")

  #columns(2)[
    = Making a check
    Tell the GM what you want to do and how you plan to do it. If the result is uncertain, the GM chooses the skill that fits the task and the ability that fits your approach. Roll *1d20 + half your level (rounded down) + your ability points + your skill rank bonus*. Add any other bonuses or penalties that apply. When no skill fits, make an ability check with the same formula and skip the rank bonus.

    You might roll Dexterity with Stealth to slip past a lookout, or Wisdom with Stealth to spot a lookout who's hiding. You could use Charisma with Command to give an order, or Strength with Command to back up a threat by bending the bars of a gate.

    == Raising your ranks
    At certain levels, you get a fresh pool of Skill Points. Spend them to raise skills one rank at a time. You can split points across skills or buy several ranks in one skill as long as you stay within the rank limit. Any points left over expire when you reach your next level. In the *Heroic* tier, you can increase a skill up to Expert, in *Paragon*, Adept, and in *Epic*, Master


      #rulesTable(
        (1fr, auto, 1fr),
        ("Skill Points to Unlock", "Rank", "Skill Bonus"),
        (
          (1, "Novice", "+1"),
          (2, "Trained", "+3"),
          (3, "Expert", "+5"),
          (5, "Adept", "+7"),
          (8, "Master", "+9"),
        ),
      )

    For example: At level 4, you could spend all 3 points to raise a Trained skill to Expert, or spend 2 to raise a Novice skill to Trained and 1 to make another skill Novice.

    #colbreak()
    = The skill list <revised-skill-list>
    #rulesTable(
      (auto, auto, 1fr),
      ("Group", "Skill", "Use it to"),
      (
        ("Physical", "Athletics", "Climb, jump, swim, or vault over obstacles."),
        ("Physical", "Acrobatics", "Balance, tumble, or slip out of a restraint."),
        ("Physical", "Endurance", "Keep going through fatigue, harsh weather, or other physical strain."),
        ("Intrigue", "Stealth", "Move quietly, stay hidden, or spot someone trying to do the same."),
        ("Intrigue", "Finesse", "Perform acts of careful handwork."),
        ("Expertise", "Arcana", "Understand spells, wards, and enchanted devices."),
        ("Expertise", "Occultism", "Interpret omens, curses, and hauntings, or contact a spirit through a rite."),
        ("Expertise", "Crafting", "Make, repair, or examine objects, structures, and mechanisms."),
        ("Expertise", "Medicine", "Treat injuries, diagnose illness, or recognize signs of a wound."),
        (
          "Expertise",
          "Nature",
          "Read terrain and weather, track creatures, or identify plants, animals, and natural hazards, including underground.",
        ),
        ("Expertise", "Culture", "Recall history or understand local customs, laws, and institutions."),
        (
          "Expertise",
          "Religion",
          "Recognize religious symbols, beliefs, and rites, or identify undead and their traits.",
        ),
        ("Social", "Insight", "Read someone's emotions and intentions from what they say and do."),
        ("Social", "Streetwise", "Find people or information through informal local networks."),
        ("Social", "Deception", "Get someone to act on a lie, cover story, or misleading impression."),
        ("Social", "Command", "Get someone to act right away through authority, resolve, or a credible threat."),
      ),
    );
  ]



  #pagebreak()

  #columns(2)[
    == How to assign difficulty
    Pick a challenge level and a difficulty. Use the party's level as a starting point for challenges on par with the party. The target number is the Difficulty Class (DC). Compare the check total to the DC for the difficulty you chose.

    #rulesTable(
      (1fr, 2fr),
      ("Check total", "Outcome"),
      (
        (">=DC + 9", "Perfect success. You get what you were trying for."),
        (">=DC", "Success with consequences. You get what you wanted and face a cost or complication."),
        ("<DC", "Failure."),
      ),
    )

    A natural 1 is a failure. A natural 20 is a critical success, which gives you an extra benefit. Use the die result in either case, regardless of your total.

    For example, a level 4 character with Dexterity +4 and Expert Finesse adds 11 to the roll. Picking a Normal level 4 lock has DC 17. A roll of 6 opens it with a consequence. A roll of 15 gives a perfect success.

    #colbreak();

    == Difficulty Classes

    #dcTable(1),

    #dcTable(11),

    #dcTable(21),
  ]



  #pagebreak()
  = Skill training <revised-skill-training>
  Start Trained in one skill from your class and three other skills of your choice. Intelligence gives no extra skills. Every other skill starts Untrained, except for a Novice skill from a ZEITGEIST theme.

  #grid(
    columns: (1fr, 1fr),
    gutter: 12pt,
    rulesTable(
      (1fr, 1fr),
      ("Class", "Choose one"),
      (
        ("Artificer", "Crafting or Arcana"),
        ("Avenger", "Religion"),
        ("Barbarian", "Athletics"),
        ("Bard", "Occultism"),
        ("Cleric", "Religion"),
        ("Druid", "Nature"),
        ("Fighter", "Athletics or Acrobatics"),
        ("Invoker", "Religion"),
        ("Paladin", "Religion"),
        ("Ranger", "Acrobatics or Athletics"),
        ("Rogue", "Stealth, Finesse, or Deception"),
        ("Runepriest", "Religion or Crafting"),
        ("Shaman", "Occultism or Nature"),
        ("Sorcerer", "Arcana"),
        ("Swordmage", "Arcana"),
        ("Warden", "Nature or Endurance"),
        ("Warlock", "Occultism"),
        ("Warlord", "Command"),
        ("Wizard", "Arcana"),
      ),
    ),
    if config.isZeitgeistBuild [
      After choosing your four Trained skills, pick an Untrained skill from your theme's row and make it Novice. If both are already Trained, pick any Untrained skill.

      #rulesTable(
        (1fr, 1fr),
        ("ZEITGEIST theme", "Choose one"),
        (
          ("Docker", "Streetwise or Culture"),
          ("Eschatologist", "Culture or Insight"),
          ("Gunsmith", "Crafting or Arcana"),
          ("Martial Scientist", "Culture or Athletics"),
          ("Skyseer", "Nature or Occultism"),
          ("Spirit Medium", "Occultism or Insight"),
          ("Technologist", "Crafting or Finesse"),
          ("Vekeshi Mystic", "Religion or Insight"),
          ("Yerasol Veteran", "Endurance or Command"),
        ),
      )
    ] else [
      Homebrew themes currently grant no Novice skill.
    ],
  )
]
