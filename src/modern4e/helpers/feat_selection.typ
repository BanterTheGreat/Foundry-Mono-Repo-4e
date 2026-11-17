// Selection prose comes from structured rules, independently of effect prose.
#import "feat_requirements.typ": references;

#let selectionSpecial(entry, noun: "feat") = {
  let selection = entry.selection
  let maximum = selection.maximum
  if maximum == 1 {
    return ""
  }
  let sentences = (if maximum == none {
    "You can take this " + noun + " more than once."
  } else {
    "You can take this " + noun + " up to " + str(maximum) + " times."
  },)
  let choices = (:)
  for choice in entry.at("choices", default: ()) {
    choices.insert(choice.id, choice)
  }
  let labels = (SKILL: ("skill", "skills"), LANGUAGE: ("language", "languages"), WEAPON_PROFICIENCY: ("weapon proficiency option", "weapon proficiency options"), DAMAGE_TYPE: ("damage type", "damage types"))
  for rule in selection.constraints {
    if rule.type == "advance" {
      let last = rule.order.last()
      sentences.push("Each time, advance one step in the armor proficiency progression, up to " + upper(last.first()) + lower(last.slice(1)) + ".")
    } else {
      let choice = choices.at(rule.choiceId)
      let scope = rule.against.scope
      let ending = if scope == "CHARACTER" {
        if choice.kind == "SKILL" { "you are not already proficient in" } else { "you do not already know" }
      } else if scope == "POWER" {
        "that " + references.at(rule.against.entryId).title + " does not already deal"
      } else {
        "not chosen for previous selections of this " + noun
      }
      let label = labels.at(choice.kind).at(if choice.count == 1 { 0 } else { 1 })
      sentences.push("Each time, choose " + str(choice.count) + " " + label + " " + ending + ".")
      if rule.whenExhausted == "ALLOW_REPEAT" {
        sentences.push("If all those options have already been chosen, you may repeat a previous choice.")
      }
    }
  }
  sentences.join(" ")
}
