#import "../helpers/theme.typ" as theme;
#import "../helpers/powers.typ" as powers;

// Source: Zeitgeist Player's Guide, “The Investigation Begins”, pp. 7–16.
#let themePower(title: str, themeName: str, type: powers.powerType.encounter, action: powers.actionType.standard, range: [Personal], traits: none, description: none, target: none, trigger: none, requirement: none, offenseStat: none, defenseStat: none, rows: ()) = {
  powers.power(
    title: title,
    bonusTitle: themeName + " 1",
    type: type,
    action: action,
    range: range,
    traits: traits,
    description: description,
    target: target,
    trigger: trigger,
    requirement: requirement,
    offenseStat: offenseStat,
    defenseStat: defenseStat,
    additionalRows: rows,
  )
}

#let zeitgeistThemesPage() = [
  Choose one of these nine themes to connect your character to the Zeitgeist setting. A theme's role describes the capabilities it adds; it need not match your class's role. You gain its starting benefits at level 1 and its additional benefits at levels 5 and 10. Theme powers are granted by the theme, rather than purchased with utility picks.

  #table(
    columns: (auto, auto, 1fr),
    stroke: 0.5pt + theme.tableDivider,
    fill: theme.defaultTableStyleWithFirstColumnHeaders(),
    inset: 6pt,
    [*Theme*], [*Role*], [*Concept*],
    [Docker], [Leader], [Working-class artists, performers, and philosophers.],
    [Eschatologist], [Controller], [Philosophers of proper endings.],
    [Gunsmith], [Striker], [Designers and wielders of custom firearms.],
    [Martial Scientist], [Striker], [Educated, analytical warriors.],
    [Skyseer], [Leader], [Folk prophets who read the stars.],
    [Spirit Medium], [Controller], [Mentalists who communicate with spirits.],
    [Technologist], [Controller], [Inventors and masters of devices.],
    [Vekeshi Mystic], [Defender], [Patient protectors who rebuild after tragedy.],
    [Yerasol Veteran], [Defender], [Celebrated survivors of naval warfare.],
  )

  = Using these themes
  These themes use the local skill names and proficiency rules. References to a primary ability modifier mean the points in your Main Ability. Use the local skill-check formula and DC table; the source's Medium difficulty is Normal here. The HOMEBREW instruction to ignore old theme skill bonuses does not apply to these Zeitgeist benefits.

  Prestige, favors, and requisitions use the campaign rules in the Player's Guide (Prestige, p. 20; requisitions, p. 22). A theme that changes starting Prestige sets it to 2 instead of 1; it does not add 1 for every character with that theme. Suggested paragon paths below are pointers to the guide, not additional theme benefits.

  The associated paths are collected in #link(<zeitgeist-paragon-paths>)[Zeitgeist Paragon Paths] on page #context counter(page).at(<zeitgeist-paragon-paths>).first().

  *Source:* _Zeitgeist Player's Guide: The Investigation Begins_, pp. 7–16, including the original theme illustrations.

  #pagebreak()
  #theme.subPageTitle(title: "Docker")
  #columns(2)[
    *Role: Leader.*

    Flint's docks bring together poorly paid laborers, educated engineers, and refugees from the wars between Danor and Drakr. Their shared culture has produced graffiti artists, musicians, dancers, and amateur philosophers who brighten soot-covered warehouses and challenge public figures with humorous moral puzzles. Fey pepper, strong drink, and lively arguments are common companions to their art.

    Sometimes their criticism becomes too pointed or their gatherings turn into riots. Both dockers and police have suffered in these clashes, and accidental deaths strain relations. Governor Roland Stanfield nevertheless has a soft spot for these mild anarchists.

    = Playing a Docker
    You need not perform publicly to share the docker spirit: anyone who endures hard work and low wages while appreciating intelligent art belongs. As conditions worsen, workers increasingly look to dockers for relief. A good docker also needs to survive a scrap.

    Some leave the scene with help from sympathetic bar owners or police, spreading docker culture into slums and farms. One popular song tells of a graffiti artist who fled to Crisillyir and now paints subversive interpretations of Clergy doctrine in cathedrals.

    #align(center)[
      #image("../images/zeitgeist-themes/docker.jpg", width: 100%, height: 10.5cm, fit: "contain")
    ]

    #colbreak()

    = Level 1
    The party's starting Prestige with Flint is *2 instead of 1*. You gain *Docker's Jank*.

    #themePower(
      title: "Docker's Jank",
      themeName: "Docker",
      traits: "Arcane, Teleportation",
      range: [Close burst 5],
      description: [Every musician knows the others' parts, ready to switch places or pick up the slack.],
      rows: ([*Effect:* You and a willing ally within the burst teleport and switch locations. That ally may then use an at-will power that can be performed as a standard action, with a +2 power bonus to its attack rolls.],),
    )

    = Level 5: Sing Your Praises
    A song about your team's exploits, perhaps written by you, has become wildly popular in Flint. Once per day, as a *minor action*, shout a line to inspire your allies. You and each ally in a *close burst 5* can make a saving throw. The burst increases to *10 at level 11* and *15 at level 21*.

    = Level 10: Audience Participation
    If friendly noncombatants are present and aware that you are in combat, each enemy takes *5 damage for each square of those noncombatants it is adjacent to* when it starts its turn.

    = Further connections
    The *Notorious Celebrity* paragon path (guide p. 28) lets reputation itself affect your enemies. Musician and adventurer Rock Rackus claims to have explored fiery dungeons, visited the moon, and cuckolded a fey king.
  ]

  #pagebreak()
  #theme.subPageTitle(title: "Eschatologist")
  #columns(2)[
    *Role: Controller.*

    The Heid Eschatol movement began with the Drakran dwarf Vlendam Heid's treatise _On the Proper Endings of Things_. Its account of the Lost Riders explained the dwarven habit of defining civilizations and eras by their endings. In three decades, it inspired an academic discipline devoted to ending everything properly: romances, friendships, business arrangements, wars, serialized stories, and lives.

    Heid's disciples are eschatologists, students of the world's end. Their popularity reinforces Drakr's fascination with apocalyptic prophecy. The Clergy denies that the dwarven endtimes are near and distrusts the movement.

    = Playing an Eschatologist
    Dwarves of many nations sympathize with Heid. Veterans of the border wars often find comfort in an orderly judgment day. Apocalyptic cults are increasingly treated as religious sects rather than fringe madness, although most adherents outside Drakr seek reasoned acceptance of death rather than expect imminent destruction.

    Consider life's thresholds and endings, keep your will updated, and learn your companions' wishes should they die. Some followers rush toward death; most carefully guard against an accidental demise that would spoil their plans.

    #align(center)[
      #image("../images/zeitgeist-themes/eschatologist.jpg", width: 100%, height: 10.5cm, fit: "contain")
    ]

    #colbreak()

    = Level 1
    The first time each encounter that a creature you are aware of would die, you may have it *stabilize instead*. If it would have died from damage, it dies if it takes any further damage before receiving healing. You also gain *Icy End of the Earth*.

    #themePower(
      title: "Icy End of the Earth",
      themeName: "Eschatologist",
      traits: "Psionic, Cold",
      range: [Close burst 2],
      requirement: [You must be bloodied.],
      description: [As you sense your mortality, the world's frozen ending manifests around you.],
      rows: (
        [*Effect:* Create a stationary zone of unnatural winter in the area until the end of your next turn. Creatures in it cannot heal damage or gain temporary hit points. Any creature starting its turn in the zone, including you, takes *5 cold damage* (*10 at level 11; 15 at level 21*).],
        [*Sustain Minor:* You must be bloodied. If outside the zone, you take 5 cold damage. If inside, you can sustain without spending an action. You cannot heal or gain temporary hit points while this power is active.],
        [*Special:* You cannot reduce this power's damage to you by any means. Other creatures' resistances and immunities work normally.],
      ),
    )

    = Level 5: It Will All Turn to Dust
    When you use *Icy End of the Earth*, you may peel away impermanent physical structures. If you do, creatures within the zone can move through man-made objects and structures less than *1,000 years old* as if they had phasing.

    = Level 10: Gaze into the Abyss
    While you are dying, your allies gain a *+5 bonus to damage rolls*.

    = Further connections
    The *Logos* paragon path (guide p. 25) allows speech to alter reality. Grandis Komanov leads frost-bitten, beardless dwarves in the far north; rumor says she exists partly at the end of time and no living creature can harm her.
  ]

  #pagebreak()
  #theme.subPageTitle(title: "Gunsmith")
  #columns(2)[
    *Role: Striker.*

    Fusils have existed for centuries, using explosive alchemy to propel bullets. They once compared poorly with accurate, safer magic. After the Great Malice, Danor refined them into modern guns. Industrial production now equips armies in Risur and Drakr with firepower comparable to trained sorcerers.

    Gunsmiths do more than buy weapons: they tinker, trade secrets, and combine chemistry with spellcraft now that guns have spread beyond Danor's dead-magic lands. Governor Stanfield plans an exposition in Flint to display such inventions.

    = Playing a Gunsmith
    You might practice trick shots endlessly, enchant your pistols, admire their appearance, or use the fear they inspire. Some decorate their weapons with elaborate inlays and romanticize their deadly purity. Others see only cheap, efficient killing. Lerema Kurtz supposedly conjures a cannon from her petticoat pocket.

    #align(center)[
      #image("../images/zeitgeist-themes/gunsmith.jpg", width: 100%, height: 10.5cm, fit: "contain")
    ]

    #colbreak()

    = Level 1
    You can perform *Enchant Magic Item* to create *firearms, firearm ammunition, and alchemical items*. You can requisition advanced Drakran weapons such as grenades and rifles without increasing the request's Favor level. You gain *The Man with Two Guns Is God*.

    #themePower(
      title: "The Man with Two Guns Is God",
      themeName: "Gunsmith",
      traits: "Martial, Weapon",
      range: [Ranged weapon],
      target: [One creature; see Effect],
      offenseStat: powers.offense.mainCharacteristic,
      defenseStat: powers.defense.ac,
      description: [You have discovered the coolest-looking fighting style in the world.],
      rows: (
        [*Effect:* You may drop, sheathe, or store what you hold, then draw one or two firearms. If wielding two firearms, you can target one additional creature within 5 squares of the first.],
        [*Hit:* 1[W] damage, and the target cannot take opportunity actions until the end of your next turn. When making two attacks, one target takes the primary-hand weapon's damage and the other the off-hand weapon's damage. *Level 11:* 2[W]. *Level 21:* 3[W].],
        [*Special:* This power does not provoke opportunity attacks.],
      ),
    )

    = Level 5: Tinker
    Declare one weapon your primary weapon. Each firearm you wield can benefit from that weapon's *enhancement bonuses to attack and damage*. Apply the local intrinsic-bonus rules normally; this does not create an additional stacking bonus.

    You also develop *one modification* from the following page and can apply it to up to *five firearms*, yours or your allies'. You cannot mass-produce it.

    = Level 10: Bling
    Develop a *second modification*, also applicable to five firearms. Both modifications can go on the same guns or be divided among different weapons.

    = Further connections
    The *Mad Shootist* paragon path (guide p. 26) explores freeze rays, rocket launchers, and shrink rays. Trekhom's arms markets offer conventional explosives and ballistics; its harbor cannons can crack ironclads. Flint's autumn Kaybeau Arms Fair attracts inventors from many nations.
  ]

  #pagebreak()
  #theme.subPageTitle(title: "Gunsmith Modifications", outlined: false)
  #columns(2)[
    = Alchemical Launcher
    As a *standard action*, load one alchemical item or grenade into this underslung launcher. Use the loaded item as if it were in your hand.

    If it normally requires an attack roll, use your gun's attack bonus. If it normally makes a ranged attack, use your gun's range. If it normally makes an area attack, use your gun's short range and the item's normal area.

    = Ammunition Clip
    A pistol's revolver cylinder holds *six shots*. A carbine, musket, or shotgun's stripper clip holds *five rounds*. With an Alchemical Launcher as well, you can also load *three alchemical items*.

    Reloading takes a *minor action*.

    = Cover-Piercing Bullets
    Your modified barrel fires heavier rounds. If you miss a target with cover by *2 or less*, or one with superior cover by *5 or less*, deal *half damage*. If a creature provides the cover, it also takes half damage.

    You can attack a creature with *total cover* at a *–5 penalty* to the attack roll, dealing half damage on a hit. These rounds generally penetrate less than a foot of wood or dirt, a few inches of stone, or half an inch of metal.

    #colbreak()

    = Sniper Scope
    This finely tuned telescopic sight can be attached only to *rifled weapons*. While aiming through it, you are considered *blind except against creatures in a direct line from you to your target*.

    Quadruple all range increments for the attack against that target and deal an extra *1[W] damage*, increasing to *2[W] at level 11* and *3[W] at level 21*.

    = Suppressor
    Your shots are very quiet. If hidden when you attack, you remain hidden from creatures *more than 10 squares away*. A creature hit still knows the direction of the shot.
  ]

  #pagebreak()
  #theme.subPageTitle(title: "Martial Scientist")
  #columns(2)[
    *Role: Striker.*

    Danoran war academies teach combat as a science. Students write theses on famous warriors and defend theorems about swordplay alongside their physical training. Danor honors graduates as other nations honor poets and sculptors, and successful techniques have inspired similar schools throughout Lanjyr.

    Students study anatomy through autopsies, the physical principles of attack and defense, and the psychology and sociology of war—from an invasion's human cost to a particular sword technique's cultural meaning.

    = Playing a Martial Scientist
    Risur's Banhaman Academy in Slate produces siege engineers and artillerists; the Battalion outside Flint trains outstanding wilderness forces. Even small schools run by retired soldiers produce contentious theses, such as one contrasting a single stealthy rapier with twin long swords.

    Drakran schools stress endurance and fighting with scarce resources. Crisillyiri schools emphasize theology and monstrous anatomy. Ber's war college maintains a vast collection of battle songs, supposedly to improve courage and accuracy, perhaps simply to calm its students. Work with the GM to decide your thesis, unless you left before graduating.

    #align(center)[
      #image("../images/zeitgeist-themes/martial-scientist.jpg", width: 100%, height: 10.5cm, fit: "contain")
    ]

    #colbreak()

    = Level 1
    Gain *proficiency in Society*. If already proficient, choose another skill instead. Gain *proficiency with all military weapons*.

    You can learn martial scientist techniques from other martial scientists during the campaign. Record those you learn. At the end of an *extended rest*, choose one known technique; you have access to its power for the day. You start knowing *Experimental Strike*.

    These are the theme's own techniques, separate from the rulebook's general technique picks.

    #themePower(
      title: "Experimental Strike",
      themeName: "Martial Scientist",
      traits: "Martial, Weapon",
      action: powers.actionType.free,
      trigger: [You miss all targets with an at-will attack power on your turn.],
      description: [The reliable method failed. It is time to try option B.],
      rows: (
        [*Effect:* You may sheathe a weapon or implement and/or draw a melee weapon. Shift 2 squares and attempt an improvised action the rules do not otherwise cover, such as cutting a chandelier's rope to pin an enemy or breaking a pipe to spray blinding steam. The GM adjudicates the attempt. After the attack, you may sheathe a weapon and/or draw a weapon or implement.],
        [*Special:* You can use only one martial scientist technique per day. At the end of an extended rest, you can swap this power for another known technique's power.],
      ),
    )

    = Level 5: Martial Mythbuster
    When a creature misses you with an attack, you can use *Experimental Strike* as an *immediate reaction*.

    = Level 10: Doctor of Modern Warfare
    Gain proficiency with *all weapons, armor, and implements*. You can change your selected martial scientist technique after a *short rest* as well as an extended rest.

    = Further connections
    This theme rewards collecting unusual techniques and exploiting niche situations. The *Polyhistor* paragon path (guide p. 29) lets you devise techniques in battle. Henri Jierre, founder of the Jierre Sciens d'Arms academy, supposedly needed no more than three sword strokes to defeat any foe.
  ]

  #pagebreak()
  #theme.subPageTitle(title: "Skyseer")
  #columns(2)[
    *Role: Leader.*

    Ancient lore speaks of mortals traveling to the stars with lost magic. Druids first noticed connections between celestial motions and worldly affairs, discovered paths into the Dreaming and Bleak Gate, and helped King Kelland defeat the fey titans. For over a millennium, skyseers watched the heavens and awaited prophetic dreams that guided heroes and averted disasters. At Srasama's fall, their warnings saved hundreds of eladrin women.

    Their visions have grown vague in recent centuries. They failed to foresee Danor's industrial rise or prevent many tragedies. Risur still observes their rituals, but their influence is fading and few young people join them.

    = Playing a Skyseer
    Perhaps childhood stargazing led to a prophetic dream and apprenticeship to an elder druid. You learned the planets, stars, and their influences. Precise visions are rare, yet travel magic still works best under a full moon, and sailing when Jiese turns retrograde in the Mad Pirate constellation foretells disaster.

    Skyseers favor night and can tell time as accurately as a clock by glancing at the stars. Many Risuri captains refuse to sail beyond sight of land without one. Old ties provide welcome in many homes and villages, provided you avoid unwelcome prophecy. Read the guide's *Planets and Planes* sidebar (p. 48).

    #align(center)[
      #image("../images/zeitgeist-themes/skyseer.jpg", width: 100%, height: 10.5cm, fit: "contain")
    ]

    #colbreak()

    = Level 1
    Gain *Skyseer Vision* and *Look Skyward*.

    #themePower(
      title: "Skyseer Vision",
      themeName: "Skyseer",
      type: powers.powerType.daily,
      action: "Extended Action",
      traits: "Primal",
      requirement: [During an extended rest, watch the night sky for an hour, then sleep.],
      rows: ([*Effect:* Ask up to three questions about possible courses of action in the near future. At the end of the rest, awaken with a prophetic dream answering them in vague, guiding images, similar to the _Hand of Fate_ ritual.],),
    )

    #themePower(
      title: "Look Skyward",
      themeName: "Skyseer",
      action: powers.actionType.minor,
      traits: "Primal",
      range: [Close burst 5],
      target: [One ally in the burst],
      rows: (
        [*Effect:* The ally chooses an attack power it knows, rolls 1d20, and records the result. The next time it would make an attack roll for that power this encounter, it must use this result instead. Only the first roll is replaced for a power with multiple targets or attack rolls.],
        [*Special:* Effects and powers can still modify that attack roll, including rerolls, bonuses for an action-point attack, or rolling a second die and choosing the better result.],
      ),
    )

    = Level 5: Follow Yonder Star
    When you spend an action point, your enemies' opportunity attacks against you or your allies *miss until the end of your next turn*.

    = Level 10: Handy Intuition
    Once per day, as a *free action*, produce a mundane item you can carry, having intuitively prepared it. Retroactively pay the costs of obtaining and keeping it. You cannot produce an item circumstances would have made impossible to possess, such as equipment seized during capture or a huge shield after crawling through a narrow tunnel.

    = Further connections
    The *Applied Astronomist* paragon path (guide p. 23) manifests the planets' powers. You may discover why skyseer visions have become so vague.
  ]

  #pagebreak()
  #theme.subPageTitle(title: "Spirit Medium")
  #columns(2)[
    *Role: Controller.*

    Industrial weapons put lethal power within ordinary people's reach. Spirit mediums ask why knowledge of the soul should remain the preserve of priests. Some exploit grieving aristocrats, but others use psionic meditation—a séance—to contact the dead.

    A few reserve this talent for those in sincere need and train only like-minded students. Most reject such exclusivity as another form of organized religion and gladly awaken a spirit for a few coins.

    = Playing a Spirit Medium
    The Royal Homeland Constabulary eagerly recruits people who can question the recently dead. Investigations involve fewer family messages than ordinary medium work, although conveying such messages can persuade an otherwise uncooperative spirit to reveal secrets.

    #align(center)[
      #image("../images/zeitgeist-themes/spirit-medium.jpg", width: 100%, height: 10.5cm, fit: "contain")
    ]

    #colbreak()

    = Level 1
    Gain *Speak with Spirit* and *Unfinished Business*.

    #themePower(
      title: "Speak with Spirit",
      themeName: "Spirit Medium",
      type: powers.powerType.daily,
      traits: "Psionic",
      range: [Close burst 1],
      target: [One creature in the burst that died within the past day and remains dead],
      rows: (
        [*Effect:* Ask three questions. For each, make an *Arcana, Diplomacy, or Insight check*. Use the target's level and an *Easy, Normal, or Hard DC*, depending on its attitude toward you at death and how protective it is of the information. On a success it gives a short answer, usually no longer than a minute.],
        [*Special:* At the GM's discretion, you may contact uneasy spirits that have not moved on, regardless of how long they have been dead. Using this against undead or during combat is possible but very difficult.],
      ),
    )

    #themePower(
      title: "Unfinished Business",
      themeName: "Spirit Medium",
      traits: "Conjuration, Psionic",
      range: [Close burst 10],
      rows: ([*Effect:* Choose a creature killed or destroyed this encounter within *3 miles* of your current location that remains at *0 hit points or fewer*. Conjure its spirit in a square within the burst. It makes one of its at-will attacks as if alive; you choose the power and all decisions, including targets and forced movement. It gains a *+2 power bonus to attack rolls* for this attack and deals *full damage to insubstantial targets*. The spirit is removed from play afterward.],),
    )

    = Level 5: Psychic History
    Once per day, spend *1 minute holding an object* to see an image from its history. You see *two images at level 11* and *three at level 21*, plus *one additional image if proficient in Arcana*. More recent and more prominent images appear first. You can use this ability only *once per object*.

    = Level 10: Ghostly Whisper
    Communicate telepathically with creatures you are aware of within *10 squares*. You must share a language; they can reply in kind.

    = Further connections
    The *Urban Empath* paragon path (guide p. 32) communicates with the spirits of cities and invokes their powers. The famous halfling medium Jared Smithee fled after claiming to receive a message from Danor's last Sovereign at the state funeral.
  ]

  #pagebreak()
  #theme.subPageTitle(title: "Technologist")
  #columns(2)[
    *Role: Controller.*

    Technologists tinker, invent, collect, study, and pester engineers. Their devices often sit on the border between clever and impractical. Danoran academies teach specialized fields; Drakran masters oversee large teams of apprentices. Crisillyir and its Elfaivaran colonies punish such work with holy flagellation, while native eladrin find technology as unsettling as the inhabitants of the Dreaming do. Ber's court, by contrast, welcomes enterprising inventors.

    = Playing a Technologist
    Law enforcement and militaries struggle to keep pace after centuries of swords, armor, bows, and magic. They enlist specialists to explain strange devices and build custom tools. Mass production supplies common equipment, but custom inventions remain rare.

    Carry disposable tools and weapons for unexpected problems. You might study magic or alchemy too; every technologist has a different vision of what invention can accomplish.

    #align(center)[
      #image("../images/zeitgeist-themes/technologist.jpg", width: 100%, height: 10.5cm, fit: "contain")
    ]

    #colbreak()

    = Level 1
    You have access to technological information and resources unavailable to most characters. Gain *Disposable Simulacrum*.

    #themePower(
      title: "Disposable Simulacrum",
      themeName: "Technologist",
      action: powers.actionType.minor,
      traits: "Arcane, Summoning",
      range: [Adjacent unoccupied square],
      description: [You bind a prepared gadget to your life force so it can imitate your fighting technique.],
      rows: (
        [*Effect:* Place a *Small contraption* in an adjacent unoccupied square. It has *your defenses, speed 4*, and hit points equal to *half your bloodied value*.],
        [Choose an at-will power you know. Spend a *standard action* to have the contraption use it. You can spend actions to sustain the power if applicable. You cannot augment it with power points.],
        [Spend a *move action* to have it take a move action. Its simple limbs manipulate objects only about as well as a dog with no mouth, unless the chosen power allows otherwise.],
        [The contraption lasts until the encounter ends or you deactivate it as a *free action*. If destroyed, repair it during an *extended rest*.],
      ),
    )

    = Level 5: Mechanical Pet
    Your contraption now follows the rules for an *animal companion*, with *your defenses, speed 6*, and hit points equal to *half your bloodied value*. It has *–3 Strength points* (the source’s Strength score of 4).

    Instead of its own attacks, it uses your chosen at-will power. It can manipulate objects with the dexterity of a trained monkey. Whenever you take a move action, it can also take a move action.

    If you are unconscious or otherwise unable to command it, it can act independently, first moving adjacent to you and then trying to protect you.

    = Level 10: Second Self
    You can use *any at-will or encounter power you know* through your contraption, choosing a different one each round. You can see and hear from its location.

    = Further connections
    The *Steamsuit Pilot* paragon path (guide p. 30) builds a machine you can wear in battle. Risuri industrialist Benedict Pemberton, wealthy from ordinary factories, is reportedly recruiting engineers and mages for a secret project involving more exotic creations.
  ]

  #pagebreak()
  #theme.subPageTitle(title: "Vekeshi Mystic")
  #columns(2)[
    *Role: Defender.*

    When Srasama died and nearly all eladrin women perished, many survivors sought suicidal vengeance. The composer Vekesh taught that defeat becomes a final tragedy only if survivors let the story end there. Revenge distracts from grief without creating value; resilience, renewal, and prosperity truly thwart an enemy's goals.

    His teachings saved isolated eladrin communities and spread throughout Lanjyr as guidance for coping with loss. Most followers avoid violence. The public nevertheless associates “vekeshi” with terrorists and murderers, because the order's rare battle-trained mystics take up arms to protect vulnerable people.

    = Playing a Vekeshi Mystic
    Casual study is open to anyone; mystical initiation is painful and secret. Taken into the Dreaming, initiates relive Srasama's fall through psychic illusions. Imprisonment, poisoned food, and starvation teach endurance and patience. Burning and magical healing seal the flames' power into them. Recovery in luxury follows, alongside instruction in philosophy and discretion.

    Mystics return to ordinary lives and seek influence in armies, law enforcement, or the underworld to punish those who repeatedly threaten people rebuilding their lives. Secret festivals take place in the Dreaming on irregular lunar holidays. Only rarely does a mystic act openly, wearing eladrin armor and a concealing mask as Srasama's hand against a perpetrator of great suffering.

    #align(center)[
      #image("../images/zeitgeist-themes/vekeshi-mystic.jpg", width: 100%, height: 10.5cm, fit: "contain")
    ]

    #colbreak()

    = Level 1
    The party's starting Prestige with the *Unseen Court is 2 instead of 1*. Gain *Hands of Retribution*.

    #themePower(
      title: "Hands of Retribution",
      themeName: "Vekeshi Mystic",
      traits: "Divine, Fire, Radiant",
      action: powers.actionType.free,
      range: [Burst radius unspecified in source; GM ruling required],
      trigger: [A creature you can see in the burst hits an ally who is bloodied before or after the attack.],
      target: [The triggering creature],
      description: [A six-armed goddess of flame retaliates when your allies are hurt.],
      rows: (
        [*Effect:* Deal *fire and radiant damage equal to your Main Ability points* to the target.],
        [*Special:* Use once per encounter at level 1, *twice at 6, three times at 11, four at 16, five at 21, and six at 26*, but never more than *once per round*.],
      ),
    )

    = Level 5: Vengeful Gaze of the Goddess
    Once per day, as a *minor action*, choose a target you can see. You unerringly know the direction to it until you take an *extended rest*.

    = Level 10: Patient Revenge
    When an encounter begins against an enemy whose identity you know and who has antagonized you before, in battle or otherwise, gain temporary hit points equal to *half your bloodied value*.

    Additionally, if you can see an enemy on your turn but take no hostile actions, you have *resist 10 all*. The source does not specify when this resistance ends; resolve its duration with the GM.

    = Further connections
    The *Vekeshi Excoriant* paragon path (guide p. 33) channels Srasama's power. Keep the order's secrets from other players and ask the GM about mystics operating in Flint and beyond.
  ]

  #pagebreak()
  #theme.subPageTitle(title: "Yerasol Veteran")
  #columns(2)[
    *Role: Defender.*

    The lush Yerasol Archipelago hosted two centuries of intermittent war between Risur and Danor over wealthy plantations. Thousands died amid its rainforests and flowered beaches. Survivors escaped infections, injury, and trauma to turn military glory into wealth or political influence.

    Poets celebrated the greatest deeds of four wars, the last ending seven years ago. Some supposed heroes merely survived to take credit for another's courage; others performed extraordinary acts and lived to have witnesses tell their stories.

    = Playing a Yerasol Veteran
    Everyone recognizes a few veterans' names. Your story made you something of a celebrity, even if you dislike retelling it. Public admiration does not erase memories of dead friends.

    Risur and Danor have learned to support their heroes with comfortable jobs and help returning to civilian life. Neither wants a decorated veteran becoming a public embarrassment. This aid lets many become community pillars, but quickly disappears if a hero criticizes the homeland.

    #align(center)[
      #image("../images/zeitgeist-themes/yerasol-veteran.jpg", width: 100%, height: 10.5cm, fit: "contain")
    ]

    #colbreak()

    = Level 1
    The party's starting Prestige with *Risur is 2 instead of 1*. Gain *Display of Heroism*.

    #themePower(
      title: "Display of Heroism",
      themeName: "Yerasol Veteran",
      traits: "Martial",
      description: [You rush into danger to cover an ally's escape.],
      rows: ([*Effect:* Shift *3 squares*. One *bloodied or unconscious ally adjacent to you* can spend a healing surge and may stand as a free action. You may then switch spaces with that ally. You both gain a *+2 bonus to all defenses until the end of your next turn*.],),
    )

    = Level 5: Courage Under Fire
    Once per day, when an ally is reduced to *0 hit points or below*, you may gain an *action point*. If you do, you can spend *one additional action point this encounter*, but still no more than *one per turn*.

    = Level 10: Call of Duty
    Whenever you roll *1–7 on an Initiative check*, treat the roll as an *8*.

    = Further connections
    The *Monument of War* paragon path (guide p. 27) brings wartime memories to life as gunfire and artillery. The source also recommends the naval rules in _Seas of Zeitgeist_, Appendix K (p. 516), or E.N. Publishing's _Admiral o' the High Seas_. King Aodhan famously sailed into Danor's capital harbor, seized its flagship, and sailed home with the prize.
  ]
]
