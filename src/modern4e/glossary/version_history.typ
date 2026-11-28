#import "../helpers/theme.typ" as theme;
#import "../helpers/configuration.typ" as config;

#let versionHistoryPage() = {
  return [
    #theme.pageTitle(title: "Rule Version History");

    = v1.0.0 - Death to CBLoader
    Initial Version.

    = v1.1.0 - Death to the Fey Lord
    - Changed the Human Determination trait to Cooperation (+1 to Aid Another checks).
    - Reduced the starting Non-Main Ability scores from 6 to 5, as well as the maximum added to a non-main from 3 to 2.
    - Removed bonds, they ended up unused and forgotten.
    - Removed redundant mandatory class-feature prerequisites from class feats, retaining optional build and power requirements. The per-feat change log is in `content/feats/prerequisite-cleanup.md`.

    = v1.2.0 - Rest In Peace (Summit)
    - Added Paragon Content, needs touch ups
    - Added Shaman & Wizard Paragon Paths
    - Replaced Non-Combat Utility Powers /w just more Skill Utility Powers
    - Integrated Zeitgeist Content

    = v1.2.2 - Technique Pricing
    - Updated Technique pricing, listing both the Market Price to acquire a technique and the Casting Cost for each use, with reusable focus costs shown separately.
    - Removed the Necromancy Techniques Spirit Idol and Raise Dead.

    = v1.3 - Barbarian Powers
    - Added revised Barbarian attack powers through level 11 directly to the Barbarian chapter, with new pages for each power type and level.

    #if config.isRevisedRules [
      = v2.0 - Abilities, Armor, and Skills
      - Ability increases now come at levels 8, 14, 21, and 28.
      - Light armor caps the ability bonus at +3. The new armor and defense rules set how AC, Fortitude, Reflex, and Will improve with level.
      - The new skill list lets the GM choose an ability based on how the character tackles the task.
      - Skill Points raise skill ranks. Updated check outcomes, difficulty tables, and utility prerequisites use those ranks.
    ]

    #v(200pt)
    == Paragon feats to double-check
    The newly added Paragon feats for the following classes still need an author review: Artificer, Avenger, Barbarian, Bard, Cleric, Druid, Invoker, Paladin, Ranger, Rogue, Runepriest, Sorcerer, and Warden.
  ]
}
