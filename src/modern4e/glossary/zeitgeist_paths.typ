#import "../helpers/theme.typ" as theme;
#import "../helpers/path_content.typ" as paths;

#let zeitgeistPathsPage() = [
  #theme.pageTitle(title: paths.catalog.document.title)
  <zeitgeist-paragon-paths>

  #paths.introduction()

  #table(
    columns: (1fr, 1fr),
    stroke: 0.5pt + theme.tableDivider,
    fill: theme.defaultTableStyle(),
    inset: 6pt,
    [*Path*], [*Associated theme*],
    ..paths.overview(),
  )

  #paths.source()

  #pagebreak()
  #theme.subPageTitle(title: paths.entry("modern4e.path.applied-astronomist").title)
  #columns(2)[
    #paths.flavor("modern4e.path.applied-astronomist")
    #paths.prerequisite("modern4e.path.applied-astronomist")
    = Level 11 Features
    #paths.feature("modern4e.feature.applied-astronomist-stargazer")
    #paths.feature("modern4e.feature.applied-astronomist-touching-the-wheel-of-heaven")
    #paths.feature("modern4e.feature.applied-astronomist-walking-the-cosmos")
    #paths.rule("modern4e.rule.path-applied-astronomist-supplement-1")
    #paths.feature("modern4e.feature.applied-astronomist-space-travel", level: 16)
    #colbreak()
    #paths.powerCard("modern4e.power.path-heavenly-flare")

    #paths.rule("modern4e.rule.path-applied-astronomist-supplement-2")
    #paths.powerCard("modern4e.power.path-straddling-realities")

    #paths.powerCard("modern4e.power.path-cataclysmic-conjunction")
  ]

  #pagebreak()
  #theme.subPageTitle(title: "Applied Astronomist: Planar Zones", outlined: false)
  #columns(2)[
    #paths.rule("modern4e.rule.path-applied-astronomist-supplement-3")
    #paths.rule("modern4e.rule.path-applied-astronomist-supplement-4")
    #paths.rule("modern4e.rule.path-applied-astronomist-supplement-5")
    #paths.rule("modern4e.rule.path-applied-astronomist-supplement-6")
    #paths.rule("modern4e.rule.path-applied-astronomist-supplement-7")
    #colbreak()
    #paths.rule("modern4e.rule.path-applied-astronomist-supplement-8")
    #paths.rule("modern4e.rule.path-applied-astronomist-supplement-9")
    #paths.rule("modern4e.rule.path-applied-astronomist-supplement-10")
    #paths.rule("modern4e.rule.path-applied-astronomist-supplement-11")
  ]

  #pagebreak()
  #theme.subPageTitle(title: paths.entry("modern4e.path.logos").title)
  #columns(2)[
    #paths.flavor("modern4e.path.logos")
    #paths.prerequisite("modern4e.path.logos")
    = Level 11 Features
    #paths.feature("modern4e.feature.logos-fiat")
    #paths.feature("modern4e.feature.logos-pathos-of-the-inanimate")
    #paths.feature("modern4e.feature.logos-ethos-of-the-unwilling", level: 16)
    #colbreak()
    #paths.powerCard("modern4e.power.path-make-it-so")

    #paths.powerCard("modern4e.power.path-inexplicable-narration")

    #paths.powerCard("modern4e.power.path-revoke-agency")
  ]

  #pagebreak()
  #theme.subPageTitle(title: paths.entry("modern4e.path.mad-shootist").title)
  #columns(2)[
    #paths.flavor("modern4e.path.mad-shootist")
    #paths.prerequisite("modern4e.path.mad-shootist")
    = Level 11 Features
    #paths.feature("modern4e.feature.mad-shootist-inventive-gunnery")
    #paths.feature("modern4e.feature.mad-shootist-autofire")
    #paths.feature("modern4e.feature.mad-shootist-piercing-shot")
    #paths.feature("modern4e.feature.mad-shootist-rocket-launcher", level: 16)
    #colbreak()
    #paths.powerCard("modern4e.power.path-beam-shot")

    #paths.powerCard("modern4e.power.path-mobility-shot")

    #paths.powerCard("modern4e.power.path-hyper-beam")
  ]

  #pagebreak()
  #theme.subPageTitle(title: paths.entry("modern4e.path.monument-of-war").title)
  #columns(2)[
    #paths.flavor("modern4e.path.monument-of-war")
    #paths.prerequisite("modern4e.path.monument-of-war")
    = Level 11 Features
    #paths.feature("modern4e.feature.monument-of-war-instant-boot-camp")
    #paths.feature("modern4e.feature.monument-of-war-fearless-mein")
    #paths.feature("modern4e.feature.monument-of-war-do-you-want-to-live-forever", level: 16)
    #paths.powerCard("modern4e.power.path-remembrance-of-the-human-shield")

    #colbreak()
    #paths.powerCard("modern4e.power.path-shell-shock")

    #paths.powerCard("modern4e.power.path-cannon-overture")
  ]

  #pagebreak()
  #theme.subPageTitle(title: paths.entry("modern4e.path.notorious-celebrity").title)
  #columns(2)[
    #paths.flavor("modern4e.path.notorious-celebrity")
    #paths.prerequisite("modern4e.path.notorious-celebrity")
    = Level 11 Features
    #paths.feature("modern4e.feature.notorious-celebrity-roll-with-a-posse")
    #paths.feature("modern4e.feature.notorious-celebrity-center-of-attention")
    #paths.feature("modern4e.feature.notorious-celebrity-crowd-effect", level: 16)
    #colbreak()
    #paths.powerCard("modern4e.power.path-one-upmanship")

    #paths.powerCard("modern4e.power.path-summon-audience")

    #paths.powerCard("modern4e.power.path-shock-and-awe")
  ]

  #theme.subPageTitle(title: "Your Posse", outlined: false)
  #columns(2)[
    #paths.rule("modern4e.rule.path-notorious-celebrity-supplement-12")
    #paths.rule("modern4e.rule.path-notorious-celebrity-supplement-13")
    #paths.rule("modern4e.rule.path-notorious-celebrity-supplement-14")
    #paths.rule("modern4e.rule.path-notorious-celebrity-supplement-15")
    #colbreak()
    #paths.rule("modern4e.rule.path-notorious-celebrity-supplement-16")
    #paths.rule("modern4e.rule.path-notorious-celebrity-supplement-17")
    #paths.rule("modern4e.rule.path-notorious-celebrity-supplement-18")
  ]

  #pagebreak()
  #theme.subPageTitle(title: paths.entry("modern4e.path.polyhistor").title)
  #columns(2)[
    #paths.flavor("modern4e.path.polyhistor")
    #paths.prerequisite("modern4e.path.polyhistor")
    = Level 11 Features
    #paths.feature("modern4e.feature.polyhistor-elementary-stances")
    #paths.feature("modern4e.feature.polyhistor-combat-focus")
    #paths.feature("modern4e.feature.polyhistor-two-targets")
    #paths.feature("modern4e.feature.polyhistor-multiple-targets")
    #paths.feature("modern4e.feature.polyhistor-perfect-aim")
    #colbreak()
    #paths.powerCard("modern4e.power.path-decipher-technique")

    #paths.feature("modern4e.feature.polyhistor-combat-transcendence", level: 16)
    #paths.powerCard("modern4e.power.path-masterstroke")
  ]

  #pagebreak()
  #theme.subPageTitle(title: "Polyhistor: Elementary Stances", outlined: false)
  #columns(2)[
    #paths.rule("modern4e.rule.path-polyhistor-supplement-19")
    #paths.rule("modern4e.rule.path-polyhistor-supplement-20")
    #paths.rule("modern4e.rule.path-polyhistor-supplement-21")
    #paths.rule("modern4e.rule.path-polyhistor-supplement-22")
    #paths.rule("modern4e.rule.path-polyhistor-supplement-23")
    #paths.rule("modern4e.rule.path-polyhistor-supplement-24")
    #colbreak()
    #paths.rule("modern4e.rule.path-polyhistor-supplement-25")
    #paths.rule("modern4e.rule.path-polyhistor-supplement-26")
    #paths.rule("modern4e.rule.path-polyhistor-supplement-27")
  ]

  #pagebreak()
  #theme.subPageTitle(title: paths.entry("modern4e.path.steamsuit-pilot").title)
  #columns(2)[
    #paths.flavor("modern4e.path.steamsuit-pilot")
    #paths.prerequisite("modern4e.path.steamsuit-pilot")
    #paths.feature("modern4e.feature.steamsuit-pilot-steam-steel", level: 11)
    #paths.feature("modern4e.feature.steamsuit-pilot-defensive-shield")
    #colbreak()
    #paths.powerCard("modern4e.power.path-power-fist")

    #paths.powerCard("modern4e.power.path-redline-rush")

    #paths.feature("modern4e.feature.steamsuit-pilot-quick-don", level: 16)
    #paths.powerCard("modern4e.power.path-steam-blast")
  ]

  #pagebreak()
  #theme.subPageTitle(title: paths.entry("modern4e.path.urban-empath").title)
  #columns(2)[
    #paths.flavor("modern4e.path.urban-empath")
    #paths.prerequisite("modern4e.path.urban-empath")
    = Level 11 Features
    #paths.feature("modern4e.feature.urban-empath-every-building-a-welcoming-home")
    #paths.feature("modern4e.feature.urban-empath-urban-bond")
    #paths.feature("modern4e.feature.urban-empath-every-window-an-eye", level: 16)
    #colbreak()
    #paths.powerCard("modern4e.power.path-the-city-comes-alive")

    #paths.powerCard("modern4e.power.path-the-city-whispers")

    #paths.powerCard("modern4e.power.path-the-city-marches-to-war")
  ]

  #pagebreak()
  #theme.subPageTitle(title: paths.entry("modern4e.path.vekeshi-excoriant").title)
  #columns(2)[
    #paths.flavor("modern4e.path.vekeshi-excoriant")
    #paths.prerequisite("modern4e.path.vekeshi-excoriant")
    = Level 11 Features
    #paths.feature("modern4e.feature.vekeshi-excoriant-dreadnought")
    #paths.feature("modern4e.feature.vekeshi-excoriant-threefold-presence")
    #paths.feature("modern4e.feature.vekeshi-excoriant-live-for-vengeance", level: 16)
    #paths.powerCard("modern4e.power.path-vision-of-the-fall")

    #colbreak()
    #paths.powerCard("modern4e.power.path-triune-blessing")

    #paths.powerCard("modern4e.power.path-aspect-of-srasama")
  ]
]
