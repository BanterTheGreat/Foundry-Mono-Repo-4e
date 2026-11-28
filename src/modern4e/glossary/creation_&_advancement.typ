#import "../helpers/theme.typ" as theme;
#import "../helpers/creation_content.typ" as creation;
#import "../helpers/configuration.typ" as config;

#let creationAndAdvancementPage() = {
  let rules = creation.rules
  return [
    #theme.pageTitle(title: rules.title);
    #let steps = if config.isRevisedRules {
      rules.steps.filter(step => step.id != "modern4e.creation.background").map(step => {
        if step.id == "modern4e.creation.skills" {
          step.title = "Choose four Trained skills"
          step.description = [Choose one skill from your class options and three other skills. See #link(<revised-skill-training>)[Skill training] for the options and the Novice skill your ZEITGEIST theme can grant.]
        }
        step
      })
    } else {
      rules.steps
    }
    #if config.isRevisedRules [Follow these steps to create your character.] else { rules.creationIntroduction }
    #for (index, step) in steps.enumerate() [
      #heading(str(index + 1) + ". " + step.title, level: 2)
      #step.description
      #parbreak()
    ]
    #pagebreak();
    #heading(rules.advancementTitle, level: 1)
    #rules.advancementIntroduction
    #table(
      columns: (0.5fr, 1fr, 1fr, 0.25fr, 1fr),
      stroke: theme.tableDivider,
      align: left,
      fill: theme.defaultTableStyleWithFirstColumnHeaders(),
      inset: 5pt,
      [*Level*], [*Ability Increases*], [*Powers and Features*], [*Feats*], [*Total Powers (A/E/D/U)*],
      ..creation.tableCells(),
    )
  ]
}
