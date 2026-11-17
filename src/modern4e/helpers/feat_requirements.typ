// Render the shared closed condition vocabulary. Never interpret requirement prose.
#let references = json("../content/feat-references.json").entries
#let equipmentNames = (
  CLOTH: "cloth armor", LEATHER: "leather armor", HIDE: "hide armor",
  CHAINMAIL: "chainmail armor", SCALE: "scale armor", PLATE: "plate armor",
  SHIELD: "shields", LIGHT_SHIELD: "light shields", HEAVY_SHIELD: "heavy shields",
)

#let featTitles = {
  let files = json("../content/feat-sections.json").sections
  let titles = (:)
  for file in files {
    for feat in json("../content/feats/" + file).feats {
      titles.insert(feat.id, feat.title)
    }
  }
  titles
}

#let requirementText(node, nested: false) = {
  let kind = node.type
  if kind == "always" {
    ""
  } else if kind == "allOf" or kind == "anyOf" {
    let separator = if kind == "allOf" { ", " } else { " or " }
    let value = node.conditions.map(child => requirementText(child, nested: true)).join(separator)
    if nested { "(" + value + ")" } else { value }
  } else if kind == "level" {
    let level = node.minimum
    let suffix = if calc.rem(level, 100) >= 10 and calc.rem(level, 100) <= 20 {
      "th"
    } else {
      ("1": "st", "2": "nd", "3": "rd").at(str(calc.rem(level, 10)), default: "th")
    }
    str(level) + suffix + " level"
  } else if kind == "abilityPoints" {
    str(node.minimum) + " " + upper(node.ability.first()) + lower(node.ability.slice(1))
  } else if kind == "proficiency" {
    upper(node.skill.first()) + lower(node.skill.slice(1))
  } else if kind == "equipmentProficiency" {
    "Proficiency with " + equipmentNames.at(node.equipment)
  } else if kind == "entry" {
    if node.entryId in references {
      references.at(node.entryId).title
    } else {
      featTitles.at(node.entryId)
    }
  } else if kind == "classPowerSource" {
    "Any " + upper(node.powerSource.first()) + lower(node.powerSource.slice(1)) + " class"
  } else if kind == "size" {
    "Size " + upper(node.size.first()) + lower(node.size.slice(1))
  } else if kind == "selected" {
    if node.category == "FEAT" { "Any class-specific multiclass feat" } else { "Any encounter power with a level" }
  } else if kind == "unresolved" {
    node.text
  } else {
    panic("Unknown feat prerequisite type: " + kind)
  }
}

#let featRequirements(feat) = {
  let value = requirementText(feat.prerequisites)
  if value == "" { none } else { value }
}
