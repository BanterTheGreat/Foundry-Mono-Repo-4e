#import "powers.typ" as powers;

#let utilityLevelLabel(className, level) = label("class-utilities-" + lower(className) + "-" + str(level));

// JSON strings are rendered as text, never evaluated as Typst source.
#let ruleLine(value) = {
  if value.starts-with("* ") {
    return [• #ruleLine(value.slice(2))]
  }
  let parts = value.split(": ")
  if parts.len() > 1 and parts.first().len() < 45 {
    [*#parts.first():* #parts.slice(1).join(": ")]
  } else {
    [#value]
  }
};

#let classUtilities(className: str) = {
  let entries = json("../content/class-utilities/" + lower(className) + ".json").powers
  pagebreak()
  set page(columns: 1)
  heading(className + " Utility Powers", level: 1)
  [Choose these powers using the utility selections and combat/out-of-combat rules in character advancement. Any listed proficiency or use requirement still applies.]
  for (index, level) in entries.map(entry => entry.level).dedup().enumerate() {
    if index > 0 { pagebreak() }
    [#heading("Level " + str(level), level: 2)#utilityLevelLabel(className, level)]
    columns(2, gutter: 5mm)[
      #for entry in entries.filter(entry => entry.level == level) {
        let rows = ()
        let target = none
        let trigger = none
        let requirement = none
        // Only primary metadata is lifted out; secondary powers stay intact.
        let bodyStarted = false
        for row in entry.rows {
          if not bodyStarted and row.starts-with("Target: ") {
            target = row.slice(8)
          } else if not bodyStarted and row.starts-with("Targets: ") {
            target = row.slice(9)
          } else if not bodyStarted and row.starts-with("Trigger: ") {
            trigger = row.slice(9)
          } else if not bodyStarted and row.starts-with("Requirement: ") {
            requirement = row.slice(13)
          } else {
            // Prerequisites and Special lines remain explicit rules on the card.
            if row.starts-with("Effect:") or row.starts-with("Attack:") {
              bodyStarted = true
            }
            rows.push(ruleLine(row))
          }
        }
        powers.power(
          title: entry.title,
          description: entry.description,
          type: entry.type,
          bonusTitle: str(entry.level),
          traits: entry.traits,
          action: entry.action,
          range: [#entry.range],
          target: target,
          trigger: trigger,
          requirement: requirement,
          additionalRows: rows,
        )
      }
    ]
  }
};
