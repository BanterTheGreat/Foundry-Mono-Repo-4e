#import "class_text.typ": classText;
#import "configuration.typ" as config;
#import "revised_rules.typ" as revised;

#let catalog = json("../content/equipment/equipment.json")
#assert(catalog.schemaVersion == 1, message: "Unsupported equipment authoring schema")
#let entries = catalog.equipment.map(entry => (entry.id, entry)).fold((:), (result, pair) => {
  result.insert(pair.at(0), pair.at(1))
  result
})
#let properties = catalog.properties.map(property => (property.id, property)).fold((:), (result, pair) => {
  result.insert(pair.at(0), pair.at(1))
  result
})
#let display(value) = value.split("_").map(word => upper(word.first()) + lower(word.slice(1))).join(" ")
#let number(value) = if value < 0 { "-" + str(calc.abs(value)) } else { str(value) }
#let signed(value) = if value >= 0 { "+" + number(value) } else { number(value) }

#let propertyText(property) = {
  let title = properties.at(property.id).title
  if property.id == "LOAD" {
    title + " " + display(property.action)
  } else if property.at("range", default: none) != none {
    title + " " + str(property.range.normal) + "/" + str(property.range.long)
  } else if property.at("value", default: none) != none {
    title + " " + str(property.value)
  } else {
    title
  }
}

#let weaponRow(entry) = {
  let weapon = entry.equipment
  (
    entry.presentation.title,
    if weapon.proficiencyBonus == none { "" } else { signed(weapon.proficiencyBonus) },
    str(weapon.damage.diceCount) + "d" + str(weapon.damage.dieSize),
    if weapon.properties.len() > 0 { weapon.properties.map(propertyText).join(", ") }
    else if weapon.proficiencyCategory == "IMPROVISED" { "" } else { "None" },
    weapon.groups.map(display).join(", "),
  )
}

#let armorRow(entry) = {
  let armor = entry.equipment
  let speed = armor.speedModifier
  let check = armor.armorCheckModifier
  let bonus = if armor.kind == "SHIELD" {
    signed(armor.shieldBonus)
  } else if config.isRevisedRules {
    let heavy = armor.armorCategory == "HEAVY"
    speed = if heavy { -1 } else { 0 }
    check = if entry.id == "modern4e.armor.plate" { -1 } else { 0 }
    signed(revised.armorBonuses.at(entry.id.split(".").last()))
  } else if armor.armorCategory == "LIGHT" {
    catalog.armorRules.lightArmorAbilities.map(ability => {
      display(ability) + if armor.armorBonus == 0 { "" } else { " + " + str(armor.armorBonus) }
    }).join(" or ")
  } else {
    signed(armor.armorBonus)
  }
  (
    entry.presentation.title,
    bonus,
    if speed == 0 { "-" } else { number(speed) },
    if check == 0 { "-0" } else { number(check) },
  )
}

#let sectionRows(section) = section.entryIds.map(id => {
  let entry = entries.at(id)
  if entry.equipment.kind == "WEAPON" { weaponRow(entry) } else { armorRow(entry) }
}).flatten()

// Data stays literal: only the shared emphasis syntax and bullet lists render.
#let equipmentText(value) = {
  for (index, part) in value.split("`").enumerate() {
    if calc.odd(index) { raw(part) } else { classText(part) }
  }
}

#let propertyRule(value) = {
  for paragraph in value.split("\n\n") {
    for line in paragraph.split("\n") {
      if line.starts-with("- ") {
        list.item(equipmentText(line.slice(2)))
      } else {
        equipmentText(line)
        [ ]
      }
    }
    parbreak()
  }
}
