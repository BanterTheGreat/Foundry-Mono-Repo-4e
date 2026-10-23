#import "../helpers/theme.typ" as theme;
#import "../helpers/powers.typ" as powers;

// Source: Zeitgeist Player's Guide, The Investigation Begins, pp. 22–33.
#let pathPower(title: str, path: str, level: int, type: powers.powerType.encounter, action: powers.actionType.standard, traits: none, range: [See effect], target: none, trigger: none, defense: none, rows: ()) = powers.power(
  title: title,
  bonusTitle: path + " " + str(level),
  type: type,
  action: action,
  traits: traits,
  range: range,
  target: target,
  trigger: trigger,
  offenseStat: if defense != none { powers.offense.mainCharacteristic } else { none },
  defenseStat: defense,
  additionalRows: rows,
)

#let zeitgeistPathsPage() = [
  #theme.pageTitle(title: "Zeitgeist Paragon Paths")
  <zeitgeist-paragon-paths>

  At level 11, you can choose one of these paths in place of a class paragon path if you meet its prerequisites. These paths grow out of the nine Zeitgeist themes, but your theme does not oblige you to choose its associated path. Each path also offers an alternative prerequisite for characters who join its tradition during play.

  For these paths' implement powers, you can use *any weapon or implement with which you are proficient* as an implement. Their attacks and damage use your *Main Ability points* where the source refers to a primary ability score or modifier. Skill training means proficiency; History is Society and Heal is Medicine. Ability-score prerequisites of 15 become *2 points*. Use the local skill-check formula and DC table except where a rule explicitly gives a fixed DC.

  Powers below are granted at their listed levels. Other path features retain their listed timings, costs, and limitations. These imported paths include level 20 powers; the book's warning that higher-level play is not fully verified still applies.

  #table(
    columns: (1fr, 1fr),
    stroke: 0.5pt + theme.tableDivider,
    fill: theme.defaultTableStyle(),
    inset: 6pt,
    [*Path*], [*Associated theme*],
    [Applied Astronomist], [Skyseer],
    [Logos], [Eschatologist],
    [Mad Shootist], [Gunsmith],
    [Monument of War], [Yerasol Veteran],
    [Notorious Celebrity], [Docker],
    [Polyhistor], [Martial Scientist],
    [Steamsuit Pilot], [Technologist],
    [Urban Empath], [Spirit Medium],
    [Vekeshi Excoriant], [Vekeshi Mystic],
  )

  *Source:* _Zeitgeist Player's Guide: The Investigation Begins_, pp. 22–33.

  #pagebreak()
  #theme.subPageTitle(title: "Applied Astronomist")
  #columns(2)[
    Skyseers can harness the distant planes' subtle influence to change themselves, summon destructive energies, and reshape their surroundings. Hugo Theroby, the last skyseer to unlock these powers, died in 493. His unfinished Cloudwood observatory now shelters pixies with unusual magic.

    *Prerequisite:* Skyseer theme, or proficiency in Arcana and Nature and training by a skyseer.

    = Level 11 Features
    *Stargazer:* Gain darkvision. You cannot be blinded.

    *Touching the Wheel of Heaven:* After an extended rest, if you spent an hour watching the night sky in the past day, roll 1d8 twice on the planar connections list, rerolling duplicates. You connect to those two planes until your next extended rest, to a maximum of 24 hours. Your connections determine the available effects of your path powers and Space Travel.

    *Walking the Cosmos:* When you spend an action point, the next power you use this turn has unlimited range. You must still see its target or origin square.

    = Planar Connections
    + *Jiese:* Fire.
    + *Avilona:* Air.
    + *Av:* Dreams.
    + *Mavisha:* Water.
    + *Urim:* Earth.
    + *Apet:* Distance.
    + *Reida:* Time.
    + *Nem:* Ruin.

    = Level 16: Space Travel
    Gain both connected planes' benefits:

    - *Jiese:* Shift 1 square as a minor action.
    - *Avilona:* Fly speed equal to walking speed, clumsy maneuverability.
    - *Av:* Climb speed equal to walking speed, with spider climb.
    - *Mavisha:* Swim speed equal to walking speed.
    - *Urim:* Ignore the first square of each forced movement; you may automatically resist teleportation.
    - *Apet:* Teleport 2 squares as a move action.
    - *Reida:* +2 speed.
    - *Nem:* Ignore difficult terrain, hovering slightly over small obstacles.

    #colbreak()
    #pathPower(
      title: "Heavenly Flare", path: "Applied Astronomist", level: 11,
      traits: "Primal, Implement, Radiant", range: [Area burst 1 within 10],
      target: [Creatures in burst], defense: powers.defense.fortitude,
      rows: (
        [*Special:* Choose one plane you are connected to today.],
        [*Hit:* 1d10 radiant damage and that plane's attack rider (below).],
      ),
    )

    = Planar Attack Riders
    - *Jiese:* Ongoing 10 fire damage (save ends).
    - *Avilona:* Deafened and slowed (save ends both).
    - *Av:* Dazed and insubstantial until the end of your next turn.
    - *Mavisha:* Slide 2 squares; ongoing 5 acid damage (save ends).
    - *Urim:* Cannot teleport (save ends); knocked prone.
    - *Apet:* Teleport the target 6 squares.
    - *Reida:* Stunned until the end of your next turn. While stunned, the target is immune to damage, forced movement, and status effects.
    - *Nem:* Ongoing 10 necrotic damage (save ends).

    #pathPower(
      title: "Straddling Realities", path: "Applied Astronomist", level: 12,
      type: powers.powerType.daily, traits: "Primal", range: [Area burst 3 within 10],
      rows: ([*Effect:* Choose a plane you are connected to today. Create a zone in the area until the encounter ends, using its planar zone effect on the following page.],),
    )

    #pathPower(
      title: "Cataclysmic Conjunction", path: "Applied Astronomist", level: 20,
      type: powers.powerType.daily, traits: "Primal, Implement, Radiant",
      range: [Area burst 3 within 10], target: [Creatures in burst], defense: powers.defense.fortitude,
      rows: (
        [*Special:* Choose a plane you are connected to today.],
        [*Hit:* 3d10 radiant damage and the chosen plane's attack rider.],
        [*Miss:* Half damage.],
        [*Effect:* The area becomes a zone until the encounter ends, with the chosen plane's Straddling Realities effect.],
      ),
    )
  ]

  #pagebreak()
  #theme.subPageTitle(title: "Applied Astronomist: Planar Zones", outlined: false)
  #columns(2)[
    These effects apply to *Straddling Realities* and *Cataclysmic Conjunction*.

    = Jiese, Plane of Fire
    As a minor action, create an object of solid firegem in an unoccupied space in the zone. It can have any rough shape, up to 3 squares across, is as durable as wood, and vanishes when the zone ends.

    = Avilona, Plane of Air
    Fill the zone with fog (concealment), winds up to 30 miles per hour (–2 penalty to ranged weapon attacks), or calm air (comfortable temperature and breathable air).

    = Av, Plane of Dreams
    Enemies in the zone take a –2 penalty to Will; allies gain a +2 bonus to Will.

    = Mavisha, Plane of Water
    Fill the zone with water to your chosen depth, either calm (*Athletics DC 10* to swim) or choppy (*DC 20*).

    #colbreak()
    = Urim, Plane of Earth
    As a minor action, roughly tunnel through up to three 5-foot cubes of earth or stone in the zone, or extrude an equal amount of stone from a rocky surface.

    = Apet, the Distant Plane
    Attacks originating inside the zone cannot affect targets outside, and vice versa. A creature can step across the boundary and attack; otherwise the distance is effectively infinite.

    = Reida, Plane of Time
    Creatures in the zone can take one extra minor action each turn.

    = Nem, Plane of Ruin
    Creatures starting their turn in the zone take 10 necrotic damage. Unattended objects in it suffer years of decay each round.
  ]

  #pagebreak()
  #theme.subPageTitle(title: "Logos")
  #columns(2)[
    Philosophy reshapes perceptions, making the same starving child seem a burden or an investment. Some philosophers go further: recognizing the instability of belief and perception, they change reality through speech alone. The Drakran von Copenhoff supposedly learned this power from William Miller's heretical writings and nearly seized a nation by declaring that its leaders agreed with him.

    *Prerequisite:* Eschatologist theme, or proficiency in Diplomacy and Society and experience discussing philosophy.

    = Level 11 Features
    *Fiat:* When you spend an action point, instead of gaining an extra action, force a creature that can hear you to take an at-will standard or move action of your choice. It cannot directly damage itself, but you can place it in danger, including provoking opportunity attacks or standing under a precarious boulder.

    *Pathos of the Inanimate:* By speech, manipulate unattended objects within 30 feet: move furniture, crack trees, open or close doors and locks, or fire guns. Move tiny things up to 30 feet as a free action, person-sized objects as a minor action, or objects filling up to a 10-foot square as a move action. Objects given a name cannot be affected; naming gives them a fragment of willpower.

    = Level 16: Ethos of the Unwilling
    Whenever you hit a creature with an attack, it takes a –2 penalty to its next attack roll.

    #colbreak()
    #pathPower(
      title: "Make It So", path: "Logos", level: 11, traits: "Psionic",
      rows: ([*Effect:* Choose a creature that can hear you. Decide whether its next attack roll hits or misses.],),
    )

    #pathPower(
      title: "Inexplicable Narration", path: "Logos", level: 12,
      type: powers.powerType.daily, traits: "Psionic",
      rows: (
        [*Effect:* Choose an area no more than 10 squares across whose details you do not know, and describe it. If a creature enters it within 5 minutes, it permanently matches your description. You may declare mundane objects or minor terrain elements, but cannot cause damage, create creatures, or create objects of noteworthy value.],
        [Simple declarations generally work, such as unlocked doors and an obvious trap-disabling lever, or a hidden weapons chamber behind a wall. The GM may have drastic declarations fail, such as a ship's hold full of lava or a conveniently placed note revealing a villain's plans.],
      ),
    )

    #pathPower(
      title: "Revoke Agency", path: "Logos", level: 20,
      type: powers.powerType.daily, traits: "Psionic, Implement", range: [Ranged 10],
      target: [One creature that can hear you], defense: powers.defense.will,
      rows: (
        [*Hit:* Control the target's actions (save ends). While controlled, it is stunned. Spend your own actions to make it take corresponding actions (standard for standard, and so on). You cannot make it take self-destructive actions.],
        [*Miss:* The target is dominated until the end of your next turn.],
      ),
    )
  ]

  #pagebreak()
  #theme.subPageTitle(title: "Mad Shootist")
  #columns(2)[
    Ordinary guns are passé. Your modular arcano-scientific blaster stores magic, fires elemental beams and explosive projectiles, and provides an ever-growing collection of improbable tools.

    *Prerequisite:* Gunsmith theme, or proficiency in Arcana and training by a gunsmith.

    = Level 11 Features
    *Inventive Gunnery:* Choose a firearm type and invent a blaster of that type. It fires ordinary ammunition or unlimited force blasts. Force blasts behave like ordinary rounds but deal force damage and require no reloading.

    You can have only one active blaster. If someone else fires it, it pulses; unless you regain possession within three rounds it explodes: *close burst 3; implement attack, Main Ability vs. Reflex; hit: 6[W] damage; miss: half damage*. The source does not specify the explosion's target selection; resolve this with the GM.

    If destroyed, spend 1 hour repairing it or upgrading another firearm of any type into a new blaster. You can transfer enchantments between weapons during that hour.

    *Autofire:* When making a ranged attack with your blaster (not a close or area attack), you may fire a 10-round burst, normally using force blasts. Deal damage equal to the higher of your *Dexterity or Intelligence points* to each enemy in an *area burst 1 centered on the target*. Creatures with cover relative to you take no autofire damage.

    *Piercing Shot:* When you spend an action point, your next blaster attack can attack each creature along a straight line from any part of your space through any part of the target's space and up to three spaces beyond. You cannot fire the blaster again until the end of your next turn.

    = Level 16: Rocket Launcher
    Create up to five rockets per day, with a maximum of five at any time. Creating more destabilizes them all into inertness. Rockets act as grenades with *range 20/40*. Loading one into the blaster takes a standard action.

    #colbreak()
    #pathPower(
      title: "Beam Shot", path: "Mad Shootist", level: 11, traits: "Arcane, Weapon",
      range: [Ranged weapon], defense: powers.defense.ac,
      rows: (
        [*Special:* Use your blaster. Choose one beam below; its hit effect applies. The source does not list a target count for this power; resolve this with the GM.],
        [*Freeze Ray:* 1[W] + Main Ability cold damage; restrained and vulnerable 10 to untyped damage (physical impacts that can break ice, rather than energy damage), save ends both.],
        [*Shrink Ray:* 1[W] + Main Ability force damage; shrink three size categories and deal half damage with weapon attacks (save ends both). If smaller than Tiny, reach becomes 0, speed becomes 1, and weapon attacks deal one-quarter damage (save ends all).],
        [*Wave Beam:* 3[W] + Main Ability force damage; ignores cover.],
      ),
    )

    #pathPower(
      title: "Mobility Shot", path: "Mad Shootist", level: 12,
      action: powers.actionType.move, traits: "Arcane", range: [Anchor within 6 squares],
      rows: ([*Effect:* Fire a grapple beam at a solid anchor at least 1 square across. Pull yourself there and hang, or swing from it to travel potentially 12 squares as part of this action. Keep it engaged as long as desired; after release it needs 5 minutes to recharge. You cannot fire the blaster while it is engaged. The GM may allow clever Acrobatics uses. It cannot attach to creatures or pull objects toward you.],),
    )

    #pathPower(
      title: "Hyper Beam", path: "Mad Shootist", level: 20,
      type: powers.powerType.daily, action: powers.actionType.minor,
      traits: "Arcane, Force, Weapon",
      rows: (
        [*Effect:* Until the encounter ends, you can make this attack with your blaster: *ranged weapon; one creature; Main Ability vs. AC*. The source does not state the action required for each attack; resolve this with the GM.],
        [*Hit:* The first attack deals *3[W] + Main Ability force damage*; the second deals *4[W] + Main Ability damage*; the third deals *5[W] + Main Ability damage*. At the end of the turn on which you make the third attack, the blaster explodes as described in Inventive Gunnery.],
      ),
    )
  ]

  #pagebreak()
  #theme.subPageTitle(title: "Monument of War")
  #columns(2)[
    Public admiration turns famous veterans into living embodiments of their wars. You can manifest remembered cannon fire or the sacrifice of a fallen comrade. Such power may be haunted by dead friends or concealed wartime shame; others seek lost glory or another chance at an escaped enemy.

    *Prerequisite:* Yerasol Veteran theme, or veteran of another war and proficiency in Arcana and Society.

    = Level 11 Features
    *Instant Boot Camp:* When you spend an action point, you and every ally who can see or hear you gain proficiency in Athletics and all simple and military weapons until the end of your next turn. Those already proficient in Athletics treat a roll of 1–7 on an Athletics check as an 8. Each affected creature can immediately stand up or drop prone, then move 2 squares.

    *Fearless Mein:* You and allies within 5 squares gain +4 to defenses against Fear attacks and +4 to saving throws against fear effects.

    = Level 16: Do You Want to Live Forever?
    When you have no physical cover or concealment, gain cover against non-melee attacks.

    #pathPower(
      title: "Remembrance of the Human Shield", path: "Monument of War", level: 12,
      type: powers.powerType.daily, action: powers.actionType.immediateInterrupt,
      traits: "Psionic", trigger: [A melee or ranged attack hits you or an ally you can see.],
      rows: ([*Effect:* The attack instead hits a psychic manifestation of a fallen ally. The manifestation is destroyed instantly; the original target is unaffected.],),
    )

    #colbreak()
    #pathPower(
      title: "Shell Shock", path: "Monument of War", level: 11,
      traits: "Psionic, Implement", range: [Area burst 3 within 3],
      target: [Creatures in burst], defense: powers.defense.reflex,
      rows: (
        [*Hit:* 4d10 + Main Ability damage; push 1 square and knock prone.],
        [*Miss:* Half damage.],
        [*Effect:* Dust and smoke grant concealment in the area until the end of your next turn. The origin square is cracked and caved in 3 feet deep by an artillery shell.],
        [*Special:* Does not provoke opportunity attacks. You must include yourself in the area, but can benefit from cover relative to the origin.],
      ),
    )

    #pathPower(
      title: "Cannon Overture", path: "Monument of War", level: 20,
      type: powers.powerType.daily, traits: "Psionic, Implement", range: [Area burst 3 within 10],
      target: [Creatures in burst], defense: powers.defense.reflex,
      rows: (
        [*Hit:* 4d10 + Main Ability damage; push 1 square and knock prone.],
        [*Miss:* Half damage.],
        [*Effect:* Dust and smoke grant concealment in the area until the end of your next turn. The origin square is cracked and caved in 3 feet deep by an artillery shell.],
        [*Sustain Standard:* Repeat the attack, choosing a new origin at least 5 squares from every previous origin.],
      ),
    )
  ]

  #pagebreak()
  #theme.subPageTitle(title: "Notorious Celebrity")
  #columns(2)[
    If devotion strengthens gods and approval strengthens kings, fame can empower an entertainer. You attract a loyal posse, demand attention, and turn spectators' affection into supernatural influence. Such visibility can be awkward for a constable trying to travel incognito.

    *Prerequisite:* Docker theme, or *2 Charisma points* and a wildly popular entertainment career.

    = Level 11 Features
    *Roll with a Posse:* Gain four loyal followers with the statistics on the next page. They act only at your direction. When you spend a move action, each can also spend a move action. Use an opportunity action to have one make an opportunity attack against an enemy you both see. You can spend actions to direct one member to perform a specific task, such as opening a door. Otherwise they wait, reloading their pistols if needed when given no orders.

    When something damages a posse member, you may transfer that damage to yourself. If a source damages several simultaneously, protect all of them while taking the damage only once. If the same source also damages you, you can shield them without extra damage.

    A member reduced below 0 HP automatically stabilizes while you live. As a minor action, spend a healing surge to restore any number of visible posse members to 1 HP. Replace a dead member the next time you are somewhere you have fans.

    *Center of Attention:* When you spend an action point, every enemy aware of you takes –2 to attacks against targets other than you until the end of your next turn.

    = Level 16: Crowd Effect
    While watched by at least eight noncombatants, gain +5 to death saving throws. Whenever you bloody or drop an enemy, gain 5 temporary HP.

    #colbreak()
    #pathPower(
      title: "One-Upmanship", path: "Notorious Celebrity", level: 11,
      action: powers.actionType.immediateInterrupt, traits: "Arcane",
      trigger: [An enemy hits you or an ally with an attack.],
      rows: ([*Effect:* Use an at-will or encounter attack power you know as an immediate interrupt. If the triggering attack was a critical hit, you may instead use a daily power you know. Gain +2 to attack rolls against the triggering enemy with that power.],),
    )

    #pathPower(
      title: "Summon Audience", path: "Notorious Celebrity", level: 12,
      type: powers.powerType.daily, action: powers.actionType.minor, traits: "Arcane",
      range: [Eight unoccupied spaces within 10 squares],
      rows: ([*Effect:* Create eight stationary, damage-immune illusory people until the encounter ends or you dismiss them. You and allies can freely move and attack through their spaces. They are difficult terrain for enemies and provide cover against enemies' ranged attacks. They count as real onlookers for Crowd Effect and Docker's Audience Participation.],),
    )

    #pathPower(
      title: "Shock and Awe", path: "Notorious Celebrity", level: 20,
      type: powers.powerType.daily, traits: "Arcane",
      rows: ([*Effect:* Use a level 1 at-will attack power. Each posse member can then make a basic attack. Enemies hit by any of these attacks take –2 to attack rolls until the end of your next turn.],),
    )
  ]

  #theme.subPageTitle(title: "Your Posse", outlined: false)
  #columns(2)[
    = Posse Member
    *Medium natural humanoid; minion soldier.* No XP award.

    *HP:* 1; missed attacks never damage a minion.\
    *Defenses:* AC 14, Fortitude 12, Reflex 12, Will 12.\
    *Initiative:* +2. *Perception:* +0. *Speed:* 6.\
    *Ability points:* Strength 2, Constitution 1, Dexterity 2, Intelligence 1, Wisdom –1, Charisma 0.\
    *Alignment:* Same as the celebrity. *Languages:* Various.

    == Bolstered by Celebrity
    If a member has seen you within the past 5 minutes, it gains a bonus equal to *your level* to attacks and defenses, and a bonus equal to *half your level* to skill checks, ability checks, and damage rolls. Recalculate when you level up. These are the source's companion bonuses, not player intrinsic bonuses.

    == Bodyguard
    Allies adjacent to a posse member gain +2 to defenses.

    #colbreak()
    == Scrap and Slash
    *At-Will, Basic, Weapon; standard action.*\
    *Attack:* Melee 1, one creature; +5 vs. AC.\
    *Hit:* 4 damage.

    == Bang Bang
    *At-Will; standard action.*\
    *Attack:* Ranged 10/20, one creature; +5 vs. AC.\
    *Hit:* 4 damage, or 8 on a critical hit.\
    *Load:* Standard action.

    Add Bolstered by Celebrity to these base statistics while it applies. Scrap and Slash is explicitly a basic attack; the source does not label Bang Bang as one.
  ]

  #pagebreak()
  #theme.subPageTitle(title: "Polyhistor")
  #columns(2)[
    Ballistics, anatomy, motion, materials, psychology, and sociology all illuminate combat. A polyhistor combines these sciences into the right attack for each situation, pausing to observe enemies or regain composure when needed.

    *Prerequisite:* Martial Scientist theme, or *2 Intelligence points* and proficiency in Medicine, Insight, and Society.

    = Level 11 Features
    *Elementary Stances:* At the start of your turn, as a free action, switch to any of the five elementary stances on the next page. You can have one elementary stance and up to one stance from another source active simultaneously.

    *Combat Focus:* Instead of a path encounter attack power, start each encounter with *three martial dice (d6s)*. Spend them on the options below or your stance options. Taking total defense as a standard action adds *three dice* if an enemy is actively fighting within 10 squares. Your pool's maximum is *ten*; it resets to three at each encounter's start.

    *Two Targets:* Once on your turn when making a basic attack, spend one die to make another basic attack against a different enemy. You may stow and draw weapons between them.

    *Multiple Targets:* When making a melee basic attack on your turn, spend two dice to target every enemy in a close burst 1. For a ranged basic attack, spend two dice to target every enemy in an area burst 1 within range. Combine with Two Targets: two dice for the melee burst, one for an extra ranged basic attack after switching weapons, and two more for that attack to affect a ranged burst.

    *Perfect Aim:* When you spend an action point, until your turn ends you can use *Precision*: after rolling a basic attack, spend any number of martial dice, roll them, and add their sum to the attack roll.

    #colbreak()
    #pathPower(
      title: "Decipher Technique", path: "Polyhistor", level: 12,
      type: powers.powerType.daily, traits: "Martial",
      rows: ([*Effect:* Choose a visible enemy you have hit or that has hit you. Learn its defenses, traits, and powers. The GM should normally show its statblock, except for secret information. Add two martial dice to your pool.],),
    )

    = Level 16: Combat Transcendence
    Your martial dice reset to *five* at the start of an encounter, and your maximum pool becomes *twelve*.

    #pathPower(
      title: "Masterstroke", path: "Polyhistor", level: 20,
      type: powers.powerType.daily, traits: "Martial",
      rows: ([*Effect:* Gain *seven martial dice*, usable before the start of your next turn and exempt from your pool limit. Until then, you can use martial dice for options from any elementary stance. Make a basic attack.],),
    )
  ]

  #pagebreak()
  #theme.subPageTitle(title: "Polyhistor: Elementary Stances", outlined: false)
  #columns(2)[
    = Alert Stance
    *Warding Strike:* When a creature enters your melee weapon's reach, spend one die as an immediate reaction to make a melee basic attack against it. If wielding a ranged weapon, when a creature enters a space within 5 squares without cover or concealment from you, spend one die as an immediate reaction to make a ranged basic attack against it.

    = Brute Stance
    *Damage:* When rolling damage for a basic attack, spend any number of dice, roll them, and add the sum to damage. Roll *d8s instead of d6s* if wielding a two-handed weapon or a weapon in each hand.

    *Forced Movement:* On hitting an enemy with a melee basic attack, spend one die to push, pull, or slide it 2 squares.

    = Close Stance
    *Grab:* On hitting an adjacent enemy with a melee basic attack, spend one die to grab it, even without a free hand. If you have a free hand, the grab costs no die.

    *Major Affliction:* On hitting a grabbed enemy with a melee basic attack, spend two dice to make it *blinded, dazed, immobilized, or weakened* until the end of your next turn.

    *Minor Affliction:* On hitting a grabbed enemy with a melee basic attack, spend one die to make it *deafened, disarmed, prone, or slowed* until the end of your next turn.

    #colbreak()
    = Defensive Stance
    *Guard:* When an enemy hits you or an adjacent ally, as an immediate interrupt spend any number of dice, roll them, and add their sum to your or that ally's defenses against the attack. If wielding a shield, add another +2 to the sum.

    = Evasive Stance
    *Evade:* When an enemy ends its movement close enough to attack you in melee, spend one die as an immediate reaction to move your speed.

    *Skirmish:* Once on your turn when making a basic attack, spend one die to move your speed. With Two Targets, you can move between attacks. Combined with Multiple Targets for a melee attack, replace its close burst with a melee basic attack against each enemy you move adjacent to during this movement.
  ]

  #pagebreak()
  #theme.subPageTitle(title: "Steamsuit Pilot")
  #columns(2)[
    Scaling a fighting contraption into wearable armor takes ingenuity and a willingness to strap yourself into a hot metal machine powered by an arcane boiler. Every pilot's suit has its own shape and quirks, from close-fitting elven plate to a mechanized gorilla. Every machine can break.

    *Prerequisite:* Technologist theme, or training by a technologist and proficiency in Arcana.

    = Level 11: Steam & Steel
    Design a *Medium or Large suit*, no smaller than yourself. Only a creature of your size can pilot it. Entering or exiting takes a move action. A suit is inert without a pilot. Its lock opens with a key as a minor action, or a *DC 30 Thievery check* as a standard action. Lock it as a free action when entering.

    Inside, your armor bonus becomes *+10*, increasing to *+11 at level 16, +12 at 21, and +14 at 26*. Apply the enhancement bonus of your worn armor or clothing under the local intrinsic-bonus rules. The suit is heavy armor, so you add neither Intelligence nor Dexterity to AC. It imposes no armor check penalty and needs no armor proficiency.

    Activate or deactivate the engine as a free action on your turn. While active, its magical link lets you move, sense, and attack as if it were your body. Suit weapons reproduce your carried weapons and their enchantments.

    A deactivated suit leaves you *immobilized, blinded, and helpless*. You can effectively only affect yourself or exit as a move action, except where Steam Blast explicitly gives its own disabled-suit rules.

    *Medium suit:* Speed 7; lifting and carrying capacity equivalent to the source's Strength 60, including a 600-pound light load. This does not alter checks, attacks, or damage.

    *Large suit:* Speed 5; twice the Medium suit's capacity (1,200-pound light load). Take –5 to checks needing mobility or fine control, including most Acrobatics, Athletics, and Thievery checks. Reduce each push, pull, or slide by 1 square.

    *Damage:* Whenever you take damage inside, make a saving throw. After three failed saves the suit is damaged: slowed and –2 to attack, ability, and skill checks. Repair it during a short rest to restore normal operation. A pilot other than the inventor takes –5 to these saves; three failures deactivate the suit instead.

    *Defensive Shield (11):* When you spend an action point, gain *resist 5 all* until the start of your next turn.

    #colbreak()
    #pathPower(
      title: "Power Fist", path: "Steamsuit Pilot", level: 11,
      traits: "Arcane, Implement", range: [Melee 1; melee 2 in a Large suit], defense: powers.defense.reflex,
      rows: (
        [*Hit:* 4d10 + Main Ability damage; push 5 squares and knock prone.],
        [*Effect:* You are weakened (save ends).],
      ),
    )

    #pathPower(
      title: "Redline Rush", path: "Steamsuit Pilot", level: 12,
      action: powers.actionType.move, traits: "Arcane",
      rows: ([*Effect:* Move twice your speed, gaining +5 to Acrobatics and Athletics checks during the movement. You are immobilized (save ends).],),
    )

    = Level 16: Quick-Don
    As a standard action, collapse the suit into a palm-sized, five-pound mechanical object. As a standard action, restore it; it may form around you and activate its engine as part of that action.

    #pathPower(
      title: "Steam Blast", path: "Steamsuit Pilot", level: 20,
      type: powers.powerType.daily, traits: "Arcane, Fire, Force, Implement",
      rows: (
        [*Effect:* Gain aura 1. Every creature starting its turn in the aura, including you, takes 10 fire damage. At the start of your turn, before taking this damage, you may make the following attack as a free action, ending the aura.],
        [*Attack:* Ranged 20; one creature; Main Ability vs. Reflex.],
        [*Hit:* 6d12 + Main Ability fire and force damage; blinded (save ends).],
        [*Miss:* Half damage.],
        [*Effect:* Each creature adjacent to the target takes 10 fire and force damage. Your suit deactivates. For this power's disabled state, you are slowed, grant combat advantage, and take –2 to attack rolls. As a standard action, make a saving throw; success reactivates the suit.],
      ),
    )
  ]

  #pagebreak()
  #theme.subPageTitle(title: "Urban Empath")
  #columns(2)[
    Cities have spirits as surely as the dead. You attune to their lingering thoughts and collective history, drawing sustenance, knowledge, and protection from streets and buildings. Your powers still work in the wilderness, but a crowded metropolis is your strongest ally.

    *Prerequisite:* Spirit Medium theme, or the ability to commune with nature and proficiency in Diplomacy and Insight.

    = Level 11 Features
    *Every Building a Welcoming Home:* When you spend an action point, move through man-made structures as if phasing until the end of your next turn.

    *Urban Bond:* In an urban environment, generally a bounded area of at least 1,000 inhabitants per square mile, you need neither food nor drink and gain +5 to Acrobatics, Athletics, and Perception checks. These benefits generally extend to within 3 miles of the urban area's boundary.

    Three times per day, spend 5 minutes communicating with buildings, roads, or other urban structures. Ask up to three questions about what they have witnessed or experienced, similarly to the _Object Reading_ ritual.

    = Level 16: Every Window an Eye
    In an urban environment, gain *tremorsense 20*. Sense the presence and location of creatures with total cover or concealment when man-made structures hide them. You can target Urban Empath powers through walls this way.

    #colbreak()
    #pathPower(
      title: "The City Comes Alive", path: "Urban Empath", level: 11,
      traits: "Psionic, Implement", range: [Area burst 2 within 20],
      target: [Enemies in burst], defense: powers.defense.reflex,
      rows: (
        [*Special:* Outside an urban setting, area burst 1 within 10 instead.],
        [*Hit:* 2d6 + Main Ability damage. In an urban environment, also either slide the target 3 squares or restrain it (save ends).],
      ),
    )

    #pathPower(
      title: "The City Whispers", path: "Urban Empath", level: 12,
      type: powers.powerType.daily, action: powers.actionType.minor, traits: "Psionic",
      rows: ([*Effect:* In an urban setting, learn the general state of all publicly accessible places within 3 miles, plus disturbances in private places visible or audible from public areas. Choose a creature or small group identifiable by physical means: learn whether it is in the area and where, or when it entered a private area. Gain perfect intuitive knowledge of publicly traversable terrain for navigation. Outside an urban setting this awareness extends 150 feet.],),
    )

    #pathPower(
      title: "The City Marches to War", path: "Urban Empath", level: 20,
      type: powers.powerType.daily, traits: "Psionic", range: [Area burst 5 within 20],
      rows: (
        [*Special:* Outside an urban setting, area burst 2 within 10 instead.],
        [*Effect:* Create a zone until the encounter ends. As a move action, move its origin 6 squares. An enemy starting its turn in it takes 10 damage.],
        [Once per round as a minor action, move up to six 5-foot cubes of terrain in the zone up to 6 squares, extrude them from an existing wall or floor, or withdraw them into one. Moving terrain enters only unoccupied spaces and generally uses the area's prevailing building materials.],
      ),
    )
  ]

  #pagebreak()
  #theme.subPageTitle(title: "Vekeshi Excoriant")
  #columns(2)[
    A few mystics retain a sliver of Srasama's power through devotion or the collective memory of her death. They scar and cauterize their skin with symbols of Maiden, Mother, and Crone. Some lead local cells; others follow independent callings. All recite Vekesh's teachings nightly, renewing their purpose to protect the weak and punish abusers.

    *Prerequisite:* Vekeshi Mystic theme, or induction into the mystics and proficiency in Arcana and Society.

    = Level 11 Features
    *Dreadnought:* Gain +2 to Will and saving throws against charm, fear, or illusion effects.

    *Threefold Presence:* When you spend an action point, you may spend a move action this turn to move from your initial position to three locations as three versions of yourself. At the start of your next turn, choose one location to remain at; the other versions disappear. Until then, take actions and be affected as if at any of these locations. An effect hitting multiple versions affects you only once.

    = Level 16: Live for Vengeance
    When you start a turn dying, you may spend *two healing surges* to regain HP equal to *one surge*, regaining consciousness. This counts as a failed death saving throw. Use at most *twice per encounter*.

    #pathPower(
      title: "Vision of the Fall", path: "Vekeshi Excoriant", level: 11,
      traits: "Divine, Fire, Implement, Radiant", range: [Ranged 10],
      target: [One creature], defense: powers.defense.will,
      rows: ([*Hit:* 2d8 + Main Ability fire and radiant damage. Each ally of the target you can see takes fire and radiant damage equal to your Main Ability points.],),
    )

    #colbreak()
    #pathPower(
      title: "Triune Blessing", path: "Vekeshi Excoriant", level: 12,
      type: powers.powerType.daily, action: powers.actionType.minor, traits: "Divine",
      rows: ([*Effect:* Grant three blessings, each to yourself or a visible ally: make a saving throw with +2; spend a healing surge to heal; gain +2 to attack rolls until the start of your next turn. Divide the blessings or give several to the same recipient.],),
    )

    #pathPower(
      title: "Aspect of Srasama", path: "Vekeshi Excoriant", level: 20,
      type: powers.powerType.daily, traits: "Divine, Fear, Fire, Implement, Radiant, Summoning",
      range: [Summoning range unspecified in source; GM ruling required],
      rows: (
        [*Effect:* Summon a *Large Aspect of Srasama* in unoccupied squares within range. It has *speed 7*. Enemies within 5 squares that are not immune to fear take –2 to attacks that do not include the aspect as a target.],
        [*Standard Action:* Melee 2; make six attacks, divided as you choose among targets within range. It can attack during its movement. *Main Ability vs. Reflex; hit: 1d6 fire and radiant damage.*],
        [*Standard Action:* Ranged 10; one creature; *Main Ability vs. Fortitude; hit: 2d6 + Main Ability fire damage and ongoing 10 fire damage (save ends).*],
        [*Instinctive Effect:* If you have given it no commands by the end of your turn, each ally within 5 squares of it, including you, gains 6 temporary HP.],
        [Use the normal summoning rules for statistics and commands not specified here.],
      ),
    )
  ]
]
