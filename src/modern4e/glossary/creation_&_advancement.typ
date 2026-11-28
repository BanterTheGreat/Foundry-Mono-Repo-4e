#import "../helpers/theme.typ" as theme;
#import "../helpers/creation_content.typ" as creation;

#let creationAndAdvancementPage() = {
  let rules = creation.rules
  return [
    #theme.pageTitle(title: rules.title);
    #rules.creationIntroduction
    #for (index, step) in rules.steps.enumerate() [
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
