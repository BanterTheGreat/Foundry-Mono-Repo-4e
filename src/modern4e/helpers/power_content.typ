// Ordered authoring blocks are literal data. Rendering never executes a rule.
#import "theme.typ";
#import "powers.typ" as cards;
#import "class_text.typ": classText;

#let display(value) = {
  if value == "NON_COMBAT" { "Non-Combat" } else {
    value.split("_").map(word => upper(word.first()) + lower(word.slice(1))).join(" ")
  }
}
#let scaled(value, prefix: "") = {
  if type(value) == str { lower(value) } else {
    str(value.base) + if "byLevel" in value {
      " (" + value.byLevel.map(row => prefix + str(row.value) + " at level " + str(row.atLevel)).join(", ") + ")"
    } else { "" }
  }
}
#let rangeText(range) = {
  if range.type == "PERSONAL" { "Personal" }
  else if range.type == "RULES_TEXT" { range.text }
  else if range.type == "CHOICE" { range.options.map(rangeText).join(" or ") }
  else {
    display(range.type) + " " + if "size" in range { scaled(range.size, prefix: if range.type == "CLOSE_BURST" { "burst " } else if range.type == "CLOSE_BLAST" { "blast " } else { "" }) } else {
      (if range.at("origin", default: "self") == "spirit" { "spirit " } else { "" }) + scaled(range.distance)
    } + if "size" in range and "distance" in range { " within " + scaled(range.distance) + " squares" } else { "" }
  }
}

#let blockContent(value) = {
  if value.label == "Rule" { classText(value.text) } else { [*#value.label:* #classText(value.text)] }
  for scale in value.at("scaling", default: ()) [
    #linebreak()
    *Level #scale.atLevel:* #classText(scale.text)
  ]
  if value.type == "attack" {
    for comparison in value.comparisons {
      for (outcome, blocks) in comparison.outcomes {
        if value.comparisons.len() > 1 [#linebreak() *#display(comparison.defense):*]
        for child in blocks {
          linebreak()
          blockContent(child)
        }
      }
    }
  } else if value.type == "choice" {
    for option in value.options [
      #linebreak()
      *#option.title:*
      #for child in option.blocks {
        linebreak()
        blockContent(child)
      }
    ]
  } else if value.type == "table" {
    for result in value.results [
      #linebreak()
      *#result.faces.map(str).join(", "):*
      #for child in result.blocks { blockContent(child) }
    ]
  } else if "blocks" in value {
    if value.type == "persistent" [#linebreak() *Duration:* #classText(value.duration)]
    if value.type == "trigger" [#linebreak() *When:* #classText(value.event)]
    if value.type == "conditional" [#linebreak() *When:* #classText(value.when.text)]
    if value.type == "repeat" [#linebreak() *While:* #classText(value.at("while").text)]
    for child in value.blocks {
      linebreak()
      blockContent(child)
    }
  } else if value.type == "grant" {
    [#linebreak() *Available:* #classText(value.duration)]
  }
}

#let powerCard(power, fill: theme.rowStripes) = {
  for activation in power.activations {
    let range = activation.at("range", default: (type: "PERSONAL"))
    let target = if "targets" in activation { classText(activation.bindings.at(activation.targets).text) } else { none }
    cards.power(
      title: activation.at("title", default: power.title),
      bonusTitle: power.at("subtitle", default: none),
      description: power.at("flavor", default: none),
      type: (AT_WILL: "At-Will", ENCOUNTER: "Encounter", DAILY: "Daily").at(activation.usage.frequency),
      action: cards.actionType.at((STANDARD: "standard", EXTENDED: "extended", MOVE: "move", MINOR: "minor", FREE: "free", REACTION: "reaction", NO_ACTION: "noAction", IMMEDIATE_INTERRUPT: "immediateInterrupt", IMMEDIATE_REACTION: "immediateReaction", OPPORTUNITY: "opportunity").at(activation.action)),
      range: rangeText(range),
      target: target,
      traits: power.keywords.map(display).join(", "),
      trigger: activation.at("trigger", default: none),
      requirement: activation.at("requirement", default: none),
      isSpecial: activation.at("special", default: false),
      additionalRows: activation.blocks.map(blockContent),
      fill: fill,
    )
  }
}
