#import "theme.typ";

#let at-will-color = rgb("#5b8f2b")
#let encounter-color = rgb("#9e3b30")
#let daily-color = rgb("#3042e9")

#let powerType = (
  at-will: "At-Will",
  encounter: "Encounter",
  daily: "Daily",
  utility: "Utility",
)

#let actionType = (
  standard: "Standard Action",
  move: "Move Action",
  minor: "Minor Action",
  free: "Free Action",
  reaction: "Reaction",
  noAction: "No Action",
  immediateInterrupt: "Immediate Interrupt",
  immediateReaction: "Immediate Reaction",
  opportunity: "Opportunity Action",
)

#let attackType = (
  default: "Default",
  primary: "Primary Attack",
  secondary: "Secondary Attack",
)

#let offense = (
  strength: "Strength",
  dexterity: "Dexterity",
  constitution: "Constitution",
  wisdom: "Wisdom",
  intelligence: "Intelligence",
  charisma: "Charisma",
  mainCharacteristic: "Main Characteristic",
)

#let defense = (
  ac: "AC",
  will: "Will",
  reflex: "Reflex",
  fortitude: "Fortitude",
)

#let createAttack = (offense: str, defense: str) => {
  return (
    offense: offense,
    defense: defense,
    display: () => offense + " vs. " + defense,
  )
}

// Keep metadata side by side where it fits; narrow class columns need stacked rows.
#let metadataRow(leftContent, rightContent) = layout(size => {
  if measure(leftContent).width + measure(rightContent).width + 6pt <= size.width {
    grid(
      columns: (1fr, auto),
      align: (left + top, right + top),
      leftContent,
      rightContent,
    )
  } else {
    stack(
      spacing: 3pt,
      leftContent,
      align(right, rightContent),
    )
  }
})

#let power = (
  title: str,
  description: none,
  type: powerType,
  range: content,
  traits: none,
  action: actionType,
  target: none,
  bonusAttackText: none,
  offenseStat: none,
  defenseStat: none,
  additionalRows: (content),
  isSpecial: false,
  attackType: attackType.default,
  trigger: none,
  requirement: none,
  bonusTitle: none,
  fill: theme.rowStripes,
) => {
  let color = (
    "At-Will": at-will-color,
    "Encounter": encounter-color,
    "Daily": daily-color,
  ).at(type, default: at-will-color)

  return block(
    [#text(
      table(
        columns: 1fr,
        stroke: (left: 1.5pt + color, rest: none),
        align: left,
        fill: fill,
        inset: 6pt,
        [
          #metadataRow(
            text(weight: 700, size: 11pt)[#title],
            text(weight: 700, size: 11pt)[
              #if (bonusTitle != none) [#bonusTitle | ]#text([#type #if isSpecial [(Special)]])
            ],
          )

          #if description != none [
            #v(-5pt);
            _#text(description)_
            #v(-5pt);
          ] else {
            [
              #v(-7pt);
            ]
          }

          #theme.fadingLine();
          #v(-5pt);

          #metadataRow(
            grid(
              columns: (auto, auto),
              align: (left + top, right + horizon),
              image("../svgs/magnify.svg", height: 1em),
              [#h(2pt)#text(if traits == none { "None" } else { traits }, weight: "bold")],
            ),

            grid(
              columns: (auto, auto),
              align: (right + horizon, left + top),
              [#text(action, weight: "bold") #h(2pt)], image("../svgs/action.svg", height: 1em),
            ),
          );

          #v(-5pt);

          #metadataRow(
            grid(
              columns: (auto, auto),
              align: (left + top, right + horizon),
              image("../svgs/ruler.svg", height: 1em), [#h(2pt)#text(range, weight: 0)],
            ),

            grid(
              columns: (auto, auto),
              align: (right + horizon, left + top),
              if (target != none) [
                #target#h(2pt)
              ],
              if (target != none) [
                #image("../svgs/target.svg", height: 1em)
              ],
            ),
          );

          #if (
            requirement != none
              or trigger != none
              or (offenseStat != none and defenseStat != none)
              or bonusAttackText != none
          ) [
            #v(-15pt)
          ]

          #if requirement != none [#linebreak() *Requirement:* #requirement]
          #if trigger != none [#linebreak()   *Trigger:* #trigger]
          #if offenseStat != none and defenseStat != none [#linebreak()
            *Attack:* #offenseStat vs. #defenseStat#if bonusAttackText != none [.]]
          #if bonusAttackText != none [ #bonusAttackText ]

          #for row in additionalRows [
            #v(-5pt)
            #line(length: 100%, stroke: (paint: theme.tableDivider, thickness: 0.5pt))
            #v(-5pt)
            #row
          ]
        ],
      ),
      size: 9pt,
    )],
    breakable: false,
  )
}
