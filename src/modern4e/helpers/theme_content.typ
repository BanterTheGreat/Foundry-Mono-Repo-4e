// Theme prose is literal data, using the same safe renderer as class powers.
#import "class_text.typ": classText;
#import "power_content.typ" as powers;

#let catalog = json("../content/themes/zeitgeist.json")
#let entries = {
  let result = (:)
  for category in ("themes", "features", "powers") {
    for value in catalog.at(category) {
      assert(not (value.id in result), message: "Duplicate theme entry: " + value.id)
      result.insert(value.id, value)
    }
  }
  result
}
#let entry(id) = entries.at(id)
#let prose(id, section) = classText(entry(id).sections.at(section))
#let role(id) = [*Role: #powers.display(entry(id).role).*]
#let overview() = catalog.themes.map(value => (
  text(value.title), text(powers.display(value.role)), text(value.concept),
)).flatten()
#let benefit(id, level: none) = {
  let value = entry(id)
  if level != none {
    heading("Level " + str(level) + if level == 1 { "" } else { ": " + value.title }, level: 1)
  }
  classText(value.description)
}
#let modification(id) = {
  let value = entry(id)
  heading(value.title, level: 1)
  classText(value.description)
}
#let powerCard(id) = powers.powerCard(entry(id))
