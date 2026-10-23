#import "../helpers/theme.typ" as theme;

#let creationAndAdvancementPage() = {
  return [
    #theme.pageTitle(title: "Character Creation & Advancement");
    Creating a character involves 7 steps:

    == 1. Choose an Ancestry
    Choose a ancestry from Ancestries, this will give you 2 passive abilities and an encounter power.

    == 2. Create a Background
    Create a background by selecting an environment and an upbringing, and mark down the skills chosen.

    == 3. Choose a Class
    Choose a class, this will decide your main playstyle during combat. Make sure you write down any choices you make during class selection, such as powers selected.

    == 4. Gather your Equipment
    Choose your starting equipment from Equipment. Make sure to write down any choices you make during equipment selection, such as weapon types. You may select one or two weapons, an armor type, a shield and an implement you are proficent in.

    == 5. Select 2 Skills
    Choose 2 skills to become proficient in, these are the skills your character picked up between the time of their background and becoming an adventurer.

    // == 6. Create Bonds with your fellow adventurers
    // Create a Bond with 2 other adventurers in your party.

    == 6. Choose a Theme
    Themes are a kind of subtrack you can pick which come with some benefits. You may choose one.

    == 7. Choose a Feat
    You may choose 1 Feat from either your ancestry, class or the general Feats list.

    #pagebreak();
    = Character Advancement
    When your character levels up, you gain new features & abilities. This table shows what you gain each level.

    #table(
      columns: (0.5fr, 1fr, 1fr, 0.25fr, 1fr),
      stroke: theme.tableDivider,
      align: left,
      fill: theme.defaultTableStyleWithFirstColumnHeaders(),
      inset: 5pt,
      [*Level*], [*Ability Increases*], [*Powers and Features*], [*Feats*], [*Total Powers (A/E/D/U)*],

      [1st],
      [See class],
      [class features; racial traits; gain 1 feat; gain 2 at-will attack powers; gain 1 encounter attack power; gain 2 daily attack powers],
      [1],
      [2/1/2/0],

      [2nd], [—], [gain 1 utility power; gain 1 feat], [2], [2/1/2/1],
      [3rd], [—], [gain 1 encounter attack power], [2], [2/2/2/1],
      [4th], [+1 to non-main], [gain 1 feat;], [3], [2/2/2/1],
      [5th], [—], [gain 1 daily attack power], [3], [2/2/3/1],
      [6th], [—], [gain 1 utility power; gain 1 feat], [4], [2/2/3/2],
      [7th], [—], [gain 1 encounter attack power], [4], [2/3/3/2],
      [8th], [+1 to main], [gain 1 feat;], [5], [2/3/3/2],
      [9th], [—], [replace 1 daily attack power], [5], [2/3/3/2],
      [10th], [—], [gain 1 utility power; gain 1 feat], [6], [2/3/3/3],

      // Anything below this is not truly error-proof;
      [11th],
      [—],
      [#block("paragon path features; gain 1 paragon path encounter attack power; gain 1 feat", breakable: false)],
      [7],
    
      [2/4/3/3],

      [12th], [+1 to non-main], [gain 1 paragon path utility power; gain 1 feat], [8], [2/4/3/4],
      [13th], [—], [gain 1 encounter attack power], [8], [2/5/3/4],
      [14th], [—], [gain 1 feat], [9], [2/5/3/4],
      [15th], [—], [replace 1 daily attack power], [9], [2/5/3/4],
      [16th], [+1 to all], [paragon path feature; gain 1 feat], [10], [2/5/3/4],
      [17th], [—], [gain 1 utility power; gain 1 encounter power; gain 1 feat], [11], [2/6/3/5],
      [18th], [—], [gain 1 feat], [12], [2/6/3/5],
      [19th], [—], [replace 1 daily attack power], [12], [2/6/3/5],
      [20th], [+1 to main], [gain 1 paragon path daily attack power; gain 1 feat], [13], [2/6/4/5],
      [21st], [—], [epic destiny feature; gain 1 feat], [14], [2/6/4/5],
      [22nd], [—], [gain 1 utility power; gain 1 feat], [15], [2/6/4/6],
      [23rd], [—], [replace 1 encounter attack power], [15], [2/6/4/6],
      [24th], [+1 to non-main], [epic destiny feature; gain 1 feat], [16], [2/6/4/6],
      [25th], [—], [replace 1 daily attack power], [16], [2/6/4/6],
      [26th], [—], [gain 1 epic destiny utility power; gain 1 feat], [17], [2/6/4/7],
      [27th], [—], [gain 1 encounter attack power], [17], [2/7/4/7],
      [28th], [+1 to main], [gain 1 feat], [18], [2/7/4/7],
      [29th], [—], [replace 1 daily attack power], [18], [2/7/4/7],
      [30th], [—], [epic destiny feature; gain 1 feat], [19], [2/7/4/7],
    )
  ]
}



