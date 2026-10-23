#import "../helpers/theme.typ" as theme;

#let rulesPage() = {
  return [
    #theme.pageTitle(title: "Quick Rules");
    #columns(2)[
      = Actions
      #grid(
        columns: (1fr, 1fr),
        gutter: 1em,
        [
          #table(
            columns: 0.5fr,
            stroke: 0.5pt + theme.tableDivider,
            align: left,
            fill: theme.defaultTableStyle(),
            inset: 4pt,
            [*Standard Action*],
            [Administer a potion],
            [Aid another],
            [Aid attack],
            [Aid defense],
            [Basic attack],
            [Bull rush],
            [Charge],
            [Coup de grace],
            [Equip or stow shields],
            [Grab],
            [Ready an action],
            [Second wind],
            [Total defense],
          );
        ],
        [
          #table(
            columns: 0.5fr,

            stroke: 0.5pt + theme.tableDivider,
            align: left,
            fill: (col, row) => if row == 0 or row == 8 {
              theme.tableHeader
            } else if calc.rem(row, 2) == 0 {
              theme.table1
            } else {
              theme.table2
            },
            inset: 4pt,
            [*Movement Action*],
            [Crawl],
            [Escape],
            [Run],
            [Stand up],
            [Shift],
            [Squeeze],
            [Walk],
            [*Minor Action*],
            [Draw or sheathe weapons],
            [Drink a potion],
            [Drop prone],
            [Retrieve an item],
            [Interact],
          );

          #table(
            columns: 0.5fr,
            stroke: 0.5pt + theme.tableDivider,
            align: left,
            fill: theme.defaultTableStyle(),
            inset: 4pt,
          );
        ],
      )

      == Aiding
      All three are *standard actions*. Each creature can aid a given roll only once; up to *four* creatures can help (the GM may limit aid another further). Benefits expire at the end of the helper's next turn.

      - *Aid another*: Choose an adjacent ally. Make the same skill or ability check against *DC 10 + half your level*. Their next check with that skill or ability gets *+2 on success* or *-1 on failure*.
      - *Aid attack*: Choose an adjacent enemy and an ally. The ally gets *+2 to their next attack roll* against that enemy. No roll required.
      - *Aid defense*: Choose an adjacent enemy and an ally. The ally gets *+2 to all defenses* against that enemy's next attack against them. No roll required.

      = Movement
      == Diagonal movement
      Moving diagonally works the same as other movement, except you can’t cross the corner of a wall or another obstacle that fills the corner between the square you’re in and the square you want to move to. You can move diagonally past most creatures, since they don’t completely fill their squares.
      == Moving through occupied squares
      - *Ally*: You can move through a square occupied by an ally.
      - *Enemy*: You normally can’t move through an enemy’s space unless that enemy is helpless or two size categories larger or smaller than you. Moving into a nonhelpless enemy’s space provokes an opportunity attack from that enemy, because you left a square adjacent to the enemy. (Some powers let you move through an enemy’s square without provoking an opportunity attack.)
      - *Ending* *Movement*: You can end your movement in an ally’s square only if the ally is prone. You can end your movement in an enemy’s square only if the enemy is helpless. However, Tiny creatures can end their movement in a larger creature’s square. If you don’t have enough movement remaining to reach a square you are allowed to be in, your move ends in the last square you could occupy.
      - *Standing* *Up*: If you’re prone and in the same square as another creature, you shift 1 as part of the action.

      #colbreak();

      == Forced Movement
      - *Pull*: Pulling a target means that each square of the forced movement must bring the target closer to the creature or effect that is pulling it.
      - *Push*: Pushing a target means that each square of the forced movement must move the target farther away from the creature or effect that is pushing it.
      - *Slide*: Sliding a target means you can move it in any direction. Each square of the forced movement can bring the target closer to you, move it farther away, or leave it at the same distance.

      If a target is forced over a precipice or into hindering terrain, such as lava or a pit, the target can immediately make a saving throw to avoid going over the edge or entering that terrain. If the creature saves, it falls prone in the last square it occupied before it would have fallen or entered the terrain. Otherwise, it falls over the edge or enters the terrain. Once the saving throw is resolved, the forced movement ends.

      = Falling
      - *Falling Damage*: You take 1d10 damage for each 10 feet you fall. Fast Alternative: If you fall more than 50 feet, take 25 damage per 50 feet, plus 1d10 per 10 extra feet.
      - *Prone*: You fall prone when you land, unless you take no damage from the fall.
      - *Jumping Down*: If you are trained in Acrobatics, you can make a check to reduce the amount of damage you take from a fall. See page 181.

      = Line of Effect
      A clear line from one point to another point in an encounter that doesn't pass through or touch blocking terrain. Unless noted otherwise, there must be line of effect between the origin square of an effect and its intended target for that target to be affected.

      = Cover
      When you make a ranged attack against an enemy and other enemies are in the way, your target has cover. Your allies never grant cover to your enemies, and neither allies nor enemies give cover against melee, close, or area attacks

      To determine if a target has cover, choose a corner of a square you occupy (or a corner of your attack's origin square) and trace imaginary lines from that corner to every corner of any one square the target occupies. If one or two of those lines are blocked by an obstacle or an enemy, the target has cover. (A line isn't blocked if it runs along the edge of an obstacle's or an enemy's square.) If three or four of those lines are blocked but you have line of effect, the target has superior cover.

      = Conditions

      == Blinded
      - The creature can't see, which means its targets have total concealment against it.
      - The creature takes a -10 penalty to Perception checks.
      - The creature grants combat advantage.
      - The creature can't flank.
      - The creature can't have combat advantage against anyone.

      == Dazed
      - The creature doesn't get its normal complement of actions on its turn; it can take either a standard, a move, or a minor action. The creature can still take free actions.
      - The creature can't take immediate actions or opportunity actions.
      - The creature grants combat advantage.
      - The creature can't flank.

      == Deafened
      - The creature can't hear.
      - The creature takes a -10 penalty to Perception checks.

      == Dominated
      - The creature can't take actions voluntarily. Instead, the dominator chooses a single action for the creature to take on the creature's turn: a standard, a move, a minor, or a free action. The only powers and other game features that the dominator can make the creature use are ones that can be used at will, such as at-will powers. For example, anything that is limited to being used only once per encounter or once per day does not qualify.
      - The creature grants combat advantage.
      - The creature can't flank.

      In spite of this condition, the creature's allies remain its allies, and its enemies remain its enemies. If the dominator tries to force the creature to throw itself into a pit or to move into some other form of hindering terrain, the creature gets a saving throw to resist entering the terrain.

      == Grabbed
      - The creature is immobilized.
      - Maintaining this condition on the creature occupies whatever appendage, object, or effect the grabber used to initiate the grab.
      - This condition ends immediately on the creature if the grabber is subjected to an effect that prevents it from taking actions, or if the creature ends up outside the range of the grabbing power or effect.

      A grabbed creature can take the escape action to try to get away. Other common tactics for escaping a grab are to teleport away or to be pulled, pushed, or slid out of the grabber's reach. Using forced movement on the grabber can also end a grab, as long as the movement results in the grabbed creature being out of the grabbing effect's range.

      === Moving a grabbed target
      While a creature is grabbed, the grabber can try to move it.

      - Action: Standard action.
      - Strength Check: The creature makes a Strength check opposed by the Fortitude of a target it is grabbing. The check automatically succeeds if the target is a helpless ally of the creature.
      - Success: The creature can move up to half its speed and pull the target with it. The creature's movement doesn't provoke an opportunity attack from the grabbed target, but the movement otherwise provokes opportunity attacks as normal.

      == Helpless
      While a creature is helpless, it grants combat advantage and can be the target of a *coup de grace*.
      Usually, this is because the creature is unconscious, but it might also be that a creature is so firmly bound that it is effectively helpless.

      === Coup de Grace
      - Action: Standard action.
      - Attack Helpless Target: The creature uses one of its attack powers against an adjacent target that is helpless. If the attack hits, it automatically scores a critical hit against the target.
      - Slaying the Target Outright: If the critical hit deals damage greater than or equal to the target's bloodied value, the target dies.

      == Immobilized
      - The creature can't move, unless it teleports or is pulled, pushed, or slid.

      An immobilized creature can't reposition itself on the battle grid, but it's not paralyzed. It can still stand up when it's prone, pull an item from a backpack, or attack normally. It might have taken a serious, but temporary, injury to the legs, or it could be stuck to the ground by a huge cobweb.

      == Marked
      - The creature takes a -2 penalty to attack rolls for any attack that doesn't include the marking creature as a target.
      - A creature can be subjected to only one mark at a time, and a new mark supersedes an old one.
      - A mark ends immediately when its creator dies or falls unconscious.

      == Petrified
      - The creature is unconscious.
      - The creature has resist 20 to all damage.
      - The creature doesn't age.

      Usually a creature is subjected to this condition when it is turned to stone, such as by a medusa. Often the only way to end this condition is by using a power or a magical ritual.

      Normally, a creature falls prone when it becomes unconscious. The DM might decide that a petrified creature instead remains upright, posed like a statue.

      == Prone
      - The creature is lying down. However, if the creature is climbing or flying, it falls.
      - The only way the creature can move is by crawling, teleporting, or being pulled, pushed, or slid.
      - The creature takes a -2 penalty to attack rolls.
      - The creature grants combat advantage to attackers making melee attacks against it, but it gains a +2 bonus to all defenses against ranged attacks from attackers that aren't adjacent to it.

      A creature can end this condition on itself by standing up. A creature can drop prone as a minor action.

      This condition can affect limbless creatures, such as fish and snakes, as well as amorphous creatures, such as oozes. When such a creature falls prone, imagine it is writhing or unsteady, rather than literally lying down. The game effect on that creature is the same as for other creatures.

      == Removed from Play
      - The creature can't take actions.
      - The creature has neither line of sight nor line of effect to anything, and nothing has line of sight or line of effect to it.

      An effect that removes a creature from play specifies where the creature reappears when it returns to play. Typically the creature reappears in the space it left, or in the nearest unoccupied space if that space is now occupied.

      == Restrained
      - The creature can't move, unless it teleports. It can't even be pulled, pushed, or slid.
      - The creature takes a -2 penalty to attack rolls.
      - The creature grants combat advantage.

        This condition usually results from being held in place by something: vines, tentacles, manacles attached to a wall, strands of webbing, or a monster's gaping jaws. Whatever is holding the creature in place interferes with its ability to move around freely.

      #colbreak();

      == Slowed
      - The creature's speed becomes 2 if it was higher than that. This speed applies to all of the creature's movement modes (walking, flying, swimming, and so on), but it does not apply to forced movement against it, teleportation, or any other movement that doesn't use the creature's speed. If a creature is subjected to this condition while it is moving using any of its speeds, it must stop if it has already moved at least 2 squares.

      - The creature cannot benefit from bonuses to speed, although it can use powers and take actions, such as the run action, that allow it to move farther than its speed.

      == Stunned
      - The creature can't take actions.
      - The creature grants combat advantage.
      - The creature can't flank.
      - The creature falls if it is flying, unless it can hover.

      == Surprised
      - The creature can't take actions.
      - The creature grants combat advantage.
      - The creature can't flank.

        Normally a creature is subjected to this condition only during a surprise round, at the end of which the condition ends.

      === Surprise Rounds
      Some combat encounters begin with a surprise round, which occurs if any creatures are caught completely off guard at the start of battle. If even one creature is surprised, a surprise round occurs, and all creatures that aren't surprised act in initiative order during that round. Surprised creatures can't act at all during the surprise round.

      Two special rules apply to the surprise round.

      Limited Action: If a creature is not surprised, it can take only one of the following actions on its turn during the surprise round: a standard action, a move action, or a minor action. The creature can also take free actions, but it cannot spend an action point. During the surprise round (but not on its turn), the creature can take an immediate action, as well as opportunity actions. See “Action Types” for definitions of these terms.

      After every creature that is not surprised has acted, the surprise round ends, and creatures can act normally in subsequent rounds.

      == Unconscious
      - The creature is helpless.
      - The creature can't take actions.
      - The creature takes a -5 penalty to all defenses.
      - The creature is unaware of its surroundings.
      - The creature falls prone, if possible.
      - The creature can't flank.

      This condition applies when a creature is knocked out, cast into a magical slumber, or otherwise incapacitated totally.
      A creature that has fallen asleep naturally—as opposed to being knocked unconscious by a power or other effect—is unconscious but not totally deprived of awareness; it can use its passive Perception to hear things, but with a -5 penalty.

      == Weakened
      - The creature's attacks deal half damage. Two kinds of damage that it deals are not affected, however: ongoing damage and damage that isn't generated by an attack roll.
    ];
  ]
}
