#import "class_text.typ": classText;
#import "class_catalog.typ" as catalog;
#let fighterData = catalog.entry("modern4e.class.fighter");

#let defaultImage = "../images/classes_parent.jpg";

#let artificerQuote = classText(catalog.entry("modern4e.class.artificer").flavor.quote);

#let artificerInfo = classText(catalog.entry("modern4e.class.artificer").flavor.introduction.join("\n\n"));

#let artificerRole = classText(catalog.entry("modern4e.class.artificer").flavor.gameplay);

#let artificerImage = defaultImage;

#let avengerQuote = [Everything my god needs to say to you can be said
  with my weapon.];

#let avengerInfo = [
  In secret temples far from bustling cities and priestly hierarchies, orders of esoteric warriors train their initiates in ancient traditions now forgotten or forbidden by most religious organizations. The champions of these orders are avengers—deadly weapons in the hands of their gods, imbued with divine power through secret rites of initiation. In battle, avengers swear to execute divine vengeance, entering a mental state that gives them unerring focus on a single enemy.

  As an avenger, you were trained in a monastery, initiated through secret rites, and imbued with the power to smite your god's foes. You might be a disciple of Ioun, sworn to hunt and exterminate the minions of Vecna until you one day face the Maimed God. You could be an agent of the Raven Queen, bringing death to those who would defy your mistress. Or perhaps you serve Bahamut as an agent of justice, bringing ruin to tyrants and oppressors. The organizations devoted to your god might view you as a heretic or a hero, but you answer only to your god and to the vows you swore upon your initiation as an avenger.
];

#let avengerRole = [
  Avenger is a Wisdom-based *Divine Striker*. Holy ninja. Unarmored. Specializes in isolating a single target and killing it. Your oaths bring divine wrath upon the enemies of your god. With methodical devastation, you eliminate one foe at a time.
];

#let avengerImage = defaultImage;

#let barbarianQuote = [My strength is the fury of the wild.];

#let barbarianInfo = [
  Barbarians are savage warriors who deal out powerful blows from their mighty weapons. They charge from foe to foe and seldom feel the pain of an enemy's strike. For barbarians' foes, the moments of greatest terror come when barbarians call upon primal forces to lend power to their raging spirits. These rages, although temporary, give a barbarian incredible power--a combination of skill, willpower, and a legacy of ancient tribal rituals.

  As a barbarian, you have a link to powerful nature spirits and other primal forces bound to the warriors of your tribe by the songs and totems of your legacy. These spirits lend energy to your rages, transforming you into a devastating force on the battlefield. As you become more experienced, these rages transcend mortal limitations, manifesting directly as waves of elemental power or gifting you with supernatural recuperative powers.
];

#let barbarianRole = [
  Barbarian is a Strength-based *Primal Striker*. Charge everywhere, hit hard, yell. One of the tougher Strikers, but no slouch on damage.
];

#let barbarianImage = defaultImage;

#let bardQuote = classText(catalog.entry("modern4e.class.bard").flavor.quote);

#let bardInfo = classText(catalog.entry("modern4e.class.bard").flavor.introduction.join("\n\n"));

#let bardRole = classText(catalog.entry("modern4e.class.bard").flavor.gameplay);

#let bardImage = defaultImage;

#let clericQuote = classText(catalog.entry("modern4e.class.cleric").flavor.quote);

#let clericInfo = classText(catalog.entry("modern4e.class.cleric").flavor.introduction.join("\n\n"));

#let clericRole = classText(catalog.entry("modern4e.class.cleric").flavor.gameplay);

#let clericImage = defaultImage;

#let druidQuote = classText(catalog.entry("modern4e.class.druid").flavor.quote);

#let druidInfo = classText(catalog.entry("modern4e.class.druid").flavor.introduction.join("\n\n"));

#let druidRole = classText(catalog.entry("modern4e.class.druid").flavor.gameplay);

#let druidImage = defaultImage;

#let fighterQuote = classText(fighterData.flavor.quote);

#let fighterInfo = classText(fighterData.flavor.introduction.join("\n\n"));

