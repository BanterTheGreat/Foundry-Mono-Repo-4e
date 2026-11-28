#import "revised_rules.typ" as revised

// Rules live in JSON; page geometry remains in the chapter.
#let rules = json("../content/creation/standard.json")
#let eventText(event) = {
  if event.operation == "GRANT_FEATURES" { event.target }
  else { lower(event.operation) + " " + str(event.count) + " " + event.target }
}
#let levelLabel(level) = str(level) + if level == 1 or level == 21 { "st" } else if level == 2 or level == 22 { "nd" } else if level == 3 or level == 23 { "rd" } else { "th" }
#let tableCells() = {
  let cells = ()
  for row in rules.levels {
    let features = row.events.map(eventText)
    let increases = if row.level != 1 {
      revised.abilityIncrease(row.level)
    } else {
      "See class"
    }
    if str(row.level) in revised.skillIncreases {
      let points = revised.skillIncreases.at(str(row.level))
      features.push("gain " + str(points) + " skill points")
    }
    if row.level in revised.extraArmorLevels {
      features.push("+1 AC")
    }
    let summary = features.join("; ")
    // Preserve the source table's deliberate unbreakable paragon-entry cell.
    let featureCell = if row.level == 11 { block(summary, breakable: false) } else { text(summary) }
    let totals = row.powerTotals
    cells += (text(levelLabel(row.level)), text(increases), featureCell,
      text(str(row.featTotal)), text((totals.atWill, totals.encounter, totals.daily, totals.utility).map(str).join("/")))
  }
  cells
}
