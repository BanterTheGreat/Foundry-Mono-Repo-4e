// Shared path authoring is literal data; this adapter owns presentation only.
#import "class_text.typ": classText;
#import "power_content.typ" as powers;

#let catalog = json("../content/paths/zeitgeist.json")
#let themes = json("../content/themes/zeitgeist.json").themes
#let entries = {
  let result = (:)
  for category in ("paths", "features", "rules", "powers") {
    for value in catalog.at(category) {
      assert(not (value.id in result), message: "Duplicate path entry: " + value.id)
      result.insert(value.id, value)
    }
  }
  result
}
#let entry(id) = entries.at(id)
#let introduction() = classText(catalog.document.introduction)
#let source() = [*Source:* #emph(catalog.document.source)]
#let overview() = catalog.paths.map(value => (
  text(value.title), text(themes.find(theme => theme.id == value.themeId).title),
)).flatten()
#let flavor(id) = { classText(entry(id).flavor); parbreak() }
#let prerequisite(id) = { [*Prerequisite:* #classText(entry(id).prerequisiteText)]; parbreak() }
#let feature(id, level: none) = {
  let value = entry(id)
  if level == none {
    [*#value.title:* #classText(value.description)]
  } else {
    heading("Level " + str(level) + ": " + value.title, level: 1)
    classText(value.description)
  }
  parbreak()
}
#let rule(id) = {
  for section in entry(id).sections {
    if section.type == "heading" {
      heading(section.title, level: section.level)
    } else { classText(section.text); parbreak() }
  }
}
#let powerCard(id) = powers.powerCard(entry(id))