#let fighterRole = classText(fighterData.flavor.gameplay);

#let fighterImage = defaultImage;

#let invokerQuote = classText(catalog.entry("modern4e.class.invoker").flavor.quote);

#let invokerInfo = classText(catalog.entry("modern4e.class.invoker").flavor.introduction.join("\n\n"));

#let invokerRole = classText(catalog.entry("modern4e.class.invoker").flavor.gameplay);

#let invokerImage = defaultImage;

#let paladinQuote = classText(catalog.entry("modern4e.class.paladin").flavor.quote);

#let paladinInfo = classText(catalog.entry("modern4e.class.paladin").flavor.introduction.join("\n\n"));

#let paladinRole = classText(catalog.entry("modern4e.class.paladin").flavor.gameplay);

#let paladinImage = defaultImage;

#let rangerQuote = [I’ll get the one in the back. That’s one hobgoblin
  who’ll regret ever lifting a bow.];

#let rangerInfo = [
  Rangers are watchful warriors who roam past the horizon to safeguard a region, a principle, or a way of life. Masters of bow and blade, rangers excel at hit-and-run assaults and can quickly and silently eliminate foes. Rangers lay superb ambushes and excel at avoiding danger.

  As a ranger, you possess almost supernaturally keen senses and a deep appreciation for untamed wilderness. With your knowledge of the natural world, you can track enemies through nearly any landscape, using the smallest clue to set your course, even sometimes the calls and songs of beasts and birds. Your severe demeanor promises a deadly conclusion to any enemy you hunt.

  When you catch sight of your quarry, will the transgressor perish by swift bow shots from a distance, or by the twofold blades that glint and glitter in each of your battle-scarred hands?
];

#let rangerRole = [
  Ranger is a Strength or Dexterity-based *Martial Striker*. Ranged or melee (dual wield), or can have a pet. High single-target damage. Hit-and-run fighting style.
];

#let rangerImage = defaultImage;

#let rogueQuote = [You look surprised to see me. If you’d been paying
  attention, you might still be alive.];

#let rogueInfo = [
  A fair fight is not in the rogue's vocabulary. Rogues find success on the battlefield by using every trick at their disposal to deceive, mislead, and ambush their enemies. They draw on their many skills to give them an edge in combat, whether that edge enables them to snatch a treasure from a villain or leap away at the last moment to thwart an attack. Rogues are survivors, and they are not above getting their hands dirty to win the day.

  A rogue relies on clever planning and quick wits to survive. Some rogues favor punishing exploits, focusing on hitting hard and inflicting terrible injuries. Others use witty banter and feints to frustrate and misdirect opponents. Others still favor acrobatics, menace, or secrecy.

  Rogues are adventurers first and foremost. One might have learned the trade on the streets, might have developed his or her powers out of necessity after fate betrayed them, or could have been apprenticed to a master thief. Some rogues join adventuring parties for the promise of treasure and have few reservations about exploring dusty tombs and labyrinthine dungeons as long as there's a reward on the other side. Not all rogues are that mercenary, however. There are things other than loot that are worth fighting for.
];

#let rogueRole = [
  Rogue is a Dexterity-based *Martial Striker*. Cunning and elusive single-target Striker. Requires having Combat Advantage on an enemy to get the most out of its Sneak Attack, frequently provided by the Defender or Controller.
];

#let rogueImage = defaultImage;

#let runePriestQuote = classText(catalog.entry("modern4e.class.runepriest").flavor.quote);

#let runePriestInfo = classText(catalog.entry("modern4e.class.runepriest").flavor.introduction.join("\n\n"));

#let runePriestRole = classText(catalog.entry("modern4e.class.runepriest").flavor.gameplay);

#let runePriestImage = defaultImage;

#let shamanQuote = classText(catalog.entry("modern4e.class.shaman").flavor.quote);

#let shamanInfo = classText(catalog.entry("modern4e.class.shaman").flavor.introduction.join("\n\n"));

#let shamanRole = classText(catalog.entry("modern4e.class.shaman").flavor.gameplay);

#let shamanImage = defaultImage;

