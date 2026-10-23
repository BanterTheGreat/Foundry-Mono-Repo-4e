#import "helpers/theme.typ" as theme;
#import "helpers/configuration.typ" as config;
#import "glossary/in_memoriam.typ" as inMemoriam;

#import "./ancestries/root.typ" as ancestries;
#import "./classes/root.typ" as classes;

#import "glossary/themes.typ";
#import "glossary/zeitgeist_paths.typ" as zeitgeistPaths;
#import "glossary/equipment.typ";
#import "glossary/feats.typ";
// #import "glossary/bonds.typ" as bonds;
#import "glossary/utility.typ";
#import "glossary/creation_&_advancement.typ" as creationAndAdvancement;
#import "glossary/skill_checks.typ" as skillChecks;
#import "glossary/negotiation.typ" as negotiation;
#import "glossary/techniques.typ" as techniques;
#import "glossary/balance_changes.typ" as balanceChanges;
#import "glossary/background.typ" as background;
#import "glossary/quick_rules.typ" as rules;
#import "glossary/version_history.typ" as versionHistory;

#let showPages(pages: ()) = {
  pages.join(pagebreak())
}

#set text(size: 9pt, font: "Rokkitt");

// PDF navigation follows the same chapter/option hierarchy as the printed
// contents. Rule headings reuse these levels for styling only.
#set heading(offset: 2, outlined: false, bookmarked: false)
#show heading.where(numbering: "1."): set heading(outlined: true, bookmarked: true)

// Preserve the visual sizes and spacing of = and == rule headings while
// nesting them below chapter (level 1) and ancestry/class (level 2) titles.
#show heading.where(level: 3, depth: 1, numbering: none): set text(size: 1.4em)
#show heading.where(level: 3, depth: 1, numbering: none): set block(above: 1.8em / 1.4, below: 0.75em / 1.4)
#show heading.where(level: 4, depth: 2, numbering: none): set text(size: 1.2em)
#show heading.where(level: 4, depth: 2, numbering: none): set block(above: 1.44em / 1.2, below: 0.75em / 1.2)

#set page(
  height: 277mm,
  width: 230mm,
  header: theme.runningHeader(),
  footer: theme.footer(invert: false),
  margin: (top: 1cm, rest: 1cm),
  fill: theme.bgColor,
)

#show heading.where(depth: 1, numbering: none): it => [
  #text(font: "Merriweather", it);
  #v(-12pt)
  #theme.fadingLine()
]

#show heading.where(depth: 2, numbering: none): it => [
  #text(font: "Merriweather", it);
]

#show heading.where(depth: 3, numbering: none): it => [
  #text(font: "Bona Nova SC", it);
]

#show heading.where(level: 3, numbering: "1."): it => [
  #heading(text(it.body, font: "Alfa Slab One"), level: 3)
]

// This is a bit of a hack, but it works. It allows us to format ability scores in a consistent way throughout the document, without having to manually format them every time.
#show regex("\\b(Intelligence|Wisdom|Charisma|Strength|Dexterity|Constitution|INT|WIS|CHA|STR|DEX|CON)\\b"): it => theme.formatAbility(ability: it);

#{
  set page(background: image("./images/cover.jpg", width: 100%, fit: "stretch"), footer: none)

  align(center)[
    #text([*#config.editionName*], size: 32pt, fill: white, font: "Alfa Slab One", stroke: black)
  ]
}

#show outline.entry.where(
  level: 1,
): it => {
  text(it, font: "Rokkitt", size: 11pt, weight: "bold")
}

#inMemoriam.inMemoriamPage()
#pagebreak();

#columns(2)[
  #heading(level: 1, outlined: true, bookmarked: true)[Introduction]
  The point of this book is to have a centralized place where all the information to create DND4e character is collected.
  This way, we remove our dependency to CBLoader, which also offers me a quicker and easier method to change some parts of the game, without resulting in discrepancies.

  This PDF contains various homebrew integrated from different sources from the DND4e community, as well as some changes of my own. The biggest area I wanted to attempt to broaden was to increase the potential to have different out of combat specializations, without needing to sacrifise your in-combat potential. 

  Some of the homebrew used within this document are but not limited to:

  - _Techniques for 4E_ by *Cyber Jazz Fusion*
    - #theme.externalLink("https://drive.google.com/uc?export=download&id=1Is6PnznU0U8V7efvfVGxO9j9GEw3FVCi", "Click me for a download");
  - _Warlock, Avenger, Non-Class Feats & Equipment changes_ by *Erachima*
  // - _Bonds_, partly taken from  *Fabula Ultima*
  - _Backgrounds_, partly taken from *Draw Steel*
  - _Negotiation_, adapted from *Draw Steel*
  - Various changes to Ability Scores, Skill Checks and Rules by myself.

  == Future Plans
  The document is largely complete through level 10. I hope to expand the following areas.

  === Class Powers
  For some classes, I want to implement the class powers into this document itself, atleast for the early levels. This are the classes which have gotten buffs by *Erachima*, this however is a long and arduous task, so I doubt it will happen soon.
  
  #outline(target: heading.where(numbering: "1."));
]
#pagebreak();

#showPages(
  pages: (
    creationAndAdvancement.creationAndAdvancementPage(),
    ancestries.ancestriesPage(),
    background.backgroundPage(),
    classes.classesPage(),
    // bonds.bondsPage(),
    equipment.equipmentPage(),
    ..if config.isZeitgeistBuild { (themes.themesPage(), )} else { () },
    ..if config.isZeitgeistBuild { (zeitgeistPaths.zeitgeistPathsPage(),) } else { () },
    feats.featsPage(),
    utility.utilityPage(),
    techniques.techniquesPage(),
    skillChecks.skillChecksPage(),
    negotiation.negotiationPage(),
    balanceChanges.balanceChangesPage(),
    rules.rulesPage(),
    versionHistory.versionHistoryPage(),
  ),
);
