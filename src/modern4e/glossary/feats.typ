#import "../helpers/theme.typ" as theme;

#let featsPage() = {
  return [
    #theme.pageTitle(title: "General Feats");
    = Heroic Feats
    #columns(3)[

      #theme.featBlock(
        title: "Aggressive Advantage",
        requirements: "Nature",
        content: [
          You gain combat advantage against all enemies during your first turn in an encounter.
        ],
      );

      #theme.featBlock(
        title: "Agile Opportunist",
        requirements: "3 Dexterity",
        content: [
          Whenever you are pulled, pushed, or slid into a square adjacent to an enemy, you can use an immediate reaction to make a basic attack against that enemy.
        ],
      );

      #theme.featBlock(
        title: "Alchemist",
        content: [You master the Alchemical Creation technique, additionally, you learn a formula of your level or lower at 1st level, 2nd level, and every even level thereafter.

          *Special*: You can take this feat instead of the Technique Master feat granted by your class feature.],
      )

      #theme.featBlock(
        title: "Alertness",
        requirements: "Perception",
        content: [
          You cannot be surprised. Also, you gain a +2 feat bonus to Perception checks. At 21st level, this feat bonus increases to +3.
        ],
      );

      #theme.featBlock(
        title: "Armor Proficiency",
        content: [
          You gain proficiency with the armor type one step above the highest armor type you are already proficient with, using this progression: Cloth → Leather → Hide → Chainmail → Scale → Plate.

          *Special*: You can take this feat more than once. Each time you select this feat, advance one more step in the progression, up to Plate.
        ],
      );

      #theme.featBlock(
        title: "Astral Fire",
        requirements: "2 Dexterity or 2 Charisma",
        content: [
          You gain a +2 feat bonus to damage rolls when you use a power that has the Fire or the Radiant keyword. At 11th level, this feat bonus increases to +3. At 21st level, it increases to +4.
        ],
      );

      #theme.featBlock(
        title: "Back to the Wall",
        content: [
          Whenever you are adjacent to blocking terrain other than the ground, you gain a +1 feat bonus to attack rolls, a +1 bonus to damage rolls against adjacent enemies, and do not grant combat advantage to those enemies. At 11th level, this bonus to damage rolls increases to +2. At 21st level, it increases to +3.
        ],
      );

      #theme.featBlock(
        title: "Battering Shield",
        requirements: "Proficiency with shields",
        content: [
          When you are wielding a shield and push or slide a creature with a melee or close attack, you gain a +1 feat bonus to the distance of that forced movement. This feat bonus increases to +2 at 21st level.
        ],
      );

      #theme.featBlock(
        title: "Beguiling Enchantment",
        content: [
          Whenever you hit an enemy with a charm power, that enemy takes a -2 penalty to attack rolls against you until the end of its next turn.
        ],
      );

      #theme.featBlock(
        title: "Burning Blizzard",
        requirements: "2 Intelligence or 2 Wisdom",
        content: [
          You gain a +2 feat bonus to damage rolls when you use a power that has the Acid or the Cold keyword. At 11th level, this feat bonus increases to +3. At 21st level, it increases to +4.
        ],
      );

      #theme.featBlock(
        title: "Combat Medic",
        requirements: "Medicine",
        content: [
          You can administer first aid as a minor action with no increase in difficulty. You gain a +2 feat bonus to Medicine checks, increasing to a +3 feat bonus at 21st level.
        ],
      );

      #theme.featBlock(
        title: "Combat Reflexes",
        requirements: "3 Dexterity",
        content: [
          Enemies do not gain the normal +2 bonus to attack rolls against you when they have combat advantage. Any other benefits derived from combat advantage still apply.
        ],
      );

      #theme.featBlock(
        title: "Coordinated Explosion",
        content: [
          When you use a burst or blast attack, you gain combat advantage against enemy targets if at least one of your allies is targeted by the burst or blast.
        ],
      );

      #theme.featBlock(
        title: "Danger Sense",
        requirements: "3 Wisdom",
        content: [
          When you make an initiative check, roll twice and take the higher of the two rolls.
        ],
      );

      #theme.featBlock(
        title: "Dark Fury",
        requirements: "2 Constitution or 2 Wisdom",
        content: [
          You gain a +2 feat bonus to damage rolls when you use a power that has the necrotic or the psychic keyword. At 11th level, this bonus increases to +3. At 21st level, it increases to +4.
        ],
      );

      #theme.featBlock(
        title: "Deadly Draw",
        content: [
          Whenever you pull or slide an enemy to a square adjacent to you, you gain combat advantage against that enemy until the end of your next turn.
        ],
      );

      #theme.featBlock(
        title: "Defensive Mobility",
        content: [
          You do not provoke opportunity attacks when leaving a square adjacent to an enemy as long as you are entering another square adjacent to that enemy.
        ],
      );

      #theme.featBlock(
        title: "Distant Advantage",
        content: [
          You gain combat advantage for close, ranged, and area attacks against any enemy flanked by your allies.
        ],
      );

      #theme.featBlock(
        title: "Durable",
        content: [
          Your number of healing surges increases by 2. At 11th level, your number of healing surges instead increases by 3, and at 21st level your number of healing surges instead increases by 4.
        ],
      );

      #theme.featBlock(
        title: "Eager Advance",
        requirements: "Athletics",
        content: [
          You gain a +4 power bonus to speed on your first turn during an encounter. Increase this bonus to +6 at 11th level and +8 at 21st level.
        ],
      );

      #theme.featBlock(
        title: "Escape Artist",
        requirements: "Acrobatics",
        content: [
          You can attempt to escape a grab as a minor action, instead of as a move action. You also gain a +2 feat bonus to Acrobatics checks. At 21st level, this feat bonus increases to +3.
        ],
      );

      #theme.featBlock(
        title: "Evasion",
        requirements: "3 Dexterity",
        content: [
          Whenever an attack misses you and would still inflict damage on a miss, you do not take that damage.
        ],
      );

      #theme.featBlock(
        title: "Expansive Burst",
        content: [
          Your close burst and area burst attacks ignore cover, but not superior cover.
        ],
      );

      #theme.featBlock(
        title: "Far Throw",
        content: [
          When you make a ranged attack with a thrown weapon or consumable item, increase both the normal range and long range of the attack by your Strength.
        ],
      );

      #theme.featBlock(
        title: "Fast Runner",
        content: [
          You gain a +2 bonus to speed whenever you charge or run. At 11th level, this bonus increases to +3. At 21st level, it increases to +4.
        ],
      );

      #theme.featBlock(
        title: "Fleet-Footed",
        requirements: "3 Dexterity",
        content: [
          You gain a +1 feat bonus to your speed, increasing to a +2 feat bonus to your speed at 21st level.
        ],
      );

      #theme.featBlock(
        title: "Grounding Shot",
        content: [
          Your ranged attacks ignore the penalty for attacking prone targets and deal 2 extra damage against them. Increase this extra damage to 4 at 11th level and 6 at 21st level.
        ],
      );

      #theme.featBlock(
        title: "Hafted Defense",
        content: [
          While wielding a polearm, spear, or staff in two hands, you gain a +1 shield bonus to AC and Reflex.
        ],
      );

      #theme.featBlock(
        title: "Hammering Iron",
        requirements: "3 Constitution",
        content: [
          Whenever you hit a target with a basic attack using a hammer, you can also push that target 1 square.
        ],
      );

      #theme.featBlock(
        title: "Headsman's Chop",
        content: [
          You gain a +2 feat bonus to weapon damage rolls with axes and heavy blades. This feat bonus increases to +3 at 11th level and +4 at 21st level. Against prone targets, this feat bonus is doubled.
        ],
      );

      #theme.featBlock(
        title: "Improved Bull Rush",
        content: [
          You can Bull Rush creatures of any size. Whenever you use the Bull Rush option, you deal 4 extra damage, plus 4 extra damage for each size category smaller than you the target is. The extra damage increases to 6 at 11th level, and 8 at 21st level.
        ],
      );

      #theme.featBlock(
        title: "Improved Grab",
        content: [
          You can use the Grab attack on creatures of any size. When you use the Grab attack on a creature two or more sizes larger than you that creature is not immobilized, but instead must pull you one square to a square adjacent to them whenever they move, and fails to move if they cannot do so. Whenever you sustain a grab, the grabbing power deals 1[W] damage (occupied weapon or unarmed weapon) to the target.
        ],
      );

      #theme.featBlock(
        title: "Improved Initiative",
        content: [
          You gain a +4 feat bonus to initiative. This feat bonus increases to +5 at 11th level and +6 at 21st level.
        ],
      );

      #theme.featBlock(
        title: "Improved Second Wind",
        content: [
          Whenever you use your Second Wind, you regain additional hit points equal to 5 + half your level.
        ],
      );

      #theme.featBlock(
        title: "Lasting Frost",
        content: [
          Once per turn when you deal cold damage to a creature, you can choose to inflict vulnerable 3 to cold damage to that creature until the end of your next turn. The vulnerability inflicted increases to 5 at 11th level and 10 at 21st level.
        ],
      );

      #theme.featBlock(
        title: "Linguist",
        content: [
          Choose three languages. You can speak, read, and write those languages fluently. You gain a +2 feat bonus to your choice of Diplomacy, Society, or Insight checks. At 21st level, this feat bonus increases to +3. *Special*: You can take this feat more than once. Each time you select this feat, choose three additional languages and, if possible, another skill to gain a feat bonus.
        ],
      );

      #theme.featBlock(
        title: "Long Jumper",
        requirements: "Athletics",
        content: [
          Whenever you make a long jump with a running start, your jump can take you further than your remaining movement. You gain a +2 feat bonus to Athletics checks. At 21st level, this feat bonus increases to +3.
        ],
      );

      #theme.featBlock(
        title: "Lost in the Crowd",
        requirements: "Size Small or Tiny",
        content: [
          You gain a +2 racial bonus to all defenses when you are adjacent to at least two creatures larger than you.
        ],
      );

      #theme.featBlock(
        title: "Master at Arms",
        content: [
          You gain a +1 tier bonus to the attack rolls of weapon attacks. The bonus increases to +2 at 11th level and +3 at 21st level.

          Also, you can use a single minor action to sheathe a weapon and then draw another weapon.
        ],
      )

      #theme.featBlock(
        title: "Mettle",
        requirements: "3 Constitution",
        content: [
          Whenever an attack misses you and would still inflict a condition on a miss, you do not suffer that condition.
        ],
      );

      #theme.featBlock(
        title: "Nimble Blade",
        requirements: "3 Dexterity",
        content: [
          When you attack with a dagger or light blade and you have combat advantage, you gain a +1 feat bonus to attack rolls.
        ],
      );

      #theme.featBlock(
        title: "Oncoming Storm",
        content: [
          When you hit with any lightning attack power, you gain combat advantage with thunder powers until the end of your next turn. When you hit with any thunder attack power, you gain combat advantage with lightning powers until the end of your next turn.
        ],
      );

      #theme.featBlock(
        title: "Opportunity Sidestep",
        requirements: "Insight",
        content: [
          Whenever you hit with an opportunity attack, you can shift 1 square as a free action. Increase this shift to up to 2 squares at 21st level.
        ],
      );

      #theme.featBlock(
        title: "Opportunistic Shove",
        requirements: "Athletics",
        content: [
          When making an opportunity attack, you can use the Bull Rush option. On a hit, the target also grants Combat Advantage until the end of your next turn.
        ],
      );

      #theme.featBlock(
        title: "Opportunistic Withdrawal",
        content: [
          Your movement doesn't provoke opportunity attacks from enemies granting Combat Advantage to you prior to the movement.
        ],
      );

      #theme.featBlock(
        title: "Overwhelming Critical",
        content: [
          Whenever you score a critical hit, you can also knock the target prone.
        ],
      );

      #theme.featBlock(
        title: "Point-Blank Shot",
        content: [
          You gain the Prime Shot feature. (If none of your allies are nearer to your target than you are, you have combat advantage with ranged attack rolls against that target.)
        ],
      );

      #theme.featBlock(
        title: "Polearm Flanker",
        content: [
          While you are wielding a weapon with the Reach property, you and your ally are flanking an enemy if your ally and a square adjacent to you are adjacent to and on opposite sides or corners of that enemy's space.
        ],
      );

      #theme.featBlock(
        title: "Power Attack",
        requirements: "3 Strength",
        content: [
          You gain a +2 feat bonus to weapon damage with two-handed weapons, increasing to +3 at 11th level and +4 at 21st level. Additionally, whenever you make a weapon attack with a two-handed weapon, you may choose to take a -2 penalty to the attack roll. If you do so, the feat bonus is doubled for that attack.
        ],
      );

      #theme.featBlock(
        title: "Powerful Charge",
        content: [
          Whenever you charge, you deal 3 extra damage with your attack, increasing to 5 extra damage at 11th level and 10 extra damage at 21st level.
        ],
      );

      #theme.featBlock(
        title: "Power Shot",
        requirements: "3 Strength",
        content: [
          You gain a +2 feat bonus to weapon damage with ranged and thrown weapons, increasing to +3 at 11th level and +4 at 21st level. Additionally, whenever you make a weapon attack with a ranged or thrown weapon, you may choose to take a -2 penalty to the attack roll. If you do so, the feat bonus is doubled for that attack.
        ],
      );

      #theme.featBlock(
        title: "Quick Draw",
        content: [
          You can draw a weapon or object as part of the same action used to attack with the weapon or use the object. You also gain a +3 feat bonus to Initiative checks.
        ],
      );

      #theme.featBlock(
        title: "Raging Storm",
        requirements: "2 Constitution or 2 Dexterity",
        content: [
          You gain a +2 feat bonus to damage rolls when you use a power that has the Lightning or Thunder keyword. At 11th level, this feat bonus increases to +3. At 21st level, it increases to +4.
        ],
      );

      #theme.featBlock(
        title: "Rapid Assault",
        content: [
          On your first turn during an encounter, you gain a +4 power bonus to damage rolls with melee and ranged attacks. The bonus increases to +6 at 11th level and +8 at 21st level. This bonus is doubled against creatures that are Surprised.
        ],
      );

      #theme.featBlock(
        title: "Resounding Thunder",
        content: [
          You can add 1 to the size of any blast that has the thunder keyword. At 21st level, you can add 1 or 2 to the size of any blast that has the thunder keyword and 1 to the size of any burst that has the thunder keyword.
        ],
      );

      #theme.featBlock(
        title: "Roll with It",
        requirements: "Acrobatics",
        content: [
          Whenever an effect pulls, pushes, or slides you, you can shift 1 square as a free action at the end of the forced movement. At 21st level, you can instead shift up to 2 squares at the end of the forced movement.
        ],
      );

      #theme.featBlock(
        title: "Technique Master",
        content: [
          You can master and perform techniques of your level and lower.
        ],
      );

      #theme.featBlock(
        title: "Seize the Moment",
        requirements: "Human",
        content: [
          During the first round of combat and during surprise rounds, you have combat advantage against any foe whose initiative result is lower than yours. Additionally, whenever you make an initiative check and roll a natural 20, you gain an Action Point.
        ],
      );

      #theme.featBlock(
        title: "Shield Mastery",
        requirements: "Proficiency with light shields or heavy shields",
        content: [
          While wielding a shield with which you have proficiency, your shield bonus also applies to your Fortitude.
        ],
      );

      #theme.featBlock(
        title: "Shield Specialization",
        requirements: "Proficiency with Light or Heavy Shields",
        content: [
          Any shield bonuses to defense you receive while wielding a shield with which you are proficient increase by one.
        ],
      );

      #theme.featBlock(
        title: "Shifting Defense",
        content: [
          Whenever you use your Second Wind or take the Total Defense action, you can also shift 1 square. At 21st level, you can shift up to 2 squares.
        ],
      );

      #theme.featBlock(
        title: "Skill Power",
        requirements: "2nd level",
        content: [
          You gain a skill power of your level or lower from a skill in which you are trained.
        ],
      );

      #theme.featBlock(
        title: "Skill Training",
        content: [
          You gain proficiency in two additional skills. *Special*: You can take this feat more than once. Each time you select this feat, choose two additional skills.
        ],
      );

      #theme.featBlock(
        title: "Sly Hunter",
        requirements: "3 Wisdom",
        content: [
          You gain a +2 feat bonus to damage rolls with bow and crossbow attacks. This feat bonus increases to +3 at 11th level and +4 at 21st level. Against any target that has no creature within 3 squares of it, this feat bonus is doubled.
        ],
      );

      #theme.featBlock(
        title: "Spear Push",
        requirements: "3 Strength",
        content: [
          Whenever you push a foe with a polearm or spear attack, you may add 1 square to the distance pushed, or 2 squares at 21st level or higher.
        ],
      );

      #theme.featBlock(
        title: "Spring Step",
        content: [
          You can shift 1 square as a free action when you stand up. At 21st level, you can shift up to 2 squares.
        ],
      );

      #theme.featBlock(
        title: "Steady Feet",
        content: [
          Whenever an attack would knock you prone, you can make a saving throw to avoid falling prone. You gain a +2 feat bonus to Endurance checks, increasing to +3 at 21st level.
        ],
      );

      #theme.featBlock(
        title: "Surging Flame",
        content: [
          Once per turn when you deal fire damage to a creature, you can choose to inflict vulnerable 3 fire to that creature until the end of your next turn. The vulnerability inflicted increases to 5 at 11th level and 10 at 21st level.
        ],
      );

      #theme.featBlock(
        title: "Swift Recovery",
        requirements: "Endurance",
        content: [You gain a +3 feat bonus to your healing surge value. This bonus increases to +4 at 11th level and +5 at 21st level.],
      )

      #theme.featBlock(
        title: "Toughness",
        content: [
          You gain additional hit points equal to 5 + one half your level. You also gain a +2 feat bonus to Endurance checks. At 21st level, this feat bonus increases to +3.
        ],
      );

      #theme.featBlock(
        title: "Two-Weapon Defense",
        content: [
          While you are wielding two melee weapons with which you are proficient, you gain a +1 shield bonus to AC and Reflex.
        ],
      );

      #theme.featBlock(
        title: "Unarmored Agility",
        content: [
          You gain a +2 feat bonus to AC while wearing either cloth armor or no armor.
        ],
      );

      #theme.featBlock(
        title: "Vexing Flanker",
        content: [
          While you are flanking an enemy, that enemy grants combat advantage to all creatures.
        ],
      );

      #theme.featBlock(
        title: "Vicious Advantage",
        content: [
          You gain combat advantage against immobilized, slowed, and weakened targets.
        ],
      );

      #theme.featBlock(
        title: "Warding Defense",
        requirements: "Proficiency with shields",
        content: [
          Whenever you successfully use the Aid Defense action while carrying a shield with which you are proficient, the chosen ally also shares your shield bonuses to defenses until the end of your next turn.
        ],
      );

      #theme.featBlock(
        title: "Weapon Proficiency",
        content: [
          You gain proficiency in a single superior weapon of your choice, or all simple and military weapons.

          *Special*: You can take this feat more than once. Each time you select this feat, choose another weapon.
        ],
      );

      #theme.featBlock(
        title: "Watchful Redoubt",
        content: [
          You gain a +3 feat bonus to initiative. When you use your Second Wind or the Total Defense action, you can choose to reroll your initiative. Your initiative is set to the result at the start of the next round, even if it is lower.
        ],
      );

    ]

    = Paragon Feats
    #columns(3)[

      #theme.featBlock(
        title: "Blood Thirst",
        requirements: "11th level",
        content: "You have combat advantage against bloodied enemies.",
      );

      #theme.featBlock(
        title: "Devastating Critical",
        requirements: "11th level",
        content: "Whenever you score a critical hit, the target takes ongoing damage equal to your level and a -2 penalty to the defense targeted by the attack (save ends both). The ongoing damage is of the same types dealt by the critical hit, if any.",
      );

      #theme.featBlock(
        title: "Empty Vessel",
        requirements: "11th level",
        content: "The first time you drop to 0 power points during an encounter, you gain a +2 bonus to attack rolls and a +2 bonus to all defenses until the end of your next turn.",
      );

      #theme.featBlock(
        title: "Eyes in the Back of Your Head",
        requirements: "11th level",
        content: "Being flanked doesn't cause you to grant combat advantage. You gain a +2 feat bonus to Perception checks, increasing to +3 at 21st level.",
      );

      #theme.featBlock(
        title: "Gritty Determination",
        requirements: "11th level, Endurance",
        content: "Whenever you use a Daily power as a standard action, you gain temporary hit points equal to your healing surge value.",
      );

      #theme.featBlock(
        title: "Luck of the Gods",
        requirements: "11th level",
        content: "When you roll a natural 20 on an attack roll, skill check, or saving throw, remove all effects on you that a save can end.",
      );

      #theme.featBlock(
        title: "Quick Recovery",
        requirements: "11th level",
        content: "You gain one additional healing surge. Whenever you achieve a milestone, you regain a healing surge.",
      );

      #theme.featBlock(
        title: "Repel Charge",
        requirements: "11th level",
        content: "Whenever an enemy makes a charge attack against you, you can make a melee basic attack against that enemy as an opportunity action.",
      );

      #theme.featBlock(
        title: "Unexpected Escape",
        requirements: "11th level",
        content: "You gain a +4 bonus to Strength or Dexterity checks made to escape a grab and any other effect that allows you to escape. Whenever you successfully escape, you can shift 2 squares.",
      );

      #theme.featBlock(
        title: "Unfailing Courage",
        requirements: "11th level",
        content: "When you spend an action point, you can also spend a healing surge.",
      );

      #theme.featBlock(
        title: "War Wizardry",
        requirements: "11th level",
        content: "Your arcane spells take a –5 penalty on attack rolls against allies, and deal only half their normal damage to allies.",
      );

      #colbreak();

      == Elemental Feats

      #theme.featBlock(
        title: "Icy Heart",
        requirements: "11th level",
        content: "You gain a +3 feat bonus to cold damage rolls. This bonus increases to +4 at 21st level. In addition, whenever you take cold damage from an enemy attack, each enemy within 2 squares of you becomes slowed until the end of your next turn. At 21st level, this increases to each enemy within 3 squares of you.",
      );

      #theme.featBlock(
        title: "Thunder's Rumble",
        requirements: "11th level",
        content: "You gain a +3 feat bonus to thunder damage rolls. This bonus increases to +4 at 21st level. In addition, whenever you take thunder damage from an enemy attack, you can push each creature within 2 squares of you up to 2 squares. At 21st level, this increases to pushing each creature within 3 squares of you up to 3 squares.",
      );

      #theme.featBlock(
        title: "Lightning Arc",
        requirements: "11th level, 3 Constitution or 3 Dexterity",
        content: "You may choose to make any untyped damage you would deal Lightning damage. Once per turn when you score a critical hit with a power that has the Lightning keyword, you may choose another creature within 10 squares of the original target that was not a target of the triggering power. That creature takes damage as if it were hit (but not critically hit) by the triggering power.",
      );

      #theme.featBlock(
        title: "Lightning Soul",
        requirements: "11th level",
        content: "You gain a +3 feat bonus to lightning damage rolls. This bonus increases to +4 at 21st level. In addition, whenever you take lightning damage from an enemy attack, one enemy within 5 squares of you takes lightning damage equal to your level. This increases to one enemy within 10 squares of you at 21st level.",
      );

      #theme.featBlock(
        title: "Fiery Blood",
        requirements: "11th level",
        content: "You gain a +3 feat bonus to fire damage rolls. This bonus increases to +4 at 21st level. In addition, whenever you take fire damage from an enemy attack, each enemy adjacent to you takes fire damage equal to half your level. At 21st level, this increases to each enemy within 2 squares of you.",
      );

      #colbreak();

      == Divine Feats

      #theme.featBlock(
        title: "Invigorating Critical",
        requirements: "11th level, any divine class",
        content: "The first time you score a critical hit with a divine attack power during an encounter, an ally adjacent to you or adjacent to the target regains hit points equal to 10 + your Wisdom.",
      );

      #theme.featBlock(
        title: "Pervasive Light",
        requirements: "11th level, any divine class",
        content: "When you hit a target that has vulnerability to radiant damage with an attack that does not deal radiant damage, you deal extra damage equal to that vulnerability.",
      );

      #theme.featBlock(
        title: "Saving Grace",
        requirements: "11th level, any divine class",
        content: "When you succeed on a saving throw, you can choose not to end the effect you saved against and instead allow an ally within 5 squares of you to make a saving throw with a bonus equal to your Wisdom.",
      );

      #theme.featBlock(
        title: "Armored by Faith",
        requirements: "11th level, any divine class, Channel Divinity class feature",
        content: "When you use a Channel Divinity power, you gain temporary hit points equal to your Wisdom.",
      );

      #theme.featBlock(
        title: "Darkfoe",
        requirements: "11th level, any divine class, Channel Divinity class feature",
        content: "When you use a Channel Divinity power, you and each ally within 10 squares of you gain resistance to necrotic damage equal to 5 + your Wisdom until the start of your next turn.",
      );

      #colbreak();
      == Specialist Feats

      #theme.featBlock(
        title: "Fated Survival",
        requirements: "11th level, 2 Charisma",
        content: "When you fail a saving throw, you gain a +2 feat bonus to the next saving throw you make against the same effect.",
      );

      #theme.featBlock(
        title: "Occult Reach",
        requirements: "11th level, 3 Dexterity or 3 Intelligence",
        content: "When using a close implement attack power, you can choose a square within 2 squares of yours as the origin square. You are still excluded from the area of the attack. At 21st level, you can choose a square within 3 squares of your square.",
      );

      #theme.featBlock(
        title: "Defensive Advantage",
        requirements: "11th level, 3 Dexterity",
        content: "When you have combat advantage against an enemy, you gain a +2 bonus to AC against that enemy's attacks.",
      );

      #theme.featBlock(
        title: "Uncanny Dodge",
        requirements: "11th level",
        content: "Choose an ability other than Dexterity or Intelligence. While wearing light armor or no armor, you can use this ability in place of Dexterity or Intelligence to determine your AC.",
      );
    ]

    #pagebreak();

    = Multiclass Feats
    #columns(2)[
      == General
      #theme.choiceBox("Novice Power")
      *Requires: Level 3+, any class-specific multiclass feat, any encounter power with a level* #linebreak()
      You can swap one encounter attack power you know for one encounter attack power of the same level or lower from the class you multiclassed into.

      #theme.choiceBox("Acolyte Power")
      *Requires: Level 6+, any class-specific multiclass feat* #linebreak()
      You can swap one utility power you know for one utility power of the same level or lower from the class you multiclassed into. You can swap one daily attack power you know for one daily attack power of the same level or lower from the class you multiclassed into.

      #theme.choiceBox("Adept Power")
      *Requires: Level 11+, Novice Power feat, Acolyte Power feat* #linebreak()
      You can swap one level 1 at-will attack power you know for one level 1 at-will attack power from the class you multiclassed into.

      == Fighter

      #theme.choiceBox("Student of the Sword")
      Choose either one-handed melee weapons or two-handed melee weapons. Once per encounter as a free action, you can add a +1 bonus to the next attack roll you make with a weapon of that category. Whether the attack hits or misses, you mark the target until the end of your next turn.

      #theme.choiceBox("Wrathful Warrior")
      Once per encounter, when you are hit by a melee attack or a close attack, you gain temporary hit points equal to your Constitution.

      #theme.choiceBox("Cyclone Warrior")
      Once per encounter as a free action during your turn, while you are wearing light armor or chainmail and wielding a weapon in each hand, you can gain a +1 bonus to damage rolls with melee or close attacks until the end of your turn. This bonus increases to +2 at 11th level and +3 at 21st level.

      #theme.choiceBox("Brawling Warrior")
      Once per encounter while you wield a weapon in one hand and have nothing in your other hand, you can use a free action during your turn to gain a +1 bonus to an attack roll you just made or a +1 bonus to AC until the start of your next turn.

      #theme.choiceBox("Battle Awareness")
      Once per encounter, whenever an enemy that is adjacent to you shifts or makes an attack that does not include you as a target, you can make a melee basic attack against that enemy as an immediate interrupt.

      == Cleric

      #theme.choiceBox("Initiate of the Faith")
      Once per day, you can use the Cleric’s healing word power. In addition, you can use a holy symbol as an implement.

      #theme.choiceBox("Divine Healer")
      You gain the cleric's Healer's Lore class feature. In addition, you can wield cleric implements.

      == Paladin

      #theme.choiceBox("Soldier of Virtue")
      Once per day, you can use the virtue’s touch power. In addition, you can wield paladin implements.

      #theme.choiceBox("Squire of Righteousness")
      You have proficiency with holy symbols. You gain the defender aura power. You can use righteous radiance as an encounter power.

      #theme.choiceBox("Soldier of the Faith")
      Once per encounter, you can use the Paladin’s divine challenge power.
      In addition, you can use a holy symbol or a holy avenger as an implement.

      == Ranger

      #theme.choiceBox("Warrior of the Wild")
      Once per encounter, you can use the Ranger’s Hunter's Quarry class feature. The target you designate as your quarry remains your quarry until the end of your next turn.

      #theme.choiceBox("Two-Blade Warrior")
      You can wield a one-handed weapon in your off hand as though it were an off-hand weapon.

      == Rogue

      #theme.choiceBox("Ruthless Efficiency")
      You gain the Ruthless Ruffian class feature.

      #theme.choiceBox("Sly Dodge")
      Once per encounter, when an enemy makes an opportunity attack against you, you can add your Charisma to your AC against that attack.

      #theme.choiceBox("Twilight Adept")
      Once per encounter, you can use a free action during your turn to gain the benefit of the Rogue class feature Cunning Sneak until the end of your turn.

      #theme.choiceBox("Sneak of Shadows")
      Once per encounter, you can use the Rogue's Sneak Attack class feature.

      == Warlock

      #theme.choiceBox("Student of Malediction")
      Once per encounter, you can use the Warlock’s Curse class feature. The curse ends the first time you deal the extra damage from Warlock's Curse. In addition, you can wield Warlock implements.

      #theme.choiceBox("Pact Initiate")
      Choose a Warlock pact. You gain the pact's at-will power as an encounter power, and you can pursue the Warlock’s paragon path based on that pact. In addition, you can use a rod, a wand, or a pact blade as an implement.

      == Warlord

      #theme.choiceBox("Resourceful Leader")
      When an ally you can see spends an action point to make an attack, the ally gains a +3 bonus to damage rolls on a hit or gains 3 temporary hit points on a miss. This bonus increases to +5 at 11th level and +7 at 21st level. These temporary hit points increase to 5 at 11th level and 7 at 21st level.

      #theme.choiceBox("Student of Battle")
      Once per day, you can use the Warlord’s inspiring word power.

      #theme.choiceBox("Bravura Leader")
      When an ally you can see spends an action point to attack, that ally can choose to gain a +4 bonus to the attack's damage roll. If the ally chooses to use the bonus, he or she grants combat advantage to the target of the attack until the end of his or her next turn. This bonus increases to +6 at 11th level and +8 at 21st level.

      #theme.choiceBox("Skirmishing Leader")
      When an ally you can see spends an action point to take an extra action, that ally can shift 1 square as a free action before or after the extra action.

      #theme.choiceBox("Insightful Leader")
      When an ally you can see spends an action point to take an extra action, that ally gains a +1 bonus to all defenses until the end of his or her next turn.

      #theme.choiceBox("Inspiring Leader")
      Once per encounter, when an ally who can see you spends an action point to take an extra action, that ally also gains temporary hit points equal to 1 + one-half your level.

      #theme.choiceBox("Tactical Leader")
      Once per encounter, when an ally you can see spends an action point to make an attack, that ally gains a +1 bonus to the attack roll.

      == Wizard

      #theme.choiceBox("Arcane Initiate")
      Choose a 1st-level wizard at-will power. You can use that power once per encounter. In addition, you can use Wizard implements.

      == Avenger

      #theme.choiceBox("Disciple of Divine Wrath")
      You can use the Avenger’s oath of enmity power. The effect lasts until the end of your next turn. In addition, you can wield Avenger implements.

      == Barbarian

      #theme.choiceBox("Barbarian’s Fury")
      Once per day as a free action, you can gain a +2 bonus to damage rolls until the end of the encounter.

      #theme.choiceBox("Rampant Fury")
      You gain the Barbarian’s class feature Rampage.

      == Bard

      #theme.choiceBox("Basic Dilettante")
      Once per day, you can use the Bard’s majestic word power. In addition, you can wield bard implements.

      == Druid

      #theme.choiceBox("Initiate of the Old Faith")
      You gain the Druid's wild shape power. Choose a 1st-level Druid at-will attack power that has the beast form keyword. You can use that power once per encounter. In addition, you can wield Druid implements.

      #theme.choiceBox("Hunting Predator")
      While you are in beast form, you gain a +1 bonus to speed.

      == Invoker

      #theme.choiceBox("Keeper of Divine Secrets")
      Choose a 1st-level Invoker at-will attack power. You can use that power once per encounter. In addition, you can wield Invoker implements.

      == Shaman

      #theme.choiceBox("Spirit Talker")
      You gain the Shaman’s call spirit companion power, but you use it as a standard action. Choose a Companion Spirit option. You gain the at-will Shaman power associated with that option, such as Spirit’s Wrath or Spirit’s Fangs, as an encounter power. You gain speak with spirits as a daily power. In addition, you can wield Shaman implements.

      #theme.choiceBox("Mending Spirit")
      *Requires*: Spirit Talker #linebreak()
      You gain the shaman power healing spirit, but you can use it only once per encounter.

      == Sorcerer

      #theme.choiceBox("Arcane Prodigy")
      Once per encounter as a free action, you can gain a +2 bonus to your next damage roll. The bonus increases to +3 at 11th level and +4 at 21st level. In addition, you can wield sorcerer implements.

      #theme.choiceBox("Soul of Sorcery")
      Choose acid, cold, fire, force, lightning, necrotic, poison, psychic, radiant, or thunder. You gain resist 5 to that damage type. In addition, you can wield sorcerer implements.

      == Warden

      #theme.choiceBox("Defender of the Wild")
      Once per encounter as a free action, you can mark each enemy adjacent to you until the end of your next turn.

      #theme.choiceBox("Warden’s Endurance")
      Once per encounter, you can make a saving throw against one effect that a save can end at the start of your turn. On a save, the effect immediately ends, preventing it from affecting you on your current turn. If you fail the saving throw, you still make a saving throw against the effect at the end of your turn.

      == Runepriest

      #theme.choiceBox("Student of Divine Runes")
      Once per day, you can use the Runepriest’s rune of mending power.

      == Artificer

      #theme.choiceBox("Student of Artifice")
      Once per day, you can use the Artificer’s healing infusion power. The infusion you create cannot be replenished.
      In addition, you can wield Artificer’s implements.

      == Swordmage

      #theme.choiceBox("Blade Initiate")
      Once per day, when you are wielding a blade, you can invoke the Swordmage Warding class feature as a minor action. Until the end of the encounter, you gain a +1 bonus to AC (or a +3 bonus to AC if you have one hand free).
      In addition, you can use Swordmage implements.

      #theme.choiceBox("Heart of the Blade")
      You gain the Swordmage’s Swordbond class feature. In addition, you can wield Swordmage’s implements.
    ]
  ]
}
