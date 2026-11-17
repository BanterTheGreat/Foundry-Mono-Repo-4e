#import "theme.typ" as theme;
#import "ancestries.typ" as ancestry;
#import "power_content.typ" as powers;

// Closed catalog; content strings are rendered as text, never evaluated as Typst.
#let catalog = json("../content/ancestries/catalog.json")
#let entries = {
  let result = (:)
  for file in catalog.files {
    let data = json("../content/ancestries/" + file)
    for category in ("ancestries", "features", "powers") {
      for value in data.at(category) {
        assert(not (value.id in result), message: "Duplicate ancestry entry: " + value.id)
        result.insert(value.id, value)
      }
    }
  }
  result
}
#let entry(id) = entries.at(id)
#let display(value) = value.split("_").map(word => upper(word.first()) + lower(word.slice(1))).join(" ")
#let attributes(id) = {
  let value = entry(id).attributes
  let languages = value.languages.fixed.map(display).join(" ")
  if value.languages.choiceCount > 0 {
    languages += " + " + str(value.languages.choiceCount)
  }
  ancestry.attributes(size: display(value.size), speed: value.speed, vision: display(value.vision), languages: languages)
}
#let trait(id) = {
  let value = entry(id)
  heading(value.title, level: 2)
  text(value.description)
  parbreak()
}
#let powerCard(id) = powers.powerCard(entry(id))
