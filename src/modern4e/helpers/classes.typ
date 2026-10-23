#import "class_reference.typ": classOverview, classFeatures, proficiencies, defensesAndHealth, abilities;
#import "powers.typ": powerType;
#import "theme.typ";
#import "class_flavor.typ" as flavor;
#import "state.typ" as state;
#import "configuration.typ" as config;

#let zeitgeistPathReference() = {
  if config.isZeitgeistBuild [
    #v(6pt)
    Also see #link(<zeitgeist-paragon-paths>)[Zeitgeist Paragon Paths] on page #context counter(page).at(<zeitgeist-paragon-paths>).first() for additional paths available to any class that meets their prerequisites.
  ]
}

#let armorProf = (
  cloth: "Cloth",
  leather: "Leather",
  hide: "Hide",
  chainmail: "Chainmail",
  scale: "Scale",
  plate: "Plate",
  lightShield: "Light Shield",
  heavyShield: "Heavy Shield",
  light: "Light Armor",
  heavy: "Heavy Armor",
  shields: "Shields",
)

#let weaponProf = (
  simpleMelee: "Simple Melee",
  simpleRanged: "Simple Ranged",
  militaryMelee: "Military Melee",
  militaryRanged: "Military Ranged",
  superiorMelee: "Superior Melee",
  superiorRanged: "Superior Ranged",
  dagger: "Dagger",
  quarterstaff: "Quarterstaff",
  handCrossbow: "Hand Crossbow",
  shortSword: "Shortsword",
  sling: "Sling",
  staff: "Staff",
  militaryLightBlade: "Military Light Blade",
  militaryHeavyBlade: "Military Heavy Blade",
)

#let implementProf = (
  holySymbol: "Holy Symbol",
  orb: "Orb",
  staff: "Staff",
  wand: "Wand",
  tome: "Tome",
  rod: "Rod",
  dagger: "Dagger",
  totem: "Totem",
  lightBlade: "Light Blade",
  heavyBlade: "Heavy Blade",
)

#let powerLinks(className: str, extraContent: none, skipAtWill: false, skipPaths: false) = [

  #let utilitySources = (
    Artificer: "Arcane",
    Avenger: "Divine",
    Barbarian: "Martial and Primal",
    Bard: "Arcane",
    Cleric: "Divine",
    Druid: "Primal",
    Fighter: "Martial",
    Invoker: "Divine",
    Paladin: "Divine",
    Ranger: "Martial and Primal",
    Rogue: "Martial",
    Runepriest: "Divine",
    Shaman: "Primal",
    Sorcerer: "Arcane",
    Swordmage: "Martial and Arcane",
    Warden: "Primal",
    Warlock: "Arcane",
    Warlord: "Martial",
    Wizard: "Arcane",
  )

  = Feats & Utility Powers
  You gain access to *#className Powers*, *#className feats*, and *General Feats*, as well as *Generic Utility Powers* and *#utilitySources.at(className) Utility Powers*.

  #parbreak()

  #let getLinks = (power: powerType, level: (int)) => {
    let baseUrl = if power == powerType.at-will {
      "https://iws.mx/dnd/?list.full.power=%22__ClassName__%20Attack%20__Level__%22%20-%22__ClassName__%20Attack%20__Level__*%22%20At-Will%20-%22Daily%22%20-%22Encounter%22"
    } else if power == powerType.encounter {
      "https://iws.mx/dnd/?list.full.power=%22__ClassName__%20Attack%20__Level__%22%20-%22__ClassName__%20Attack%20__Level__*%22%20%22Encounter%22%20-%22Daily%22"
    } else if power == powerType.daily {
      "https://iws.mx/dnd/?list.full.power=%22__ClassName__%20Attack%20__Level__%22%20-%22__ClassName__%20Attack%20__Level__*%22%20%22Daily%22"
    } else if power == powerType.utility {
      "https://iws.mx/dnd/?list.full.power=%22__ClassName__%20Utility%20__Level__%22%20-%22__ClassName__%20Utility%20__Level__*%22%20%22Utility%22"
    }

    let powerText = if power == powerType.at-will {
      "At-Wills"
    } else if power == powerType.encounter {
      "Encounters"
    } else if power == powerType.daily {
      "Dailies"
    } else if power == powerType.utility {
      "Utilities"
    }

    // If level is an array, generate a link for each
    if type(level) == array {
      let links = level.map(l => {
        let url = baseUrl.replace("__ClassName__", className).replace("__Level__", str(l))
        theme.externalLink(url)[#str(powerText) #str(l)]
      })

      return links
    } else {
      let url = baseUrl.replace("__ClassName__", className).replace("__Level__", str(level))
      return (theme.externalLink(url)[#str(powerText) #str(level)])
    }
  }

  #let powerTable(title: str, ..linkArgs) = block(
    stroke: 1pt + rgb("#706853"),
    spacing: 0pt,
    table(
      columns: 1fr,
      stroke: none,
      align: center,
      fill: theme.defaultTableStyle(),
      inset: 6pt,
      title,
      ..linkArgs.pos()
    ),
  );


  #let baseParagonPathLink = "https://iws.mx/dnd/?list.full.paragonpath=-%22Dra***%22%20%2B%22Prerequisite%3A%20__ClassName__%22";
  #let paragonPathLink = baseParagonPathLink.replace("__ClassName__", className);


  #block(
    fill: theme.headerColor,
    inset: 10pt,
    [
      #align(center)[
        == Links to #className Powers & Paragon Paths
      ]

      #if (extraContent != none) {
        extraContent
        linebreak()
      }

      #if (skipAtWill == false) {
        powerTable(title: [At-Will], getLinks(power: powerType.at-will, level: 1))
        linebreak()
      }

      #powerTable(title: [Encounter], ..getLinks(power: powerType.encounter, level: (1, 3, 7, 13, 17, 23, 27)))
      #linebreak();
      #powerTable(title: [Daily], ..getLinks(power: powerType.daily, level: (1, 5, 9, 15, 19, 25, 29)))
      #linebreak();
      #powerTable(title: [Utility], ..getLinks(power: powerType.utility, level: (2, 6, 10, 16, 22, 26)))
      #linebreak();
      #if (skipPaths == false) {
        powerTable(title: [Paragon Path], ..(theme.externalLink(paragonPathLink)[View Paragon Paths],));
        zeitgeistPathReference()
      }
    ],
  )
];


