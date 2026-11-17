// Only class inventory files are loaded. Feat/path catalogs retain their own readers.
#let inventory = json("../content/classes/catalog.json")
#let entries = {
  let result = (:)
  for (category, files) in inventory.files {
    for file in files {
      for entry in json("../content/classes/" + file).at(category) {
        assert(not (entry.id in result), message: "Duplicate class-content ID: " + entry.id)
        result.insert(entry.id, entry)
      }
    }
  }
  result
}
#let advancement = json("../content/classes/advancement.json")
#let entry(id) = entries.at(id)