#let sorcererQuote = [I am in the arcane, and the arcane is in me.];

#let sorcererInfo = [
  The sorcerer is the arcane antithesis of the wizard. Wielding raw, barely contained magical power, sorcerers channel bursts and blasts of arcane energy through their bodies. They gain their power not through rigorous study of esoteric tomes, but by harnessing magic in their blood, waiting to be tapped and shaped. If wizards wield magic as fighters wield swords, a sorcerer's magic is the arcing greataxe of a raging barbarian.

  You might be a proud dragonborn scion of ancient Arkhosia, calling on the draconic power of your heritage, or perhaps you were bathed in dragon blood as an infant to fill you with that power. You might have been born in a place where planar forces converged in strange eddies, infusing you with chaos, or perhaps you survived implantation of a slaad embryo, which left the taint of chaos upon you.

  Magic pulses through your veins, calling on you to give it expression. As it grows ever stronger, will it consume you or transform you into magic incarnate?
];

#let sorcererRole = [
  Sorcerer is a Charisma-based *Arcane Striker*. Glass cannon that unleashes devastating surges of arcane power. Sorcerers are defined by the type of magic that resonates with their soul; dragons, chaos, storms and cosmic energy. Specializes in multi-target damage.
];

#let sorcererImage = defaultImage;

#let swordmageQuote = classText(catalog.entry("modern4e.class.swordmage").flavor.quote);

#let swordmageInfo = classText(catalog.entry("modern4e.class.swordmage").flavor.introduction.join("\n\n"));

#let swordmageRole = classText(catalog.entry("modern4e.class.swordmage").flavor.gameplay);

#let swordmageImage = defaultImage;

#let wardenQuote = classText(catalog.entry("modern4e.class.warden").flavor.quote);

#let wardenInfo = classText(catalog.entry("modern4e.class.warden").flavor.introduction.join("\n\n"));

#let wardenRole = classText(catalog.entry("modern4e.class.warden").flavor.gameplay);

#let wardenImage = defaultImage;

#let warlockQuote = [The darkness holds no terror for me, demon!
  I curse you now under the Sign of Ill Omen!];

#let warlockInfo = [Warlocks channel arcane might wrested from primeval entities. They commune with infernal intelligences and fey spirits, scour enemies with potent blasts of eldritch power, and bedevil foes with hexing curses. Armed with esoteric secrets and dangerous lore, warlocks are clever and resourceful foes.

  However you came to your arcane knowledge, you need not accept the poor reputation warlocks sometimes endure. You could be a libram-toting scholar captivated by ominous lore, a foot-loose wanderer searching for elusive ultimate truths, a devil-touched hunter using infernal spells to eliminate evil, or even a black-clad mercenary who uses sinister trappings to discourage prying strangers and unwanted attention. On the other hand, you could be a true diabolist using your gifts to tyrannize the weak—some warlocks unfortunately are exactly that.

  The pacts are complete. The rites have concluded. The signs are drawn in blood, and the seals are broken. Your destiny beckons.];

#let warlockRole = [Charisma or Constitution-based Arcane Striker. Cast debilitating curses upon your foes to hamper or weaken them as you deal damage. Practically all their damaging moves come with a debuff. You can elude attacks by flying, teleporting, or turning invisible with the power of your patron, a powerful, supernatural force or entity.];

#let warlockImage = defaultImage;

#let warlordQuote = classText(catalog.entry("modern4e.class.warlord").flavor.quote);

#let warlordInfo = classText(catalog.entry("modern4e.class.warlord").flavor.introduction.join("\n\n"));

#let warlordRole = classText(catalog.entry("modern4e.class.warlord").flavor.gameplay);

#let warlordImage = defaultImage;

#let wizardQuote = classText(catalog.entry("modern4e.class.wizard").flavor.quote);

#let wizardInfo = classText(catalog.entry("modern4e.class.wizard").flavor.introduction.join("\n\n"));

#let wizardRole = classText(catalog.entry("modern4e.class.wizard").flavor.gameplay);

#let wizardImage = defaultImage;
