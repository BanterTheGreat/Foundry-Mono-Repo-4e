#import "../helpers/theme.typ" as theme;

#let negotiationTable(columns: (), rows: ()) = {
  table(
    columns: columns,
    stroke: 0.5pt + theme.tableDivider,
    align: left,
    fill: theme.defaultTableStyle(),
    inset: 5pt,
    ..rows,
  )
}

#let negotiationPage() = {
  return [
    #theme.pageTitle(title: "Negotiation");

    Negotiation is an encounter in which the party tries to secure a deal before an NPC loses patience. After each argument, the NPC offers terms. The party can accept those terms or risk another argument for a better offer.

    Use these rules for consequential requests where the NPC has reasons both to help and to hesitate. Resolve smaller requests with a single skill check. The request must be something the NPC could seriously consider granting: negotiation cannot force cooperation or an arbitrary change in personality. Direct threats of violence generally end negotiation and move the scene to another kind of encounter.

    #columns(2)[
      = The NPC

      *Interest* measures willingness to make a favorable deal, from 0 to 5. It normally starts between 1 and 4.

      *Patience* measures willingness to entertain more arguments, from 0 to 5. It must start above 0. Interest and Patience cannot fall below 0 or rise above 5.

      Choose starting values from the table, adjusting them for the relationship, the request, and the circumstances.

      #negotiationTable(
        columns: (1fr, auto, auto),
        rows: (
          [*Attitude*], [*Interest*], [*Patience*],
          [Hostile], [1], [2],
          [Suspicious], [2], [2],
          [Neutral], [2], [3],
          [Open], [3], [3],
          [Friendly], [3], [4],
          [Trusting], [3], [5],
        ),
      )

      == Motivations and pitfalls

      Give the NPC two or three *motivations*: values or interests that make an argument compelling. Give them one or two *pitfalls*: topics or approaches that provoke a negative reaction. Write these as specific concerns rather than just category names.

      A magistrate might value _Protection: keep residents safe_ and _Legacy: be remembered as a fair leader_, with the pitfall _Power: suggestions that she should surrender her authority_.

      Useful categories include benevolence, discovery, freedom, greed, higher authority, justice, legacy, peace, power, protection, revelry, and vengeance. Any category can be a motivation for one NPC and a pitfall for another.

      The players do not automatically know these concerns. Research, conversation, and the NPC's reactions can reveal them. Avoid hidden pitfalls that the party has no reasonable opportunity to anticipate.

      #colbreak();

      = Making a deal

      + *State the request.* Explain what the party wants and anything offered in exchange.
      + *Make an argument.* One hero explains why the NPC should agree. The players can discuss their approach beforehand.
      + *Classify the argument.* The GM decides whether it invokes a pitfall, an unused motivation, a repeated motivation, or neither a motivation nor a pitfall.
      + *Resolve it.* Apply an automatic outcome or make a check, then update Interest and Patience.
      + *Hear the offer.* The NPC responds with terms based on current Interest. If negotiation can continue, the party chooses to accept, leave, or make another argument.

      An argument can offer payment, a service, or a favor, but it can also explain how cooperation serves the NPC's values. Describe the reasoning; a polished speech or acting performance is not required.

      = Negotiation checks

      Roll *1d20 + points in the GM-selected ability + applicable bonuses*. Relevant proficiency adds *+5*, as usual. Each argument has one speaker and one check; other heroes can provide facts or help shape the argument.

      Arguments use *Normal* difficulty at the party's level. The GM can select a level one or two higher or lower for the circumstances, using that level's printed DCs. Motivations change the outcome of a check rather than lowering its difficulty.

      #negotiationTable(
        columns: (1fr, 1fr),
        rows: (
          [*Approach*], [*Typical ability / skill*],
          [Bargain or reassure], [Charisma / Diplomacy],
          [Make a deceptive claim], [Charisma / Bluff],
          [Apply credible pressure], [Charisma / Intimidate],
          [Present a legal or political case], [Intelligence / Society],
          [Demonstrate technical feasibility], [Intelligence / Crafting],
          [Appeal to religious obligations], [Wisdom / Religion],
        ),
      )

      Other skills can apply when justified by the argument. Expertise must support a reason to agree: knowing how to build a bridge does not, by itself, persuade someone to fund it.
    ]

    #pagebreak();
    #theme.subPageTitle(title: "Arguments & Discovery");

    = Argument outcomes

    Use the chosen level's Skill Checks DC table. A total at least the Hard DC is a *perfect success*; otherwise, a total at least the Normal DC is a *success with a minor hurdle*. A total at or below the Easy DC is a *catastrophic failure*. Other totals are a *failure*. Natural 20 and natural 1 override these thresholds.

    #negotiationTable(
      columns: (1fr, 1.5fr, 1.5fr),
      rows: (
        [*Check result*], [*Unused motivation, no pitfall*], [*Neither motivation nor pitfall*],
        [Catastrophic failure], [Interest -1; Patience -1], [Interest -1; Patience -1],
        [Failure], [Patience -1], [Interest -1; Patience -1],
        [Success with a minor hurdle], [Interest +1; Patience -1], [Patience -1],
        [Perfect success], [Interest +1; Patience unchanged], [Interest +1; Patience -1],
      ),
    )

    The listed Patience loss is the minor hurdle on a successful motivating argument; do not impose another mandatory cost. A catastrophic failure also causes a fictional complication, such as exposing a sensitive fact or embarrassing an ally. For an ordinary argument, this complication distinguishes it from a failure despite the same numerical losses.

    #columns(2)[
      == Natural rolls

      *Natural 20:* Resolve a perfect success, with no Patience loss, and grant an additional useful benefit. The NPC might reveal a motivation, remove a practical complication, or share useful information. Interest still rises by only 1.

      *Natural 1:* Resolve a catastrophic failure, including its fictional complication.

      These natural-roll rules apply to rolled arguments. Automatic outcomes below do not involve a roll.

      == Automatic outcomes

      *Pitfall:* Lose 1 Interest and 1 Patience without a check. A pitfall takes precedence even when the same argument invokes a motivation.

      *Repeated motivation:* Interest is unchanged; lose 1 Patience without a check. A motivation is used once it is invoked in an argument without a pitfall or a detected lie, even if the check fails to increase Interest. Different wording or a different speaker does not refresh it.

      *Repeated ordinary argument:* Resolve a failure without a check: lose 1 Interest and 1 Patience. Merely repeating the same point does not create a new argument.

      *Multiple motivations:* The speaker chooses one motivation to invoke. The others remain unused, unless the argument also invokes a pitfall.

      *Decisive evidence or concession:* The GM may award an automatic perfect success for a compelling appeal to an unused motivation. Judge the substance of the argument rather than the player's acting ability. Resolve the table's perfect success, without the extra benefit of a natural 20.

      == Lies and pressure

      Bluff can support an argument containing a lie. If the argument fails to increase Interest, the GM may decide the NPC detects the lie. A detected lie costs an additional 1 Interest beyond the normal outcome. Its motivation is not spent, but repeating the exposed lie cannot earn a new check.

      Intimidate can emphasize credible consequences, leverage, or the danger of inaction. The NPC must still be willing to bargain. Demanding compliance through an immediate threat of violence generally takes the scene outside negotiation.

      #colbreak();

      = Discovering concerns

      == Before negotiation

      Research, contacts, observation, and relevant techniques or utility powers can reveal motivations and pitfalls. Use ordinary skill checks and the effects of those abilities. Society might uncover political loyalties, Religion might identify obligations, and Insight might reveal a personal concern.

      Give concrete information: _She fears another attack on the docks_ is more useful than simply naming _Protection_. Research does not spend a motivation or reduce the NPC's Patience unless its consequences actually affect the later meeting.

      == During negotiation

      Heroes can ask what the NPC wants. The NPC may freely reveal or hint at a concern; no check is needed for information they willingly share. At Interest 3 or higher, the GM can have the NPC suggest a way to improve the deal.

      To actively uncover a hidden concern, one hero makes a *Normal Insight check*, or another justified skill check, using the negotiation's chosen level.

      #negotiationTable(
        columns: (1fr, 1.6fr),
        rows: (
          [*Check result*], [*Discovery*],
          [Perfect success], [Learn one motivation or pitfall; choose which kind.],
          [Success with a minor hurdle], [Learn one motivation or pitfall; choose which kind. Lose 1 Patience.],
          [Failure], [Learn nothing; lose 1 Patience.],
          [Catastrophic failure], [Learn nothing; lose 1 Patience and introduce a fictional complication.],
        ),
      )

      A natural 20 is a perfect success with an additional useful benefit, such as a clue to another concern. A natural 1 is a catastrophic failure.

      After a discovery check, *the entire party must wait until an argument has been made* before attempting another discovery check on this NPC. Changing speakers does not bypass this limit. If discovery reduces Patience to 0, the current offer becomes final immediately.

      = Reading the reaction

      The NPC's response should communicate whether an argument improved, worsened, or failed to change Interest, unless they are deliberately deceitful. State the resulting offer clearly. Keep a shared record of motivations already used and of the terms the party has promised.
    ]

    #pagebreak();
    #theme.subPageTitle(title: "Offers & Preparation");

    #columns(2)[
      = The current offer

      The offer depends on current Interest. Promised payments and services remain part of the deal unless the NPC explicitly waives or changes them.

      #negotiationTable(
        columns: (auto, 1fr),
        rows: (
          [*Interest*], [*Offer or response*],
          [5], [*Yes, and...* Everything requested, plus an extra benefit or reduced obligations. This is the best offer.],
          [4], [*Yes.* The requested deal, including what the party promised in exchange.],
          [3], [*Yes, but...* The requested help, including everything promised, plus an additional favor, payment, or condition.],
          [2], [*No, but...* Lesser help instead of the main request, in exchange for what the party promised.],
          [1], [*No.* Refusal without a counteroffer. Another argument is possible if Patience remains.],
          [0], [*No, and...* No deal or further negotiation. The NPC seeks to harm the party's interests now or later.],
        ),
      )

      == Ending negotiation

      - *Interest 5:* The best offer is final. Accept or decline, then end.
      - *Interest 0:* End immediately without a deal. Making amends may require a valuable gift, a quest, or another meaningful change in circumstances.
      - *Patience 0:* The current offer is final. Accept or decline, then end.
      - *Interest 1-4 with Patience remaining:* Accept the current offer or continue arguing.

      If Interest and Patience reach an ending value together, apply the final Interest first: Interest 5 still gives the best offer, and Interest 0 still gives no deal. The party can walk away without accepting at any time.

      == Continuing later

      Ending a meeting does not refresh Patience or used motivations. The GM decides when changed circumstances justify another negotiation. A new speaker or a brief wait is not enough by itself.

      = GM preparation

      Before the encounter, establish the main request and prepare:

      - Lesser help available at Interest 2.
      - An additional condition at Interest 3.
      - An extra benefit at Interest 5.
      - Possible hostile consequences at Interest 0.
      - Motivations, pitfalls, and ways the party can learn about them.

      More starting Interest improves the likely offer. More Patience allows more attempts. More motivations provides more favorable approaches. More pitfalls increases risk; use them sparingly and provide clues.

      A failed negotiation should complicate the adventure while leaving other ways forward. An impossible request should be explained as such rather than inviting rolls that cannot secure it.

      #colbreak()

      == Reputation and groups

      When the NPC knows the heroes' deeds, use that reputation to help choose the starting attitude. Approval may make them friendly; notorious misconduct may make them suspicious or hostile. Reputation has no separate score or automatic check bonus in these rules.

      For a council, delegation, or other group, use one shared set of Interest, Patience, motivations, and pitfalls. Different members can speak when their concerns become relevant. State whose agreement the final deal represents.

      = Example: guards for the docks

      The party asks a magistrate to send guards to the docks. She begins neutral: *Interest 2, Patience 3*. Her motivations are protecting residents and maintaining her reputation for fairness. Her pitfall is pressure to surrender her authority.

      One hero explains how patrols will prevent attacks on dock workers, invoking protection. A Diplomacy check succeeds with a minor hurdle: *Interest 3, Patience 2*. The magistrate agrees to send guards, but requires her officer to oversee the operation.

      The party could accept. Instead, another hero presents evidence that the neglected docks deserve the same protection as wealthier districts, invoking fairness with Society. A perfect success brings her to *Interest 4, Patience 2*. She grants the requested patrols without the additional oversight condition.

      Repeating the protection argument would only have cost Patience. Demanding that she hand command to the party would have invoked her pitfall. The party accepts the Interest 4 deal rather than risking the agreement for an extra benefit.
    ]
  ]
}
