#import "../helpers/theme.typ" as theme;

#let bondsPage() = {
  return [
    #columns(2)[
      #theme.pageTitle(title: "Bonds");
      What connects your adventurer to their fellow adventurers? In moments of struggle, what motivates them to push even harder? Bonds represent the relationships your adventurer has formed with others, and can provide both roleplaying opportunities and mechanical benefits.

      = What is a bond
      Bonds are your connection to specific characters in the world. They represent your relationships and how you interact with others. You always have a bond with at least two of your fellow adventurers, and may have additional bonds with PCs, NPCs, nations, kingdoms or organizations your character has a strong emotion towards. You can have up to 6 bonds total.

      = Creating a Bond
      #columns(2)[
        To create a bond, match an intensity and a nature from the table to the right, and intepret them as makes sense. Bonds are your strongest view of the other  character, and not necessarily reciprocal (your tense doubts is
        their playful rivalry). You can change or create a bond anytime, such as in response to something they've done or something new you've learned about them.

        #colbreak();
        #table(
          columns: (1fr, 1fr),
          stroke: theme.tableDivider,
          align: left,
          fill: theme.defaultTableStyle(),
          inset: 4pt,
          [*Intensity*], [*Nature*],
          [Deep], [Admiration],
          [Growing], [Inferiority],
          [Playful], [Loyalty],
          [Lowkey], [Mistrust],
          [Curious], [Affection],
          [Tense], [Hatred],
          [Shrinking], [Hatred],
        )
      ]

      = Invoking a Bond.
      Once per session when you dislike the result of an out-of-combat roll, you can invoke a bond you got to perform a reroll, you may use the result of either rolls.
      To invoke a bond, describe how your feelings towards the subject of the bond influence you to perform better on the action in question.

      == Invoking to fail
      You may invoke your bond to intentially fail a roll. This is useful for roleplaying situations where your adventurer's feelings towards the subject of the bond cause them to hesitate, falter, or make an otherwise unwise decision. If you decide to fail a roll this way, you gain a single reroll which you may use in any situation.

      #image("../images/bonds.jpg")
    ]
  ]
}

