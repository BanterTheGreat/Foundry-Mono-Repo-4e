#import "theme.typ";
#import "classes.typ" as classes;
#import "class_reference.typ" as reference;
#import "class_text.typ": classText;
#import "powers.typ" as powers;

#import "class_catalog.typ" as catalog;

#let entries = catalog.entries
#let entry = catalog.entry
#let advancement = catalog.advancement
#let display(value) = value.split("_").map(word => upper(word.first()) + lower(word.slice(1))).join(" ")

#let classReference(class) = {
  let prof = class.proficiencies
  let shields = if prof.shields == ("LIGHT_SHIELD", "HEAVY_SHIELD") {
    ("Shields",)
  } else {
    prof.shields.map(display)
  }
  classes.proficiencies(
    armorProficiencies: prof.armor.map(value => if value == "LIGHT" or value == "HEAVY" { display(value) + " Armor" } else { display(value) }) + shields,
    weaponProficiencies: prof.weapons.map(display),
    implementProficiencies: prof.implements.map(display),
  )
  let stats = class.statistics
  reference.referenceSection("Defenses", [
    #reference.referenceFormula("Fortitude", [#stats.defenses.FORTITUDE + STR & CON])
    #reference.referenceFormula("Reflex", [#stats.defenses.REFLEX + INT & DEX])
    #reference.referenceFormula("Willpower", [#stats.defenses.WILL + WIS & CHA])
  ])
  reference.referenceSection("Health", [
    #reference.referenceFormula("Base Health", [#stats.health.base + CON × #stats.health.constitutionMultiplier])
    #reference.referenceFormula("Per Level", [#stats.health.perLevel × LEVEL])
    #reference.referenceFormula("Healing Surges", [#stats.healingSurges.base + CON#if stats.healingSurges.constitutionMultiplier != 1 [ × #stats.healingSurges.constitutionMultiplier]])
  ])
  classes.abilities(
    mainAbilities: if class.abilities.main.len() == 1 { display(class.abilities.main.first()) } else { class.abilities.main.map(display) },
    extraAbilities: class.abilities.secondary.map(display),
    class: class.title,
  )
}

#let powerCard(power, fill: theme.rowStripes) = {
  let range = power.range
  let rangeText = if range.type == "PERSONAL" or range.type == "SPECIAL" {
    display(range.type)
  } else {
    display(range.type) + " " + if type(range.distance) == str { lower(range.distance) } else { str(range.distance) }
  }
  let rows = power.rows.map(row => [
    *#row.label:* #classText(row.text)
    #for scale in row.at("scaling", default: ()) [
      #linebreak()
      *Level #scale.atLevel:* #classText(scale.text)
    ]
  ])
  powers.power(
    title: power.title,
    description: power.at("flavor", default: none),
    type: (AT_WILL: "At-Will", ENCOUNTER: "Encounter", DAILY: "Daily").at(power.usage),
    action: powers.actionType.at((STANDARD: "standard", MOVE: "move", MINOR: "minor", FREE: "free", REACTION: "reaction", NO_ACTION: "noAction", IMMEDIATE_INTERRUPT: "immediateInterrupt", IMMEDIATE_REACTION: "immediateReaction", OPPORTUNITY: "opportunity").at(power.action)),
    range: rangeText,
    traits: power.keywords.map(display).join(", "),
    trigger: power.at("trigger", default: none),
    requirement: power.at("requirement", default: none),
    target: power.at("target", default: none),
    offenseStat: if "attack" in power { display(power.attack.ability) } else { none },
    defenseStat: if "attack" in power { if power.attack.defense == "AC" { "AC" } else { display(power.attack.defense) } } else { none },
    additionalRows: rows,
    fill: fill,
  )
}

#let featureBody(feature, fill: theme.rowStripes, showDescription: true) = {
  if showDescription {
    classText(feature.description)
    parbreak()
  }
  if "weaponAbilities" in feature {
    let cells = ([*Melee Type*], [*Ability*])
    for row in feature.weaponAbilities {
      cells += (display(row.weaponGroup), display(row.ability))
    }
    table(columns: (1fr, 1fr), stroke: 0.5pt + theme.tableDivider, align: horizon, fill: theme.defaultTableStyle(), inset: 4pt, ..cells)
  }
  for grant in feature.at("grants", default: ()) {
    let child = entry(grant.entryId)
    if grant.entryId.starts-with("modern4e.power.") {
      powerCard(child, fill: fill)
    } else {
      featureBody(child, fill: fill)
    }
  }
  for choice in feature.at("choices", default: ()) {
    for id in choice.source.entryIds {
      let option = entry(id)
      theme.choiceBlock(title: option.title, body: featureBody(option, fill: theme.bgColor))
    }
  }
}

#let feature(id) = {
  let value = entry(id)
  heading(value.title, level: 1)
  if "choices" in value {
    let count = value.choices.first().count
    theme.buildChoiceHeader(prompt: if count == 1 { [Choose One] } else { [Choose #count] })
  }
  featureBody(value)
}

#let initialPowerText(class) = {
  let choices = advancement.powerChoices.filter(choice => choice.atLevel == 1)
  let labels = choices.map(choice => str(choice.count) + " " + choice.title)
  [You may choose #labels.slice(0, -1).join(", ") and #labels.last() #class.title Powers.]
}

#let commonRules(class) = classes.commonTraits(class: class.title, commonTraits: {
  for id in class.ruleIds {
    let rule = entry(id)
    heading(rule.title, level: 2)
    classText(rule.description)
    parbreak()
  }
})
