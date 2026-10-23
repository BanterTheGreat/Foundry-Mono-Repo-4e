#import "shared.typ";
#import "theme.typ";
#import "state.typ" as state;

#let bannerColor = rgb("#17333d");
#let bannerMuted = rgb("#c0d5d8");

#let referenceLabel(title) = text(
  upper(title),
  size: 8pt,
  weight: "bold",
  tracking: 0.7pt,
  fill: bannerMuted,
);

#let referenceSection(title, body) = block(above: 9pt, below: 0pt)[
  #line(length: 100%, stroke: 0.4pt + white.transparentize(75%))
  #v(4pt)
  #referenceLabel(title)
  #v(4pt)
  #body
];

#let proficiencyContent(value) = {
  if type(value) == array { value.join([, ]) } else { value }
};

#let proficiencies(
  armorProficiencies: none,
  weaponProficiencies: none,
  implementProficiencies: none,
) = {
  let rows = ()
  for (title, value) in (
    ("Armor", armorProficiencies),
    ("Weapons", weaponProficiencies),
    ("Implements", implementProficiencies),
  ) {
    if value != none and value != () {
      rows.push(block(above: 0pt, below: 5pt)[
        *#title* #linebreak()
        #proficiencyContent(value)
      ])
    }
  }
  referenceSection("Proficiencies", rows.join())
};

#let referenceFormula(title, formula) = block(above: 0pt, below: 5pt)[
  #text(size: 8.5pt, fill: bannerMuted, title)
  #linebreak()
  *#formula*
];

#let defensesAndHealth(
  fortitude: int,
  will: int,
  reflex: int,
  health: int,
  healthOnLevelUp: int,
  healingSurges: int,
) = [
  #referenceSection("Defenses", [
    #referenceFormula("Fortitude", [#fortitude + STR & CON])
    #referenceFormula("Reflex", [#reflex + INT & DEX])
    #referenceFormula("Willpower", [#will + WIS & CHA])
  ])
  #referenceSection("Health", [
    #referenceFormula("Base Health", [#(health - healthOnLevelUp) + CON × 2])
    #referenceFormula("Per Level", [#healthOnLevelUp × LEVEL])
    #referenceFormula("Healing Surges", [#healingSurges + CON])
  ])
];

#let abilities(mainAbilities: (str), class: str, extraAbilities: (str)) = {
  let hasChoice = type(mainAbilities) == array
  let extraAbilitiesText = if type(extraAbilities) == array {
    shared.join_with_or(input: extraAbilities)
  } else {
    extraAbilities
  }

  referenceSection("Abilities", [
    #set par(leading: 5pt, spacing: 6pt)
    #v(4pt)
    #if hasChoice [
      #rect(fill: theme.table1, stroke: none, inset: (x: 5pt, y: 3pt))[
        #text(size: 7pt, weight: "bold", fill: bannerColor)[REQUIRED · CHOOSE ONE]
      ]
      #v(5pt)
      #text(size: 8.5pt, fill: bannerMuted)[Choose your main ability:]
    ]
    #block(above: 6pt, below: 8pt)[
      #if hasChoice {
        let choices = ()
        for (index, ability) in mainAbilities.enumerate() {
          if index > 0 {
            choices.push(text(size: 8.5pt, fill: bannerMuted)[or])
          }
          choices.push(box(text(size: 14pt, weight: "bold", ability)))
        }
        stack(spacing: 3pt, ..choices)
        v(6pt)
        text(size: 11pt)[Your choice starts at *4 points.*]
      } else {
        text(size: 17pt, weight: "bold", mainAbilities)
        linebreak()
        text(size: 14pt)[starts at *4 points.*]
      }
    ]
    #text(size: 8.5pt, fill: bannerMuted)[
      #if hasChoice [Your chosen main ability is used for accuracy with most #class powers.] else [Your main ability, used for accuracy with most #class powers.]
    ]
    #block(above: 10pt, below: 0pt)[
      Powers also use *#extraAbilitiesText* for extra effects.
    ]

    #block(
      above: 10pt,
      below: 0pt,
      width: 100%,
      fill: theme.table1,
      inset: 7pt,
      [
        #set text(size: 9pt, fill: bannerColor)
        #set par(spacing: 5pt)
        #rect(fill: bannerColor, stroke: none, inset: (x: 4pt, y: 2pt))[
          #text(size: 7pt, weight: "bold", fill: white)[REQUIRED]
        ]
        #v(4pt)
        #text(size: 12pt, weight: "bold")[Assign 5 Points]
        #v(4pt)
        Distribute *5 points* across non-main abilities.
        #linebreak()
        Maximum *2 points* per ability.

        #line(length: 100%, stroke: 0.4pt + theme.tableDivider)
        #v(2pt)
        #text(size: 8.5pt, fill: rgb("#49616a"))[
          *Optional:* Lower an ability to −1 to increase another non-main ability by 1 point, even above the 2-point maximum.
        ]
      ],
    )
  ])
};

#let referenceBanner(className: str, reference: content, width: relative, height: relative, topInset: 4mm) = {
  // Match the cover banner's paired state updates to keep ability chips out of this panel.
  state.defaultAbilityFormattingEnabled.update(false)
  set text(size: 9pt, fill: theme.bgColor)
  set par(leading: 2pt, spacing: 4pt)

  stack(
    spacing: 0pt,
    block(
      width: width,
      height: height - 4mm,
      fill: bannerColor,
      inset: (x: 3mm, top: topInset, bottom: 4mm),
      [
        #line(length: 100%, stroke: 2pt + theme.tableHeader)
        #v(7pt)
        #referenceLabel("Class reference")
        #v(3pt)
        #text(font: "Merriweather", size: 16pt, weight: "bold", className)
        #reference
      ],
    ),
    polygon(
      fill: bannerColor,
      stroke: none,
      (0pt, 0pt),
      (width, 0pt),
      (width / 2, 4mm),
    ),
  )
  state.defaultAbilityFormattingEnabled.update(true)
};

#let classOverview(className: str, reference: content, body) = context {
  let margins = page.margin
  let sideMargin(side) = if type(margins) == dictionary {
    margins.at(side, default: margins.at("rest", default: 1cm))
  } else {
    margins
  }
  let leftMargin = sideMargin("left")
  let rightMargin = sideMargin("right")
  let topMargin = sideMargin("top")
  let bottomMargin = sideMargin("bottom")
  let bannerWidth = (page.width - leftMargin - rightMargin) * 23 / 100
  let startLabel = label("class-overview-" + className)

  set columns(gutter: 5mm)
  set page(
    columns: 1,
    margin: (
      left: leftMargin + bannerWidth + 5mm,
      right: rightMargin,
      top: topMargin,
      bottom: bottomMargin,
    ),
    background: context {
      let starts = query(startLabel)
      if starts.len() > 0 and here().page() == starts.first().location().page() {
        place(
          top + left,
          dx: leftMargin,
          dy: 0pt,
          referenceBanner(
            className: className,
            reference: reference,
            width: bannerWidth,
            height: page.height * 90 / 100,
            topInset: topMargin + 4mm,
          ),
        )
      }
    },
  )

  [#metadata(className)#startLabel]
  body
};

// Continuations return to the normal page width after the first-page reference banner.
#let classFeatures(body) = {
  set page(columns: 2)
  set columns(gutter: 5mm)
  body
};
