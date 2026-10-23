#import "../helpers/theme.typ" as theme;

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

    #v(200pt)
    == Paragon feats to double-check
    The newly added Paragon feats for the following classes still need an author review: Artificer, Avenger, Barbarian, Bard, Cleric, Druid, Invoker, Paladin, Ranger, Rogue, Runepriest, Sorcerer, and Warden.
  ]
}
