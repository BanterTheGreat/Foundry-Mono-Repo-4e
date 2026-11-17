// Rules live in JSON; page geometry remains in the chapter.
#let rules = json("../content/creation/standard.json")
#let abilityText(value) = {
  if value.type == "CLASS" { "See class" }
  else if value.type == "NONE" { "—" }
  else { "+" + str(value.amount) + " to " + ("NON_MAIN": "non-main", "MAIN": "main", "ALL": "all").at(value.type) }
}
#let eventText(event) = {
  if event.operation == "GRANT_FEATURES" { event.target }
  else { lower(event.operation) + " " + str(event.count) + " " + event.target }
}
#let levelLabel(level) = str(level) + if level == 1 or level == 21 { "st" } else if level == 2 or level == 22 { "nd" } else if level == 3 or level == 23 { "rd" } else { "th" }
#let tableCells() = {
  let cells = ()
  for row in rules.levels {
    let features = row.events.map(eventText).join("; ")
    // Preserve the source table's deliberate unbreakable paragon-entry cell.
    let featureCell = if row.level == 11 { block(features, breakable: false) } else { text(features) }
    let totals = row.powerTotals
    cells += (text(levelLabel(row.level)), text(abilityText(row.abilityIncrease)), featureCell,
      text(str(row.featTotal)), text((totals.atWill, totals.encounter, totals.daily, totals.utility).map(str).join("/")))
  }
  cells
}
