#import "utility_content.typ": utilityEntries;
#import "power_content.typ": powerCard;

#let utilityLevelLabel(className, level) = label("class-utilities-" + lower(className) + "-" + str(level));

#let classUtilities(className: str) = {
  let entries = utilityEntries("class-" + lower(className))
  pagebreak()
  set page(columns: 1)
  heading(className + " Utility Powers", level: 1)
  [Choose these powers using the utility selections and combat/out-of-combat rules in character advancement. Any listed proficiency or use requirement still applies.]
  for (index, level) in entries.map(entry => entry.level).dedup().enumerate() {
    if index > 0 { pagebreak() }
    [#heading("Level " + str(level), level: 2)#utilityLevelLabel(className, level)]
    columns(2, gutter: 5mm)[
      #for entry in entries.filter(entry => entry.level == level) {
        powerCard(entry)
      }
    ]
  }
};
