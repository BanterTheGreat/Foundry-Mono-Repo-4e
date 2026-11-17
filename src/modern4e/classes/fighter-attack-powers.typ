// Shared local definitions are also compiled into the Character Builder package.
#import "../helpers/class_content.typ" as content;

#let fighterAttackPowers() = {
  let powers = json("../content/classes/fighter-attack-powers.json").powers
  for (usage, label) in (("AT_WILL", "At-Will"), ("ENCOUNTER", "Encounter"), ("DAILY", "Daily")) {
    [== Fighter #label Attack Powers]
    for level in (1, 3, 5, 7, 9, 13, 15) {
      let group = powers.filter(power => power.level == level and power.activations.first().usage.frequency == usage)
      if group.len() > 0 {
        [=== Level #level]
        for power in group {
          content.powerCard(content.entry(power.id))
        }
      }
    }
  }
}
