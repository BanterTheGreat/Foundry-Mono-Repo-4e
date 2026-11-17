#import "../helpers/theme.typ" as theme;
#import "../helpers/theme_content.typ" as themes;

#let zeitgeistThemesPage() = [
  Choose one of these nine themes to connect your character to the Zeitgeist setting. A theme's role describes the capabilities it adds; it need not match your class's role. You gain its starting benefits at level 1 and its additional benefits at levels 5 and 10. Theme powers are granted by the theme, rather than purchased with utility picks.

  #table(
    columns: (auto, auto, 1fr),
    stroke: 0.5pt + theme.tableDivider,
    fill: theme.defaultTableStyleWithFirstColumnHeaders(),
    inset: 6pt,
    [*Theme*], [*Role*], [*Concept*],
    ..themes.overview(),
  )

  = Using these themes
  These themes use the local skill names and proficiency rules. References to a primary ability modifier mean the points in your Main Ability. Use the local skill-check formula and DC table; the source's Medium difficulty is Normal here. The HOMEBREW instruction to ignore old theme skill bonuses does not apply to these Zeitgeist benefits.

  Prestige, favors, and requisitions use the campaign rules in the Player's Guide (Prestige, p. 20; requisitions, p. 22). A theme that changes starting Prestige sets it to 2 instead of 1; it does not add 1 for every character with that theme. Suggested paragon paths below are pointers to the guide, not additional theme benefits.

  The associated paths are collected in #link(<zeitgeist-paragon-paths>)[Zeitgeist Paragon Paths] on page #context counter(page).at(<zeitgeist-paragon-paths>).first().

  *Source:* _Zeitgeist Player's Guide: The Investigation Begins_, pp. 7–16, including the original theme illustrations.

  #pagebreak()
  #theme.subPageTitle(title: themes.entry("modern4e.theme.docker").title)
  #columns(2)[
    #themes.role("modern4e.theme.docker")

    #themes.prose("modern4e.theme.docker", "text-1")

    #themes.prose("modern4e.theme.docker", "text-2")

    = Playing a Docker
    #themes.prose("modern4e.theme.docker", "text-3")

    #themes.prose("modern4e.theme.docker", "text-4")

    #align(center)[
      #image("../images/zeitgeist-themes/docker.jpg", width: 100%, height: 10.5cm, fit: "contain")
    ]

    #colbreak()

    #themes.benefit("modern4e.feature.docker-level-1", level: 1)

    #themes.powerCard("modern4e.power.docker-s-jank")

    #themes.benefit("modern4e.feature.docker-level-5", level: 5)

    #themes.benefit("modern4e.feature.docker-level-10", level: 10)

    = Further connections
    #themes.prose("modern4e.theme.docker", "text-9")
  ]

  #pagebreak()
  #theme.subPageTitle(title: themes.entry("modern4e.theme.eschatologist").title)
  #columns(2)[
    #themes.role("modern4e.theme.eschatologist")

    #themes.prose("modern4e.theme.eschatologist", "text-1")

    #themes.prose("modern4e.theme.eschatologist", "text-2")

    = Playing an Eschatologist
    #themes.prose("modern4e.theme.eschatologist", "text-3")

    #themes.prose("modern4e.theme.eschatologist", "text-4")

    #align(center)[
      #image("../images/zeitgeist-themes/eschatologist.jpg", width: 100%, height: 10.5cm, fit: "contain")
    ]

    #colbreak()

    #themes.benefit("modern4e.feature.eschatologist-level-1", level: 1)

    #themes.powerCard("modern4e.power.icy-end-of-the-earth")

    #themes.benefit("modern4e.feature.eschatologist-level-5", level: 5)

    #themes.benefit("modern4e.feature.eschatologist-level-10", level: 10)

    = Further connections
    #themes.prose("modern4e.theme.eschatologist", "text-9")
  ]

  #pagebreak()
  #theme.subPageTitle(title: themes.entry("modern4e.theme.gunsmith").title)
  #columns(2)[
    #themes.role("modern4e.theme.gunsmith")

    #themes.prose("modern4e.theme.gunsmith", "text-1")

    #themes.prose("modern4e.theme.gunsmith", "text-2")

    = Playing a Gunsmith
    #themes.prose("modern4e.theme.gunsmith", "text-3")

    #align(center)[
      #image("../images/zeitgeist-themes/gunsmith.jpg", width: 100%, height: 10.5cm, fit: "contain")
    ]

    #colbreak()

    #themes.benefit("modern4e.feature.gunsmith-level-1", level: 1)

    #themes.powerCard("modern4e.power.the-man-with-two-guns-is-god")

    #themes.benefit("modern4e.feature.gunsmith-level-5", level: 5)

    #themes.benefit("modern4e.feature.gunsmith-level-10", level: 10)

    = Further connections
    #themes.prose("modern4e.theme.gunsmith", "text-9")
  ]

  #pagebreak()
  #theme.subPageTitle(title: "Gunsmith Modifications", outlined: false)
  #columns(2)[
    #themes.modification("modern4e.feature.gunsmith-alchemical-launcher")

    #themes.modification("modern4e.feature.gunsmith-ammunition-clip")

    #themes.modification("modern4e.feature.gunsmith-cover-piercing-bullets")

    #colbreak()

    #themes.modification("modern4e.feature.gunsmith-sniper-scope")

    #themes.modification("modern4e.feature.gunsmith-suppressor")

  ]

  #pagebreak()
  #theme.subPageTitle(title: themes.entry("modern4e.theme.martial-scientist").title)
  #columns(2)[
    #themes.role("modern4e.theme.martial-scientist")

    #themes.prose("modern4e.theme.martial-scientist", "text-1")

    #themes.prose("modern4e.theme.martial-scientist", "text-2")

    = Playing a Martial Scientist
    #themes.prose("modern4e.theme.martial-scientist", "text-3")

    #themes.prose("modern4e.theme.martial-scientist", "text-4")

    #align(center)[
      #image("../images/zeitgeist-themes/martial-scientist.jpg", width: 100%, height: 10.5cm, fit: "contain")
    ]

    #colbreak()

    #themes.benefit("modern4e.feature.martial-scientist-level-1", level: 1)

    #themes.powerCard("modern4e.power.experimental-strike")

    #themes.benefit("modern4e.feature.martial-scientist-level-5", level: 5)

    #themes.benefit("modern4e.feature.martial-scientist-level-10", level: 10)

    = Further connections
    #themes.prose("modern4e.theme.martial-scientist", "text-11")
  ]

  #pagebreak()
  #theme.subPageTitle(title: themes.entry("modern4e.theme.skyseer").title)
  #columns(2)[
    #themes.role("modern4e.theme.skyseer")

    #themes.prose("modern4e.theme.skyseer", "text-1")

    #themes.prose("modern4e.theme.skyseer", "text-2")

    = Playing a Skyseer
    #themes.prose("modern4e.theme.skyseer", "text-3")

    #themes.prose("modern4e.theme.skyseer", "text-4")

    #align(center)[
      #image("../images/zeitgeist-themes/skyseer.jpg", width: 100%, height: 10.5cm, fit: "contain")
    ]

    #colbreak()

    #themes.benefit("modern4e.feature.skyseer-level-1", level: 1)

    #themes.powerCard("modern4e.power.skyseer-vision")

    #themes.powerCard("modern4e.power.look-skyward")

    #themes.benefit("modern4e.feature.skyseer-level-5", level: 5)

    #themes.benefit("modern4e.feature.skyseer-level-10", level: 10)

    = Further connections
    #themes.prose("modern4e.theme.skyseer", "text-9")
  ]

  #pagebreak()
  #theme.subPageTitle(title: themes.entry("modern4e.theme.spirit-medium").title)
  #columns(2)[
    #themes.role("modern4e.theme.spirit-medium")

    #themes.prose("modern4e.theme.spirit-medium", "text-1")

    #themes.prose("modern4e.theme.spirit-medium", "text-2")

    = Playing a Spirit Medium
    #themes.prose("modern4e.theme.spirit-medium", "text-3")

    #align(center)[
      #image("../images/zeitgeist-themes/spirit-medium.jpg", width: 100%, height: 10.5cm, fit: "contain")
    ]

    #colbreak()

    #themes.benefit("modern4e.feature.spirit-medium-level-1", level: 1)

    #themes.powerCard("modern4e.power.speak-with-spirit")

    #themes.powerCard("modern4e.power.unfinished-business")

    #themes.benefit("modern4e.feature.spirit-medium-level-5", level: 5)

    #themes.benefit("modern4e.feature.spirit-medium-level-10", level: 10)

    = Further connections
    #themes.prose("modern4e.theme.spirit-medium", "text-8")
  ]

  #pagebreak()
  #theme.subPageTitle(title: themes.entry("modern4e.theme.technologist").title)
  #columns(2)[
    #themes.role("modern4e.theme.technologist")

    #themes.prose("modern4e.theme.technologist", "text-1")

    = Playing a Technologist
    #themes.prose("modern4e.theme.technologist", "text-2")

    #themes.prose("modern4e.theme.technologist", "text-3")

    #align(center)[
      #image("../images/zeitgeist-themes/technologist.jpg", width: 100%, height: 10.5cm, fit: "contain")
    ]

    #colbreak()

    #themes.benefit("modern4e.feature.technologist-level-1", level: 1)

    #themes.powerCard("modern4e.power.disposable-simulacrum")

    #themes.benefit("modern4e.feature.technologist-level-5", level: 5)

    #themes.benefit("modern4e.feature.technologist-level-10", level: 10)

    = Further connections
    #themes.prose("modern4e.theme.technologist", "text-10")
  ]

  #pagebreak()
  #theme.subPageTitle(title: themes.entry("modern4e.theme.vekeshi-mystic").title)
  #columns(2)[
    #themes.role("modern4e.theme.vekeshi-mystic")

    #themes.prose("modern4e.theme.vekeshi-mystic", "text-1")

    #themes.prose("modern4e.theme.vekeshi-mystic", "text-2")

    = Playing a Vekeshi Mystic
    #themes.prose("modern4e.theme.vekeshi-mystic", "text-3")

    #themes.prose("modern4e.theme.vekeshi-mystic", "text-4")

    #align(center)[
      #image("../images/zeitgeist-themes/vekeshi-mystic.jpg", width: 100%, height: 10.5cm, fit: "contain")
    ]

    #colbreak()

    #themes.benefit("modern4e.feature.vekeshi-mystic-level-1", level: 1)

    #themes.powerCard("modern4e.power.hands-of-retribution")

    #themes.benefit("modern4e.feature.vekeshi-mystic-level-5", level: 5)

    #themes.benefit("modern4e.feature.vekeshi-mystic-level-10", level: 10)

    = Further connections
    #themes.prose("modern4e.theme.vekeshi-mystic", "text-10")
  ]

  #pagebreak()
  #theme.subPageTitle(title: themes.entry("modern4e.theme.yerasol-veteran").title)
  #columns(2)[
    #themes.role("modern4e.theme.yerasol-veteran")

    #themes.prose("modern4e.theme.yerasol-veteran", "text-1")

    #themes.prose("modern4e.theme.yerasol-veteran", "text-2")

    = Playing a Yerasol Veteran
    #themes.prose("modern4e.theme.yerasol-veteran", "text-3")

    #themes.prose("modern4e.theme.yerasol-veteran", "text-4")

    #align(center)[
      #image("../images/zeitgeist-themes/yerasol-veteran.jpg", width: 100%, height: 10.5cm, fit: "contain")
    ]

    #colbreak()

    #themes.benefit("modern4e.feature.yerasol-veteran-level-1", level: 1)

    #themes.powerCard("modern4e.power.display-of-heroism")

    #themes.benefit("modern4e.feature.yerasol-veteran-level-5", level: 5)

    #themes.benefit("modern4e.feature.yerasol-veteran-level-10", level: 10)

    = Further connections
    #themes.prose("modern4e.theme.yerasol-veteran", "text-9")
  ]
]