#let commonTraits(commonTraits: none, class: str) = {
  block(
    fill: theme.headerColor,
    inset: 10pt,
    [
      = Common #class Traits
      #commonTraits;
    ],
  )
}

#let bannerPage(className: str) = {
  return [

    #state.defaultAbilityFormattingEnabled.update(false);
    // Specific highlighting rules for the banner page.
    #show regex("\\bIntelligence\\b"): it => theme.highlightInReverse(string: it);
    #show regex("\\bWisdom\\b"): it => theme.highlightInReverse(string: it);
    #show regex("\\bCharisma\\b"): it => theme.highlightInReverse(string: it);
    #show regex("\\bStrength\\b"): it => theme.highlightInReverse(string: it);
    #show regex("\\bDexterity\\b"): it => theme.highlightInReverse(string: it);
    #show regex("\\bConstitution\\b"): it => theme.highlightInReverse(string: it);

    #show regex("(Arcane|Divine|Primal|Martial)\\s+(Leader|Striker|Defender|Controller)"): it => text(
      it,
      weight: "bold",
    );

    #show heading.where(): it => {
      it.body; linebreak();
    }

    #let quote = flavor.getQuote(className: className);
    #let role = flavor.getRole(className: className);
    #let info = flavor.getInfo(className: className);

    #set page(
      background: image(flavor.getImage(className: className), fit: "stretch", width: 100%),
      footer: theme.footer(invert: true),
      margin: 0cm,
    )

    #set text(fill: white);

    #block(
      width: 100%,
      height: 100%,
      fill: gradient.linear(black, black, black.transparentize(50%), black.transparentize(100%)),
      inset: (top: 1cm),
      [
        #block(
          width: 40%,
          height: 100%,
          inset: (left: 1cm),
          [
            #set align(left)
            #text(
              upper(heading(className, level: 2, numbering: "1.")),
              size: 24pt,
              font: "Alfa Slab One",
            )
            #text(["#quote"], style: "italic");
            
            = What are they?
            #info;

            = Gameplay Role
            #role;
          ],
        )
      ],
    )

    #state.defaultAbilityFormattingEnabled.update(true);
  ]
}
