#import "theme.typ";
#import "classes.typ" as classes;
#import "class_reference.typ" as reference;
#import "class_text.typ": classText;
#import "powers.typ" as powers;
#import "power_content.typ" as orderedPowers;

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

#let powerCard = orderedPowers.powerCard

#let featureBody(feature, fill: theme.rowStripes, showDescription: true, sectionStart: 0, sectionEnd: none, optionStart: 0, optionEnd: none, onlyOptions: false) = {
  let showOptions(choice) = {
    let options = choice.source.entryIds
    for id in options.slice(optionStart, if optionEnd == none { options.len() } else { optionEnd }) {
      let option = entry(id)
      theme.choiceBlock(title: option.title, body: featureBody(option, fill: theme.bgColor))
    }
  }
  if onlyOptions {
    for choice in feature.choices { showOptions(choice) }
    return
  }
  if "sections" in feature {
    let sections = feature.sections
    for section in sections.slice(sectionStart, if sectionEnd == none { sections.len() } else { sectionEnd }) {
      if section.type == "text" { classText(section.text); parbreak() }
      else if section.type == "heading" { heading(section.title, level: 2) }
      else if section.type == "grant" {
        let grant = feature.grants.find(grant => grant.id == section.grantId)
        let child = entry(grant.entryId)
        if grant.entryId.starts-with("modern4e.power.") { powerCard(child, fill: fill) }
        else { featureBody(child, fill: fill) }
      } else if section.type == "choice" {
        showOptions(feature.choices.find(choice => choice.id == section.choiceId))
      }
    }
    return
  }
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

#let featureOptions(id, start: 0, end: none) = featureBody(entry(id), optionStart: start, optionEnd: end, onlyOptions: true)
#let featureSections(id, start: 0, end: none, optionEnd: none, fill: theme.rowStripes) = featureBody(entry(id), sectionStart: start, sectionEnd: end, optionEnd: optionEnd, fill: fill)

#let feature(id, sectionEnd: none, optionEnd: none) = {
  let value = entry(id)
  heading(value.title, level: 1)
  if "choices" in value {
    let count = value.choices.first().count
    theme.buildChoiceHeader(prompt: if count == 1 { [Choose One] } else { [Choose #count] })
  }
  if "sections" in value { featureSections(id, end: sectionEnd, optionEnd: optionEnd) }
  else { featureBody(value) }
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
