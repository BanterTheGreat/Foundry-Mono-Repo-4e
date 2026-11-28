// Theme prose is literal data, using the same safe renderer as class powers.
#import "class_text.typ": classText;
#import "power_content.typ" as powers;
#import "configuration.typ" as config;

#let catalog = json("../content/themes/zeitgeist.json")
#let entries = {
  let result = (:)
  for category in ("themes", "features", "powers") {
    for value in catalog.at(category) {
      assert(not (value.id in result), message: "Duplicate theme entry: " + value.id)
      result.insert(value.id, value)
    }
  }
  result
}
#let entry(id) = entries.at(id)
#let prose(id, section) = classText(entry(id).sections.at(section))
#let role(id) = [*Role: #powers.display(entry(id).role).*]
#let overview() = catalog.themes.map(value => (
  text(value.title), text(powers.display(value.role)), text(value.concept),
)).flatten()
#let benefit(id, level: none) = {
  let value = entry(id)
  if level != none {
    heading("Level " + str(level) + if level == 1 { "" } else { ": " + value.title }, level: 1)
  }
  let description = if config.isRevisedRules and id == "modern4e.feature.martial-scientist-level-1" {
    value.description.replace("Gain *proficiency in Society*. If already proficient, choose another skill instead. ", "")
  } else {
    value.description
  }
  classText(description)
}
#let modification(id) = {
  let value = entry(id)
  heading(value.title, level: 1)
  classText(value.description)
}
// Zeitgeist Player's Guide, pp. 8-16.
#let sourceFlavors = (
  "modern4e.power.docker-s-jank": "In a band, every musician has to know his bandmates’ parts in case they need to switch places or pick up the slack.",
  "modern4e.power.icy-end-of-the-earth": "The world shall end in ice. As you sense the closeness of your own mortality, this undeniable doomsday manifests in your presence.",
  "modern4e.power.the-man-with-two-guns-is-god": "You have discovered the coolest-looking fighting style in the world.",
  "modern4e.power.experimental-strike": "Scientific breakthroughs are born of both careful study and wild experimentation. Your old reliable attack technique has failed, so it’s time to try option B.",
  "modern4e.power.skyseer-vision": "You find a clear view of the night sky, focus your mind on the future, and await a prophetic dream.",
  "modern4e.power.look-skyward": "You share with your allies a glimpse of the motions of the heavens, revealing fortuitous and unfortuitous paths.",
  "modern4e.power.speak-with-spirit": "With your urging, the spirit of a recently dead person speaks briefly with you.",
  "modern4e.power.unfinished-business": "With a manipulative whisper, you call up the spirit of a recently slain creature for one last attack.",
  "modern4e.power.disposable-simulacrum": "You pull out a pre-assembled gadget, tie it to your life force, and animate it so it can recreate one of your fighting techniques.",
  "modern4e.power.hands-of-retribution": "The faint burning outline of a six-armed goddess hovers behind you. As enemies strike your allies, the goddess lashes out in retaliation with blades of fire.",
  "modern4e.power.display-of-heroism": "Seeing an ally in peril, you rush into harm’s way and cover his escape.",
)

#let powerCard(id) = {
  let value = entry(id)
  if config.isRevisedRules {
    value.flavor = sourceFlavors.at(id, default: value.at("flavor", default: none))
  }
  powers.powerCard(value)
}
