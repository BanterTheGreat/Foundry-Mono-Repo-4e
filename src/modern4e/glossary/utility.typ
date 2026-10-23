#import "../helpers/theme.typ" as theme;
#import "../helpers/powers.typ";

#import "./utility/utility-strength.typ" as strength;
#import "./utility/utility-dexterity.typ" as dexterity;
#import "./utility/utility-constitution.typ" as constitution;
#import "./utility/utility-intelligence.typ" as intelligence;
#import "./utility/utility-wisdom.typ" as wisdom;
#import "./utility/utility-charisma.typ" as charisma;

#import "./utility/power-source-utilities.typ": powerSourceUtilities;
#import "./utility/skill-utilities.typ": skillUtilities;

#let utilityPage() = {
  return [

    #theme.bannerPage(
      title: "Utility Powers",
      content: [
        Most powers can be described as 'Attack' powers, these are powers which focus on harming your enemies in combat, whether directly through indirectly.
        Utility powers on the other hand focus on overcoming a variety of obstacles, both in and out of combat. Utility powers are split into in- and out of combat powers, where the in-combat powers focus on aiding you or your allies during combat, while out of combat powers focus increasing your versatility outside of combat.

        *Note:* Some powers count as both in and out of combat.

        Most skills have a set of Utility powers associated with it, this requires you to be proficient in the skill associated with the power as well as meet a minimum level to select. You may choose these whenever you gain an utility power.

        Power Source Utility Powers are shared by all classes of the matching source: *Arcane*, *Martial*, *Primal*, or *Divine*. Choose them with your out-of-combat utility picks, meeting their minimum level and all listed prerequisites. A shared source does not grant a beast companion, pact, class feature, or other prerequisite. Powers explicitly marked for both combat and non-combat can use either kind of utility pick.

        The power source lists replace the previous general and source-specific out-of-combat lists. The utility lists include powers of levels 2, 6, and 10.
      ],
      imageName: "utilities.jpg",
      width: 60%,
      gradient: gradient.linear(black, black, black.transparentize(50%), black.transparentize(100%)),
    )

    #theme.subPageTitle(title: "General Combat Utility Powers");
    = General Level 2
    #columns(2)[
      #dexterity.dexterityLevel2Combat();
      #constitution.constitutionLevel2();
      #intelligence.intelligenceLevel2Combat();
      #wisdom.wisdomLevel2Combat();
      #charisma.charismaLevel2Combat();
    ]

    #pagebreak();

    = General Level 6
    #columns(2)[
      #strength.strengthLevel6Combat();
      #dexterity.dexterityLevel6Combat();
      #constitution.constitutionLevel6();
      #intelligence.intelligenceLevel6Combat();
      #wisdom.wisdomLevel6Combat();
      #charisma.charismaLevel6Combat();
    ]

    #pagebreak();

    = General Level 10
    #columns(2)[
      #strength.strengthLevel10Combat();
      #dexterity.dexterityLevel10Combat();
      #constitution.constitutionLevel10();
      #intelligence.intelligenceLevel10Combat();
      #wisdom.wisdomLevel10Combat();
      #charisma.charismaLevel10Combat();
    ]

    #skillUtilities();

    #powerSourceUtilities();
  ]
}
