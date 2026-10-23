#import "../helpers/theme.typ" as theme;
#import "../helpers/techniques.typ": techniqueEntry;

#let techniquesPage() = {
  return [
    #theme.bannerPage(
      title: "Techniques",
      imageName: "utilities.jpg",
      width: 40%,
      gradient: gradient.linear(black, black, black.transparentize(50%), black.transparentize(100%)),
      content: [
        Techniques are various manouvers and rituals your character is able to perform which provide various boosts and benefits.

        = Gaining Techniques
        At level 2 and every other even level after, you may gain a technique. This technique has to be of your level or lower.

        = Learning additional Techniques
        To learn additional techniques, you must train for at least 8 hours with a character who has mastered it and is at least 6 levels higher than the minimum level to use the technique; or train for at least 1 week with a character who has mastered it, regardless of their level; or to study a manual or other text that describes the technique for 8 hours. You must also meet the technique’s level requirement.

        When learning either Arcane, Primal or Divine techniques, your class must be of the corresponding power source.

        = Performing a Technique
        Once you’ve mastered a technique, you can use it. Each technique takes time to perform—usually a significant amount, preventing them from being used during combat. Additionally, each technique has costs, typically materials (which are consumed) and sometimes foci (which are reusable), paid at the end of the usage time of the technique. Gold-piece costs represent consumed materials. Pay these costs once each time you perform the technique, including techniques that remain active until dismissed.

        Some techniques require skill checks; you make the check at the end of the usage time, and cannot take 10 on the check.
      ],
    )

    #theme.subPageTitle(title: "Crafting Techniques")

    #columns(2)[
      #techniqueEntry(
        level: 1,
        category: "Crafting",
        title: "Alchemical Creation",
        time: "Special",
        duration: "Instantaneous",
        cost: "The item's value in reagents",
        keywords: "Creation",
        description: "You create an alchemical item of level no higher than yours that you possess the formula for. The time required depends on the specific formula.",
      );

      #techniqueEntry(
        level: 1,
        category: "Crafting",
        title: "Brew Potion",
        time: "1 hour",
        duration: "Until consumed",
        cost: "Price of the potion or elixir created",
        keywords: "Creation",
        description: "You create a potion or an elixir of your level or lower.",
      );

      #techniqueEntry(
        level: 1,
        category: "Crafting",
        title: "Make Whole",
        time: "10 minutes",
        duration: "Instantaneous",
        cost: "20% of the target’s value",
        keywords: "Creation",
        description: "Through surpassing skill, you swiftly and completely repair a single object, restoring it to perfect condition.",
      );

      #techniqueEntry(
        level: 1,
        category: "Crafting",
        title: "Temporary Patch",
        time: "10 minutes",
        duration: "24 hours",
        cost: "25 gp",
        keywords: "Creation",
        description: "You temporarily repair a single nonmagical object that fits within a 10-foot cube. It functions normally for the duration, then completely breaks again the next time someone attempts to use it.",
      );

      #techniqueEntry(
        level: 3,
        category: "Crafting",
        title: "Ward Campsite",
        time: "30 minutes",
        duration: "8 hours",
        cost: "25 gp or more (see text)",
        keywords: "Warding",
        description: [
          You fill an area up to 10 squares by 10 squares with traps and alarms. Choose a trap level from 3 up to your level when you perform this technique; more advanced traps require more expensive materials:

          #table(
            columns: (1fr, 1fr),
            stroke: 0.5pt + theme.tableDivider,
            fill: theme.defaultTableStyle(),
            inset: 4pt,
            [*Trap Level*], [*Cost*],
            [3–5], [25 gp],
            [6–10], [140 gp],
            [11–15], [775 gp],
            [16–20], [4,000 gp],
            [21–25], [23,000 gp],
            [26–30], [50,000 gp],
          )

          Whenever a creature you did not inform of the trap pattern enters the area, it makes an Acrobatics check against the Hard DC for the chosen trap level to evade the traps and alarms. If the creature is more than 2 levels above the trap level, it gains a +5 bonus to this check. On a success, it enters without triggering the alarms. On a failure, you and your allies in the area are instantly awakened and cannot be surprised by that creature.
        ],
      );

      #techniqueEntry(
        level: 5,
        category: "Crafting",
        title: "Prosthetic Genius",
        time: "6 hours",
        duration: "Instantaneous",
        cost: "100 gp (see text)",
        keywords: "Creation, Restoration",
        description: "You create a prosthetic replacement that restores the lost limb, organ, or function. The exact form, materials, and required tools depend on your training: a character trained in Thievery might craft intricate clockwork limbs, one trained in Arcana could produce necromantic simulacra or animated prosthetics, and a character trained in Religion might craft rune-scribed blessed steel replacements. Consult the GM for material requirements and any additional checks.",
      );

      #techniqueEntry(
        level: 6,
        category: "Crafting",
        title: "Superior Supply",
        time: "1 minute",
        duration: "Instantaneous",
        cost: "140 gp, plus the item’s value (in coin)",
        keywords: "Exploration",
        description: "While rifling through a well-stocked pack or container for the usage time, you recover an item you previously purchased (nonmagical adventuring gear) and pull it from the pack. Deduct the item's cost from your wealth when you retrieve it.",
      );

      #techniqueEntry(
        level: 12,
        category: "Crafting",
        title: "Enhanced Durability",
        time: "1 hour",
        duration: "Instantaneous",
        cost: "10% of the target’s value",
        keywords: "Creation",
        description: "You reinforce a Huge or smaller inanimate object, increasing the DC of Strength skill checks to destroy it by +10 and granting it Resist 10 to all damage. Blades enhanced this way do not dull, and inscriptions in stone resist erosion for a century. If you are at least 21st level, ignore the size limit.",
      );

      #techniqueEntry(
        level: 20,
        category: "Crafting",
        title: "Artisan’s Foresight",
        time: "Any amount of time (see text)",
        duration: "Until discharged",
        cost: "Special (see text) + 4,000 gp",
        keywords: "Creation",
        description: "You spend time and resources developing a secret project. As a standard action outside of combat, you may reveal the results: instantly and retroactively craft any object you could construct using any combination of techniques you know and the time and resources invested. Any excess materials beyond what is needed appear in your workshop (or equivalent); any excess time is lost. The final object may be placed on your person or left anywhere out of sight that you’ve visited since using the technique, as desired. Consult the GM for specifics about required materials and limits.",
      );

      #techniqueEntry(
        level: 21,
        category: "Crafting",
        title: "Destined Delivery",
        time: "1 hour",
        duration: "As long as necessary",
        cost: "23,000 gp",
        keywords: "Creation, Divination",
        description: "While crafting an object, you can bind its fate to a specific individual. By some providential means, the object will eventually find its way into that individual’s hands, though you cannot control the exact events that lead to it. Strongly defined heroic or anti‑heroic actions can still disrupt this destiny.",
      );

      #techniqueEntry(
        level: 21,
        category: "Crafting",
        title: "Resistant Preparation",
        time: "1 hour",
        duration: "Instantaneous",
        cost: "10% of the target’s value",
        keywords: "Creation",
        description: "You reinforce a Huge or smaller inanimate object so that it resists magical and supernatural transformations to its form. The protection is highly durable, but a sustained magical effect applied continuously for a week can overcome it.",
      );

      #techniqueEntry(
        level: 30,
        category: "Crafting",
        title: "Permanency",
        time: "Special",
        duration: "Permanent",
        cost: "An additional 200% of the target’s value",
        keywords: "Creation",
        description: "Use this technique as part of creating an object to make it effectively eternal; the technique requires the same time as the object's creation. Objects made permanent do not degrade from normal time or weather and resist mundane wear; only direct destructive force or massive environmental damage can destroy them. Any object created this way is unmistakably recognized as your work.",
      );
    ]

    #pagebreak();

    #theme.subPageTitle(title: "Magic Techniques")

    #columns(2)[
      #align(center)[== Arcane]

      #techniqueEntry(
        level: 1,
        category: "Arcane",
        title: "Arcane Mark",
        time: "1 minute",
        duration: "Permanent",
        cost: "None",
        keywords: "Creation",
        description: "You touch an object and mark it with your personal sigil. The sigil is normally invisible; it can be revealed with an Arcana check to detect magic.",
      );

      #techniqueEntry(
        level: 1,
        category: "Arcane",
        title: "Magic Mouth",
        time: "10 minutes",
        duration: "Until discharged or dismissed",
        cost: "25 gp",
        keywords: "Communication, Exploration",
        description: "You bind a spoken message into a surface you touch and set a trigger condition. When the condition is met, a mouth appears on the surface and speaks the message, discharging the ritual. You may use a small silver-and-ruby mouth (100 gp) as a reusable focus; it must remain within 20 squares of any mouth bound to it. The consumed material cost is still 25 gp.",
      );

      #techniqueEntry(
        level: 1,
        category: "Arcane",
        title: "Silence",
        time: "10 minutes",
        duration: "24 hours",
        cost: "25 gp",
        keywords: "Warding",
        description: "You ward a room or a close burst 4 area against sound. Creatures attempting to listen into the area from outside suffer a –10 penalty to Perception checks to do so.",
      );

      #techniqueEntry(
        level: 1,
        category: "Arcane",
        title: "Floating Disk",
        time: "10 minutes",
        duration: "24 hours",
        cost: "25 gp",
        keywords: "Exploration",
        description: [You create a disk of force 3 feet in diameter and 1 inch thick that floats a foot above the ground and carries what you place on it. It moves at your speed, either by your command as a move action or to remain within 5 squares of you if uncommanded. If you spend two consecutive rounds more than 5 squares from it, the effect ends. Maximum load by Arcana check result:

          - 9 or lower: 250 lb
          - 10 or higher: 500 lb
          - 25 or higher: 1000 lb
          - 40 or higher: 2000 lb
        ],
      );

      #techniqueEntry(
        level: 1,
        category: "Arcane",
        title: "Unseen Servant",
        time: "10 minutes",
        duration: "Until dismissed",
        cost: "25 gp",
        keywords: "Creation, Hospitality",
        description: "You conjure an invisible, Medium unseen servant of force that obeys simple commands, moves at your speed, can lift up to 100 pounds, performs basic repetitive tasks (cleaning, camp chores, moving objects), never tires, and cannot attack or be attacked. It cannot move more than 20 squares from you and does not occupy space.",
      );

      #techniqueEntry(
        level: 2,
        category: "Arcane",
        title: "Animate Rope",
        time: "1 minute",
        duration: "1 minute",
        cost: "25 gp",
        keywords: "Exploration",
        description: "Choose a rope within 20 squares. The rope animates and follows your simple commands (coil, uncoil, knot, etc.). It cannot carry or pull weight besides its own while animated. Command actions: knotting — standard action; move up to 6 squares along a horizontal/vertical surface — move action.",
      );

      #techniqueEntry(
        level: 2,
        category: "Arcane",
        title: "Explosive Runes",
        time: "1 minute",
        duration: "Until discharged",
        cost: "50 gp",
        keywords: "Warding",
        description: "You inscribe runes that trigger a trap when read. You may set a password that allows safe reading. The trap makes an attack in a close burst 2 using your level + 4 vs. Reflex, dealing 4d4 + half your level force damage on a hit and half on a miss. An Arcana or Thievery check with DC = your Arcana check result + 5 can disable the trap.",
      );

      #techniqueEntry(
        level: 2,
        category: "Arcane",
        title: "Pyrotechnics",
        time: "1 minute",
        duration: "10 minutes",
        cost: "25 gp",
        keywords: "Creation",
        description: "You conjure small aerial explosions in colors and shapes you choose; you may change color/shape once per minute. Effects are visible 1 mile by day and 10 miles by night.",
      );

      #techniqueEntry(
        level: 3,
        category: "Arcane",
        title: "Inner Archive",
        time: "1 minute",
        duration: "Until dismissed",
        cost: "25 gp per book or 3 scrolls",
        keywords: "Warding",
        description: "You store written works (books, scrolls, etc.) in an extradimensional space within your mind. The physical texts vanish while stored and reappear upon your death or when you spend 1 minute resummoning them.",
      );

      #techniqueEntry(
        level: 3,
        category: "Arcane",
        title: "Project Reflection",
        time: "10 minutes",
        duration: "Until discharged or dismissed",
        cost: "25 gp",
        keywords: "Deception",
        description: [You create an intangible illusion of yourself that looks, smells, and sounds like you but cannot move more than 20 squares from its origin. Program the illusion with simple actions to trigger under set circumstances. Your Arcana check sets the Insight DC to discern the illusion and determines programmable actions:

          - 19 or lower: minor + move
          - 20+: add a standard
          - 30+: add a second minor + move
          - 40+: add a second standard

          The illusion disappears one round after all programmed actions complete.
        ],
      );

      #techniqueEntry(
        level: 4,
        category: "Arcane",
        title: "Arcane Lock",
        time: "1 minute",
        duration: "Permanent",
        cost: "25 gp",
        keywords: "Warding",
        description: "You magically seal a door, window, gate, or similar barrier. You may permit up to ten specific individuals, accept a verbal password, or allow a visual category of creatures to ignore the seal. Opening without permission uses a DC = your Arcana check + 5.",
      );

      #techniqueEntry(
        level: 4,
        category: "Arcane",
        title: "Dark Light",
        time: "1 minute",
        duration: "1 day",
        cost: "25 gp",
        keywords: "Deception, Exploration",
        description: "You create a floating ball of shadow that accompanies you and produces dim light in a 6-square radius; colors do not appear (shades of gray). Only creatures inside the area can see the ball or its light.",
      );

      #techniqueEntry(
        level: 4,
        category: "Arcane",
        title: "Eavesdropper's Foil",
        time: "10 minutes",
        duration: "4 hours",
        cost: "25 gp",
        keywords: "Warding",
        description: "You ward up to a close burst 3 around yourself against eavesdropping, imposing a –10 penalty to Perception checks to listen in on communications within the area. The ward moves with you.",
      );

      #techniqueEntry(
        level: 5,
        category: "Arcane",
        title: "Hallucinatory Item",
        time: "10 minutes",
        duration: "24 hours",
        cost: "25 gp",
        keywords: "Deception",
        description: [You create an immobile, intangible illusion of one inanimate object that appears real. Your Arcana check result determines the Recognition DC and size limit:

          - 19 or lower: Small
          - 20+: Medium
          - 30+: Large
          - 40+: Huge
        ],
      );

      #techniqueEntry(
        level: 5,
        category: "Arcane",
        title: "Object Reading",
        time: "1 hour",
        duration: "5 minutes",
        cost: "25 gp",
        keywords: "Divination",
        description: [Hold an object and view past images from its history (owner, forger, recent events). Your Check result determines the amount of images shown:

          - 9 or lower: 1 image
          - 10+: 2 images
          - 20+: 3 images
          - 30+: 5 images
        ],
      );

      #techniqueEntry(
        level: 6,
        category: "Arcane",
        title: "Sending",
        time: "10 minutes",
        duration: "Instantaneous",
        cost: "140 gp",
        keywords: "Communication, Exploration",
        description: "You send a message of up to 25 words to a person you know; they receive it mentally and may respond the same way. DC required for the Arcana check depends on distance: within 10 miles — automatic; within 100 miles — DC 10; within 500 miles — DC 20; within 1,000 miles — DC 30; farther or different plane — DC 40.",
      );

      #techniqueEntry(
        level: 8,
        category: "Arcane",
        title: "Shadow Bridge",
        time: "5 minutes",
        duration: "10 minutes",
        cost: "140 gp",
        keywords: "Exploration",
        description: "You form a solid bridge of shadow that must connect to solid surfaces at both ends. Maximum length equals your Arcana check result in squares; maximum width is 1 square per 10 points of your Check result.",
      );

      #techniqueEntry(
        level: 9,
        category: "Arcane",
        title: "Magic Map",
        time: "10 minutes",
        duration: "Special",
        cost: "140 gp, ≥100 gp crystal plumb, ≤50×50 map",
        keywords: "Divination, Finding",
        description: [Holding the plumb-bob above the map, if your chosen target is within the depicted area the plumb-bob points to their location and follows movement. Targets may be a creature you have a personal possession or body part from, the most valuable hoard in the area, a named object type, or a specific object you've seen. The duration is limited by your Arcana check:

          - 19 or lower: 1 round;
          - 20–29: 10 rounds;
          - 30–39: 10 minutes
          - 40+: 1 hour.

            Accuracy limited by map quality.
        ],
      );

      #techniqueEntry(
        level: 10,
        category: "Arcane",
        title: "Chains of Force",
        time: "5 minutes",
        duration: "Until dismissed",
        cost: "140 gp",
        keywords: "Binding",
        description: [You bind a helpless creature within 5 squares in chains of arcane force. The Escape DC equals your Arcana check + 5. A target of your level or lower cannot teleport while chained.],
      );

      #techniqueEntry(
        level: 12,
        category: "Arcane",
        title: "Passwall",
        time: "10 minutes",
        duration: "1 minute",
        cost: "775 gp",
        keywords: "Exploration, Travel",
        description: "You create a passage through solid material one square wide and one square high. Depth of passage = one square per 5 points of your Arcana check result. A creature caught when the passage closes takes 5d10 damage and is ejected out the nearest end.",
      );

      #techniqueEntry(
        level: 12,
        category: "Arcane",
        title: "Seeming",
        time: "10 minutes",
        duration: "Until dismissed (see text)",
        cost: "775 gp",
        keywords: "Deception",
        description: "You create magical disguises for yourself and up to eight allies, disguising you as nonspecific humanoids of the same size category. Your Arcana check sets the Recognition DC by sight (or sound if applicable). Disguises are intangible, so discrepancies are revealed by touch. Any ally moving more than 5 squares from you loses the disguise.",
      );

      #techniqueEntry(
        level: 14,
        category: "Arcane",
        title: "Telepathic Bond",
        time: "10 minutes",
        duration: "Special",
        cost: "775 gp",
        keywords: "Communication, Exploration",
        description: [You and up to eight allies gain telepathic communication regardless of language, distance, or plane. The duration of which depends on the result of the Arcana check:
          - 9 or lower: 10 minutes;
          - 10–19: 30 minutes;
          - 20–29: 1 hour;
          - 30–39: 3 hours;
          - 40+: 8 hours.
        ],
      );

      #techniqueEntry(
        level: 14,
        category: "Arcane",
        title: "View Location",
        time: "1 hour",
        duration: "Special",
        cost: "775 gp and a ≥1,000 gp crystal ball or mirror",
        keywords: "Scrying",
        description: "You view and hear a previously visited location as if standing there with darkvision; you can use Perception normally. Sensor lasts 1 round per 10 points of your Arcana check result. The sensor is nearly invisible; a Perception check DC = 10 + your level reveals the shimmer.",
      );

      #techniqueEntry(
        level: 16,
        category: "Arcane",
        title: "Greater Sending",
        time: "10 minutes",
        duration: "Special",
        cost: "8,000 gp",
        keywords: "Communication, Exploration",
        description: "Functions like Sending but you treat your Arcana check result as 40 for the purpose of distance/resolution.",
      );

      #techniqueEntry(
        level: 16,
        category: "Arcane",
        title: "Stasis Shell",
        time: "1 hour",
        duration: "Until moved more than 5 squares in a round",
        cost: "8,000 gp",
        keywords: "Warding",
        description: "You seal a nonliving object in a thin quintessence shell, halting its passage of time and preventing degradation while the shell holds. The shell ends if the target is moved more than 5 squares in a round.",
      );

      #techniqueEntry(
        level: 20,
        category: "Arcane",
        title: "Trace Scrying",
        time: "30 minutes",
        duration: "Until dismissed or discharged",
        cost: "4,000 gp",
        keywords: "Divination, Scrying, Warding",
        description: "When a scrying sensor perceives you, you become aware and may attempt to destroy or trace it. Destroying the sensor ends the scry unless its creator is higher level than you. Tracing requires a Arcana check with a –10 penalty and lets you observe the sensor's creator for 1 round per 5 points of your Arcana check result.",
      );

      #techniqueEntry(
        level: 25,
        category: "Arcane",
        title: "Soul Gem",
        time: "1 hour",
        duration: "Until dismissed",
        cost: "92,000 gp and a ≥25,000 gp gem",
        keywords: "Binding, Necromancy",
        description: "You trap a creature's soul (died within last 8 hours) into the focus, preventing its return to life without the focus. The focus holds one soul at a time and can be reused after the soul is freed.",
      );

      #techniqueEntry(
        level: 30,
        category: "Arcane",
        title: "Raise Land",
        time: "1 hour",
        duration: "Until dismissed",
        cost: "250,000 gp",
        keywords: "Creation",
        description: [You raise the ground in an area around you into the sky. Arcana check result determines radius and height; depth affected is half the radius. Check limits:

          - 24 or lower: up to 20-square radius
          - 25+: 200-square radius
          - 30+: 1-mile radius
          - 40+: up to 10-mile radius

          If kept active continuously for a year and a day, the effect becomes permanent.
        ],
      );

      #align(center)[== Primal]
      #techniqueEntry(
        level: 1,
        category: "Primal",
        title: "Animal Messenger",
        time: "10 minutes",
        duration: "Special",
        cost: "25 gp",
        keywords: "Communication, Exploration, Handling",
        description: [Choose a non-hostile Tiny animal (such as a sparrow, raven, fox, or carp) and whisper a message of up to 25 words to it, plus a recipient and location. The animal moves toward that location, avoiding danger, and searches for the recipient. Upon finding them, it delivers your message, then returns to its natural behavior. The duration is determined by your Nature check result:
          - 19 or lower: 6 hours
          - 20 or higher: 12 hours
          - 30 or higher: 18 hours
          - 40 or higher: 24 hours
        ],
      );

      #techniqueEntry(
        level: 1,
        category: "Primal",
        title: "Banish Vermin",
        time: "10 minutes",
        duration: "Special",
        cost: "25 gp",
        keywords: "Hospitality, Warding",
        description: [Ward an area up to burst 5 to be anathema to all natural Tiny or smaller vermin, who leave the area and will not re-enter for the duration. The duration is determined by your Nature check result:
          - 9 or lower: 3 days
          - 10 or higher: 1 week
          - 20 or higher: 2 weeks
          - 40 or higher: 1 month
        ],
      );

      #techniqueEntry(
        level: 1,
        category: "Primal",
        title: "Create Campsite",
        time: "10 minutes",
        duration: "8 hours",
        cost: "25 gp",
        keywords: "Exploration",
        description: [You assemble and conceal a 5-square radius campsite, filling gaps in your gear with raw materials from the environment. You and your allies clear the area, set up camp, and prepare food and water. At the end of the duration, you can break down the campsite and conceal evidence of your stay in another 10 minutes. The campsite is well-hidden; the DC to find it is equal to your Nature check result.],
      );

      #techniqueEntry(
        level: 1,
        category: "Primal",
        title: "Purify Water",
        time: "10 minutes",
        duration: "Instantaneous",
        cost: "25 gp",
        keywords: "Exploration",
        description: [Make a Nature check to purify an amount of water depending on the result:
          - 9 or lower: 1 square
          - 10 or higher: 2 squares
          - 20 or higher: 4 squares
          - 35 or higher: 10 squares
        ],
      );

      #techniqueEntry(
        level: 1,
        category: "Primal",
        title: "Traveler’s Camouflage",
        time: "10 minutes",
        duration: "10 hours",
        cost: "25 gp",
        keywords: "Deception",
        description: [You and any present allies gain a bonus to Stealth checks while traveling, and creatures tracking you take the same penalty to their Nature checks. These benefits don’t apply during combat. Your Nature check result determines the bonus/penalty:
          - 19 or lower: ±2
          - 20 or higher: ±3
          - 30 or higher: ±4
        ],
      );

      #techniqueEntry(
        level: 2,
        category: "Primal",
        title: "Water Walk",
        time: "10 minutes",
        duration: "1 hour",
        cost: "25 gp",
        keywords: "Exploration, Storm, Travel",
        description: "You or an ally can move on water as if it were solid ground; rapids and rough water count as difficult terrain. The target can choose to immerse or swim instead of walking on the surface.",
      );

      #techniqueEntry(
        level: 3,
        category: "Primal",
        title: "Affect Normal Fire",
        time: "1 minute",
        duration: "8 hours",
        cost: "25 gp",
        keywords: "Exploration",
        description: [You can manipulate nonmagical flames within 10 squares as a minor action, creating any of the following effects:
          - Change a fire’s light from bright to dim or vice versa.
          - Double the radius of light a fire produces.
          - Prevent a fire that would produce dim light from producing any light at all as it burns.
          - Extinguish 1 square of nonmagical fire.
          The effect ends when you take an extended rest.
        ],
      );

      #techniqueEntry(
        category: "Primal",
        level: 3,
        title: "Summon Winds",
        time: "10 minutes",
        duration: "8 hours",
        cost: "25 gp",
        keywords: "Exploration, Storm",
        description: "You summon a stiff breeze that follows you. If directed into a sailing vessel’s sails, the breeze increases its speed by 2 miles per hour.",
      );

      #techniqueEntry(
        level: 4,
        category: "Primal",
        title: "Travelers’ Feast",
        time: "1 hour",
        duration: "24 hours",
        cost: "25 gp",
        keywords: "Exploration, Hospitality",
        description: "You conjure or locate enough food and water to feed five Medium or Small creatures or two Large creatures for 24 hours.",
      );

      #techniqueEntry(
        level: 6,
        category: "Primal",
        title: "Clear the Path",
        time: "30 minutes",
        duration: "Permanent",
        cost: "140 gp",
        keywords: "Exploration",
        description: "Remove all debris, rubble, and other detritus from an area burst 3 within 10 squares. Has no effect on solid earth or rock, manufactured structures, traps, or magical barriers.",
      );

      #techniqueEntry(
        level: 6,
        category: "Primal",
        title: "Commune with Nature",
        time: "30 minutes",
        duration: "10 minutes",
        cost: "140 gp",
        keywords: "Divination",
        description: [You can ask primal spirits, beasts, or plants yes-or-no questions about the natural surroundings within 1 mile. Make a Nature check; you can ask one question plus one more for every 10 points of the check result. The spirits answer honestly.],
      );

      #techniqueEntry(
        level: 6,
        category: "Primal",
        title: "Earthen Ramparts",
        time: "10 minutes",
        duration: "Instantaneous",
        cost: "140 gp",
        keywords: "Creation, Warfare",
        description: [You channel the earth into defensive mounds, creating a wall 2 within 10 squares, 2 squares high. One side is sloped (difficult terrain), the rest are sheer cliffs (Athletics DC 20 to climb). For every 10 points of your Nature check result, create an additional such wall.],
      );

      #techniqueEntry(
        level: 6,
        category: "Primal",
        title: "Find the Path",
        time: "1 hour",
        duration: "Until you reach your destination",
        cost: "140 gp",
        keywords: "Divination, Exploration, Finding, Travel",
        description: "Name a destination (visited or specific known place). You know the shortest route toward it, and a group you lead travels 10 extra miles per day while heading there.",
      );

      #techniqueEntry(
        level: 8,
        category: "Primal",
        title: "Water Breathing",
        time: "10 minutes",
        duration: "Special",
        cost: "140 gp",
        keywords: "Exploration",
        description: [Up to eight creatures gain the ability to breathe and speak underwater, and their gear is protected from water damage. Does not grant swimming ability. The duration is determined by your Nature check result:
          - 14 or lower: 1 hour
          - 15 or higher: 2 hours
          - 20 or higher: 4 hours
          - 25 or higher: 8 hours
          - 30 or higher: Until dismissed
        ],
      );

      #techniqueEntry(
        level: 9,
        category: "Primal",
        title: "Tranquil Water",
        time: "10 minutes",
        duration: "1 hour",
        cost: "140 gp",
        keywords: "Exploration",
        description: "You still the water around you, reducing the DC to swim within 5 squares of you to 10.",
      );

      #techniqueEntry(
        level: 10,
        category: "Primal",
        title: "Trailblaze",
        time: "10 minutes",
        duration: "8 hours",
        cost: "140 gp",
        keywords: "Exploration",
        description: "The wilderness moves aside to let you pass, clearing a path 4 squares wide up to 10 squares ahead and behind you, then closing in your wake. You ignore reductions to overland speed from natural terrain, and the DC to track your party increases by 5.",
      );

      #techniqueEntry(
        level: 12,
        category: "Primal",
        title: "Create Oasis",
        time: "30 minutes",
        duration: "Instantaneous",
        cost: "3,100 gp",
        keywords: "Creation",
        description: [You alter groundwater flow, creating a permanent spring. In desert terrain, it produces 10 gallons of water per day; in other terrains, 50 gallons per hour. If the terrain allows, a pond or creek may form.],
      );

      #techniqueEntry(
        level: 12,
        category: "Primal",
        title: "Earth Glide",
        time: "30 minutes",
        duration: "10 hours",
        cost: "775 gp",
        keywords: "Exploration, Travel",
        description: "You and all allies within 5 squares gain overland burrow 5, allowing underground travel at 2.5 miles per hour if not taking other actions. You cannot take any action other than burrowing until you return to the surface.",
      );

      #techniqueEntry(
        level: 14,
        category: "Primal",
        title: "Waterborn",
        time: "10 minutes",
        duration: "Special",
        cost: "775 gp",
        keywords: "Exploration",
        description: [As Water Breathing, but also grants a swim speed equal to land speed and immunity to cold and pressure of the deep ocean.],
      );

      #techniqueEntry(
        level: 18,
        category: "Primal",
        title: "Stone Speech",
        time: "10 minutes",
        duration: "10 minutes",
        cost: "4,000 gp",
        keywords: "Communication, Divination",
        description: "You can speak with stones, both natural and worked. They can relate anything they’ve touched or secrets hidden behind or beneath them, with perfect memory for at least a century.",
      );

      #techniqueEntry(
        level: 26,
        category: "Primal",
        title: "Command Island",
        time: "1 hour",
        duration: "24 hours",
        cost: "250,000 gp",
        keywords: "Exploration, Travel",
        description: "You can command an island you are standing on to move in any direction at 1 mile per hour. The island continues for half a mile after you leave, slowing to a stop over an hour. The movement persists for up to 24 hours from initiation.",
      );

      #techniqueEntry(
        level: 30,
        category: "Primal",
        title: "Climate",
        time: "1 hour",
        duration: "10 minutes",
        cost: "250,000 gp",
        keywords: "Exploration, Storm",
        description: [You dramatically alter the climate within a 2-mile radius (e.g., desert to snowstorm, rainforest to badlands, summer to winter, or create a monsoon). You cannot directly control specific weather, but the area shifts to the new climate. If maintained for a year and a day, the change becomes permanent.],
      );

      #align(center)[== Divine]
      #techniqueEntry(
        level: 1,
        category: "Divine",
        title: "Bodily Purity Meditation",
        time: "1 hour",
        duration: "Until dismissed",
        cost: "25 gp",
        keywords: "Arete, Warding",
        description: "You gain a +2 power bonus to checks against poisons, diseases, and curses. If you would lose a healing surge as a result of failing a check against a poison, disease, or curse, you can immediately dismiss this technique to avoid losing a healing surge.",
      );

      #techniqueEntry(
        level: 2,
        category: "Divine",
        title: "Blessed Light",
        time: "1 minute",
        duration: "24 hours",
        cost: "25 gp",
        keywords: "Divination",
        description: [A Medium or smaller object you touch sheds bright light in a 20-square radius. Any invisible undead creature with level less than or equal to your Skill check result – 10 is illuminated; it retains total concealment, but the square it's located in is revealed.],
      );

      #techniqueEntry(
        level: 2,
        category: "Divine",
        title: "Last Words",
        time: "10 minutes",
        duration: "See text",
        cost: "25 gp",
        keywords: "Divination, Necromancy",
        description: [You hear the last words spoken by a creature whose corpse or skull you touch. Your Skill check determines how far before their death you can hear:
          - 19 or lower: 2 rounds
          - 20 or higher: 4 rounds
          - 30 or higher: 6 rounds
          - 40 or higher: 1 minute
        ],
      );

      #techniqueEntry(
        level: 2,
        category: "Divine",
        title: "Spirit Messenger",
        time: "10 minutes",
        duration: "See text",
        cost: "25 gp",
        keywords: "Communication, Exploration",
        description: [You name a creature and summon a tiny spirit to deliver a message of up to 10 words to the target. The spirit travels tirelessly at 7 miles per hour over any terrain. Your Skill check result determines how long the spirit travels before giving up:
          - 19 or lower: 12 hours
          - 20 or higher: 1 day
          - 30 or higher: 1 week
          - 40 or higher: limitless duration
        ],
      );

      #techniqueEntry(
        level: 3,
        category: "Divine",
        title: "Oracle’s Thread",
        time: "1 minute",
        duration: "8 hours",
        cost: "25 gp",
        keywords: "Communication, Exploration",
        description: "Your movement leaves a magical track behind you that can be seen and followed only by you and up to six allies of your choice (who do not necessarily need to participate in the ritual; you can specify people you know well instead).",
      );

      #techniqueEntry(
        level: 3,
        category: "Divine",
        title: "Trace Undead",
        time: "10 minutes",
        duration: "See text",
        cost: "25 gp",
        keywords: "Divination, Finding, Necromancy",
        description: [You touch a destroyed undead creature and follow its magic back to its creator or controller, learning the distance and direction. Your Skill check result determines the range:
          - 19 or lower: 1,000 feet
          - 20 or higher: 5 miles
          - 30 or higher: 100 miles
          - 40 or higher: anywhere on the same plane
        ],
      );

      #techniqueEntry(
        level: 4,
        category: "Divine",
        title: "Hand of Fate",
        time: "10 minutes",
        duration: "10 minutes",
        cost: "25 gp",
        keywords: "Divination",
        description: "Propose up to three possible courses of action; a translucent blue hand appears and indicates the most rewarding course of action or inaction, based on the likely results of the next hour. The hand judges based on reward rather than risk, favoring high-reward options unless risks are comparable.",
      );

      #techniqueEntry(
        level: 5,
        category: "Divine",
        title: "Daylight",
        time: "1 minute",
        duration: "Until dismissed",
        cost: "25 gp",
        keywords: "Exploration",
        description: "You shed bright light in a 30-square radius, and magical darkness effects of a level less than yours within that radius create no darkness.",
      );

      #techniqueEntry(
        level: 5,
        category: "Divine",
        title: "Spirit Grounding",
        time: "1 minute",
        duration: "10 minutes",
        cost: "25 gp",
        keywords: "Binding, Necromancy",
        description: "You force an immaterial haunt or similar spirit into physical form, allowing it to communicate, attack, and be attacked directly (though it may still be incorporeal and take reduced damage). Must be used within the area the target haunts and may require other protective measures.",
      );

      #techniqueEntry(
        level: 6,
        category: "Divine",
        title: "Deathly Shroud",
        time: "10 minutes",
        duration: "Special",
        cost: "140 gp",
        keywords: "Deception",
        description: [All creatures, except for undead with Intelligence 0 or higher, perceive you as undead. Powers and wards that affect undead also affect you. The duration is determined by your check result:
          - 14 or less: 1 hour
          - 15 or higher: 2 hours
          - 20 or higher: 4 hours
          - 25 or higher: 8 hours
          - 30 or higher: 24 hours
        ],
      );

      #techniqueEntry(
        level: 6,
        category: "Divine",
        title: "Speak with Dead",
        time: "10 minutes",
        duration: "10 minutes",
        cost: "140 gp",
        keywords: "Divination, Necromancy",
        description: [Ask the corpse of an intelligent creature with an intact face questions, which it will answer honestly. The corpse knows what the creature knew in life and anything that’s occurred within its sight since its death. You can ask one question per 10 points of your Religion check result. Exceptional creatures may require a skill challenge to get answers.],
      );

      #techniqueEntry(
        level: 9,
        category: "Divine",
        title: "Dismiss",
        time: "10 minutes",
        duration: "Instantaneous",
        cost: "140 gp",
        keywords: "Binding",
        description: [You return a willing or helpless extraplanar creature to its home plane. It appears in whatever location on that plane it most considers home, or a random safe location. If you are at least 21st level, you can make a Religion check and target up to a number of creatures equal to your check result.],
      );

      #techniqueEntry(
        level: 11,
        category: "Divine",
        title: "Disciple’s Blessing",
        time: "1 hour",
        duration: "24 hours",
        cost: "775 gp",
        keywords: "Training",
        description: "You grant another creature the ability to use a technique you know, as long as that technique is no more than two levels higher than their level, even if they lack training in the relevant skill.",
      );

      #techniqueEntry(
        level: 12,
        category: "Divine",
        title: "Skeleton Crew",
        time: "1 hour",
        duration: "Until dismissed",
        cost: "1,550 gp",
        keywords: "Exploration, Necromancy",
        description: [You can transmute a number of corpses equal to your Arcana check result into skeletal sailors. They cannot fight, are minions, have defenses equal to your own, and make checks to operate a ship using your. They will obey your commands to operate a ship to the best of their ability but will take no other actions.],
      );

      #techniqueEntry(
        level: 20,
        category: "Divine",
        title: "Succor",
        time: "8 hours",
        duration: "Until discharged",
        cost: "16,000 gp and a focus (holy text) worth 5,000 gp",
        keywords: "Travel",
        description: [You must use this technique inside a shrine, temple, or holy site of your deity. The technique links the focus to the place in which it is used. Any creature holding the focus can activate it as a standard action. At the end of their next turn, they and up to eight willing creatures they can see teleport to the linked holy site, at any distance including across planes, and the technique is discharged. If an effect prevents the teleportation, the technique is not discharged.],
      );

      #colbreak();
      #align(center)[== Necromancy]
      #techniqueEntry(
        level: 7,
        category: "Necromancy",
        title: "Spirit Idol",
        time: "1 hour",
        duration: "Permanent",
        cost: "140 gp, and a focus worth 150 gp (small statue of the target)",
        keywords: "Divination, Restoration",
        description: [If the adjacent deceased target is willing, bind their soul to the focus, preventing its passage to the afterlife and preserving their corpse as if affected by the Gentle Repose technique. Once per day, you can ask the bound soul a single question, as if using the Speak with Dead technique.

          Additionally, Raise Dead and similar techniques count only the time before this technique was used when determining whether the corpse can be returned to life. If the focus is destroyed, the soul is released to the afterlife and this technique ends.
        ],
      );

      #techniqueEntry(
        level: 8,
        category: "Necromancy",
        title: "Raise Dead",
        time: "8 hours",
        duration: "Instantaneous",
        cost: "500 gp for a heroic-tier target, 5,000 gp for a paragon-tier target, or 50,000 gp for an epic-tier target",
        keywords: "Restoration",
        description: [You must have part of the corpse of a willing creature that died no more than 30 days ago, wasn’t petrified, and didn’t die of old age. The target is returned to life, gaining the benefits of an extended rest and ending any temporary conditions suffered at the time of death.

          However, the target takes a -1 death penalty to all attack rolls, saving throws, skill checks, and ability checks until they reach three milestones. Effects that trap the soul or direct divine intervention can prevent this technique from functioning correctly.
        ],
      );
    ]

    #pagebreak();
    #theme.subPageTitle(title: "Medical Techniques")
    #columns(2)[
      #techniqueEntry(
        level: 2,
        category: "Medical",
        title: "Share Vitality",
        time: "5 minutes",
        duration: "Instantaneous",
        cost: "Any number of healing surges",
        keywords: "Restoration",
        description: [
          One participant in the ritual gains all but one of the healing surges spent, up to the limit of their usual maximum.
        ],
      )

      #techniqueEntry(
        level: 4,
        category: "Medical",
        title: "Delay Affliction",
        time: "1 hour",
        duration: "Instantaneous",
        cost: "75 gp (in salves and medicines)",
        keywords: "Restoration",
        description: [
          Delay a charm, confusion, curse, domination, fear, insanity, poison, polymorph, or petrification effect from taking effect on a single creature, including all its side effects. Make a Medicine check to cure or heal with a penalty equal to the level of the effect or the creature that caused it, and use the result to determine the duration of the delay:
          - 1–9: one day
          - 10–19: three days
          - 20–29: a week
          - 30 or higher: two weeks
        ],
      )

      #techniqueEntry(
        level: 6,
        category: "Medical",
        title: "Cure Disease",
        time: "10 minutes",
        duration: "Instantaneous",
        cost: "150 gp (in salves and medicines)",
        keywords: "Restoration",
        description: [
          Entirely remove a disease from a single creature, including all its side effects and symptoms. This technique draws heavily on the target’s own vitality and may seriously harm them; make a Skill check, with a penalty equal to the level of the disease. The result of this Skill check determines how much damage the target takes:
          - 0 or lower: The target does not survive the procedure.
          - 1–9: The target takes damage equal to their maximum hit points.
          - 10–19: The target takes damage equal to their bloodied value.
          - 20–29: The target takes damage equal to their healing surge value.
          - 30 or higher: The target takes no damage.
          You learn the level of the target disease when you begin the technique and can choose not to expend any components or continue the technique when you do.
        ],
      )

      #techniqueEntry(
        level: 8,
        category: "Medical",
        title: "Remove Affliction",
        time: "1 hour",
        duration: "Instantaneous",
        cost: "250 gp (in salves and medicines)",
        keywords: "Restoration",
        description: [
          Completely remove a charm, confusion, curse, domination, fear, insanity, poison, polymorph, or petrification effect from a single creature, including all its side effects. This technique draws heavily on the target’s own vitality and may seriously harm them.
          Make a Medicine check, with a penalty equal to the level of the effect or the creature that caused it. The result of the Medicine check determines how much damage the target takes:
          - 0 or lower: The target did not survive the procedure.
          - 1–9: The target takes damage equal to their maximum hit points.
          - 10–19: The target takes damage equal to their bloodied value.
          - 20–29: The target takes damage equal to their healing surge value.
          - 30 or higher: The target takes no damage.
          You learn the level of the target’s affliction when you begin the technique and can choose not to expend any components or continue the technique if desired.
          You can use this technique on an unwilling subject, but you will need to restrain or incapacitate them for the hour necessary to perform the procedure.
        ],
      )

      #techniqueEntry(
        level: 18,
        category: "Medical",
        title: "Mind Surgery",
        time: "1 hour",
        duration: "Permanent",
        cost: "7,000 gp (in salves and medicines)",
        keywords: "Binding, Restoration",
        description: [
          Erase a single memory from either a willing creature or a helpless creature whose Will defense is less than or equal to your Medicine check result. This technique draws heavily on the target’s own vitality and may seriously harm them.
          Make a Medicine check and the result determines how much damage the target takes:
          - 14 or lower: The target did not survive the procedure.
          - 15–24: The target takes damage equal to their maximum hit points.
          - 25–34: The target takes damage equal to their bloodied value.
          - 35–44: The target takes damage equal to their healing surge value.
          - 45 or higher: The target takes no damage.
        ],
      )

      #techniqueEntry(
        level: 21,
        category: "Medical",
        title: "Instant Treatment",
        time: "2 full rounds",
        duration: "Instantaneous",
        cost: "23,000 gp",
        keywords: "Restoration",
        description: [
          This technique functions as Cure Disease or Remove Affliction, at the user’s choice, except as described above.
        ],
      )
    ]

  ]
}
