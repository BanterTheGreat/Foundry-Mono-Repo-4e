// The utility inventory owns content and selections; callers own book layout.
#import "power_content.typ": powerCard;

#let inventory = json("../content/utilities/catalog.json")
#let entries = {
  let result = (:)
  for file in inventory.files {
    for power in json("../content/" + file).powers {
      assert(not (power.id in result), message: "Duplicate utility ID: " + power.id)
      result.insert(power.id, power)
    }
  }
  result
}
#let section(id) = inventory.sections.find(value => value.id == id)
#let utilityEntries(id) = {
  let value = section(id)
  assert(value != none, message: "Missing utility section: " + id)
  assert(value.availability == "AVAILABLE", message: "Withheld utility section: " + id)
  value.powerIds.map(id => entries.at(id))
}
#let utilitySection(id) = {
  for power in utilityEntries(id) { powerCard(power) }
}
