#import "theme.typ" as theme;
#import "ancestries.typ" as ancestry;
#import "powers.typ" as powers;

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
#let powerCard(id) = {
  let value = entry(id)
  let range = display(value.range.type)
  if "distance" in value.range {
    range += " " + str(value.range.distance)
  }
  powers.power(
    title: value.title,
    description: value.flavor,
    type: (AT_WILL: "At-Will", ENCOUNTER: "Encounter", DAILY: "Daily").at(value.usage),
    action: powers.actionType.at((MINOR: "minor", FREE: "free", MOVE: "move", NO_ACTION: "noAction", IMMEDIATE_REACTION: "immediateReaction", IMMEDIATE_INTERRUPT: "immediateInterrupt").at(value.action)),
    range: range,
    traits: if value.keywords.len() > 0 { value.keywords.map(display).join(", ") } else { none },
    target: value.at("target", default: none),
    trigger: value.at("trigger", default: none),
    offenseStat: if "attack" in value { display(value.attack.ability) } else { none },
    defenseStat: if "attack" in value and value.attack.defense != none { display(value.attack.defense) } else { none },
    bonusAttackText: if "attackText" in value { theme.featDescription(value.attackText) } else { none },
    additionalRows: value.rows.map(row => [
      *#row.label:* #theme.featDescription(row.text)
      #if "scaling" in row {
        list(..row.scaling.map(scale => [Level #scale.atLevel: #text(scale.text)]))
      }
    ]),
  )
}
