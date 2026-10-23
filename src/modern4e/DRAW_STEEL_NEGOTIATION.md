# Draw Steel Negotiation reference

Consult this file when discussing Draw Steel Negotiation or adapting its mechanics into this rulebook.

## Source and scope

- Source: *Draw Steel Heroes*, v1.01b.
- Local PDF: `C:/Users/Imre/Downloads/Draw Steel Heroes v1.01b.pdf`.
- Chapter 11: printed pages 283-291 (PDF pages 298-306).
- Director guidance: printed pages 385-386 (PDF pages 400-401).
- Supporting rules: power rolls and edges, printed pages 4-5; test difficulty, page 250; skills, page 254.
- This is a mechanical summary, not a transcription. It records Draw Steel rules; any adaptation must explicitly reconcile them with the project's authoritative local 4e rules.

## Core model

The party makes arguments to raise an NPC's **Interest** before exhausting their **Patience**. After each argument, the NPC offers terms based on current Interest. The party can accept or risk another argument.

Use this subsystem for adventure-changing requests where the NPC has reasons both to help and to hesitate. Smaller interactions usually use a single test. Heroes initiate negotiations by asking for something the NPC could seriously consider granting. Cooperation is voluntary; negotiation cannot force arbitrary personality changes. Direct threats of violence generally move the encounter outside negotiation.

## NPC statistics

| Statistic | Meaning and bounds |
| --- | --- |
| Interest | Willingness to make a favorable deal; 0-5, initially 1-4. |
| Patience | Remaining willingness to entertain arguments; 0-5, initially above 0. |
| Motivations | At least two values or interests that make arguments more effective. |
| Pitfalls | At least one topic or approach that provokes a negative reaction; often two. |
| Impression | Renown threshold for reputation to influence this NPC; normally their level if they have one, unless the Director decides otherwise. |

### Suggested starting attitudes

| Attitude | Interest | Patience |
| --- | ---: | ---: |
| Hostile | 1 | 2 |
| Suspicious | 2 | 2 |
| Neutral | 2 | 3 |
| Open | 3 | 3 |
| Friendly | 3 | 4 |
| Trusting | 3 | 5 |

The Director can adjust these values. At the start, add 1 Patience if at least one participating hero speaks the NPC's native language, excluding Caelian; add 2 instead if at least three do. Maximum Patience remains 5.

### Motivation and pitfall categories

Each category can be a motivation for one NPC and a pitfall for another. Interpret it through the specific NPC's values and circumstances.

| Category | A motivating appeal offers or advances... |
| --- | --- |
| Benevolence | Benefits for people the NPC wants to help. |
| Discovery | Knowledge, exploration, experimentation, or unique discoveries. |
| Freedom | Personal liberty or liberation from authority. |
| Greed | Wealth, resources, or desired possessions. |
| Higher Authority | Service to a respected person, organization, deity, or force. |
| Justice | Rewards for the righteous or punishment for the wicked, as the NPC defines them. |
| Legacy | Fame, lasting recognition, or remembrance. |
| Peace | Calm, stability, or relief from disruption. |
| Power | Greater or more secure authority and influence. |
| Protection | Safety for people, places, possessions, information, or organizations in the NPC's care. |
| Revelry | Pleasure, socializing, excitement, or indulgence. |
| Vengeance | Retribution against someone who wronged the NPC. |

## Resolution loop

1. Heroes state their request and give a justified argument. Payment, services, or favors can be offered, but an argument can instead explain why cooperation serves the NPC's interests or values.
2. The Director classifies the argument: pitfall, unused motivation, repeated motivation, or neither motivation nor pitfall.
3. Resolve the appropriate automatic outcome or test below.
4. Update Interest and Patience. The NPC responds and offers terms based on current Interest.
5. End if Interest is 0 or 5, or Patience is 0. Otherwise the heroes choose to accept, walk away, or make another argument.

One hero delivers each argument and makes its test. Players can discuss strategy beforehand. Arguments use Reason, Intuition, or Presence according to the approach, allowing different heroes to contribute.

### Test math

Roll **2d10 + the selected characteristic + applicable modifiers**.

- One applicable skill grants +2; skill bonuses do not stack with each other.
- An edge normally grants +2 and stacks with a skill bonus. Double edge improves the outcome by one tier instead of adding a numeric edge bonus. Normal bane and cancellation rules apply.
- Tier 1: total 11 or lower. Tier 2: 12-16. Tier 3: 17 or higher.
- Natural 19 or 20 means the sum of the dice before modifiers; it always yields tier 3.
- The general test rules allow a hero token to reroll an unwanted test result; the new roll must be used.

### Argument outcomes

Changes apply to the NPC's statistics. Use the explicit outcomes rather than substituting a generic difficulty table.

| Argument | Tier 1 | Tier 2 | Tier 3 |
| --- | --- | --- | --- |
| Unused motivation, no pitfall | Patience -1 | Interest +1; Patience -1 | Interest +1; Patience unchanged |
| Neither motivation nor pitfall | Interest -1; Patience -1 | Patience -1 | Interest +1; Patience -1 |

For an argument involving neither motivation nor pitfall, a natural 19-20 leaves Patience unchanged.

| Special case | Resolution |
| --- | --- |
| Argument uses a pitfall | Automatic failure: Interest -1 and Patience -1. A pitfall prevents the motivation outcome even if the argument also invokes a motivation. |
| Repeats a used motivation | Interest unchanged; Patience -1. |
| Repeats the same argument involving neither motivation nor pitfall | Automatic tier 1. |
| Lie fails to increase Interest | The Director may decide the NPC detects it, imposing an additional Interest -1 beyond the normal outcome. |
| Particularly well-reasoned or well-roleplayed appeal to a motivation | The Director may award automatic tier 3 without a test. |
| Argument appears to appeal to multiple motivations | The Director can ask the player to select one motivation. |

A motivation is used once it is invoked in an argument without a pitfall or a detected lie. A low roll that fails to raise Interest does not by itself allow that motivation to be reused. This follows the chapter's definition of a successful appeal, which is distinct from successfully increasing Interest.

## Learning motivations and pitfalls

Before negotiating, research, reconnaissance, contacts, diaries, downtime projects, or montage tests can reveal information.

During negotiation, heroes can ask what the NPC wants. The NPC may willingly reveal or hint at a motivation. At Interest 3 or higher, the Director may have the NPC volunteer such suggestions.

To actively uncover information through interaction, make a Reason, Intuition, or Presence test, with applicable skills:

| Tier | Result |
| --- | --- |
| 1 | Learn nothing; NPC notices the attempt and loses 1 Patience. |
| 2 | Learn nothing; statistics unchanged. |
| 3 | Learn one motivation or pitfall; the hero chooses which kind. |

After this test, the entire party must wait until an argument is made or the negotiation ends before making another test to determine that NPC's motivations or pitfalls.

## Offers and ending conditions

| Interest | Offer or response |
| ---: | --- |
| 5 | **Yes, and...** Everything requested, plus an extra benefit or reduced/waived obligations. Best possible offer; negotiation ends. |
| 4 | **Yes.** The requested deal, including what the heroes promised in exchange. |
| 3 | **Yes, but...** The requested help in exchange for everything promised, plus an additional favor, payment, or condition. |
| 2 | **No, but...** Lesser goods or services instead of the main request, in exchange for what the heroes promised. |
| 1 | **No.** Refusal without a counteroffer. Another argument is possible if Patience remains. |
| 0 | **No, and...** No deal, no further negotiation, and the NPC seeks to harm the heroes immediately or later. Making amends may require a valuable gift or quest. |

- Patience 0: the current offer is final; accept or decline, then end.
- Interest 5: the current offer is final; accept or decline, then end.
- Interest 0: end immediately without a deal.
- Interest 1-4 with Patience remaining: accept the current offer or continue.
- Heroes can walk away without accepting at any time.

NPC reactions should communicate whether the argument improved, worsened, or failed to change Interest, unless the NPC is deceitful. Make the offer's terms clear to the players.

## Reputation

Reputation applies only if the NPC knows of the hero and **hero Renown >= NPC Impression**. The Director decides whether that hero is famous or infamous to this NPC.

| Reputation | Gain an edge on arguments where these skills could apply |
| --- | --- |
| Famous: NPC approves of the hero's deeds | Flirt, Lead, Persuade |
| Infamous: NPC views the hero's deeds negatively | Brag, Interrogate, Intimidate |

The edge applies even if the hero does not possess the relevant skill. Check character features and titles for further negotiation exceptions.

## Other situations and Director preparation

- **Multiple NPCs:** assign one shared set of statistics, motivations, and pitfalls to the group. Different NPCs can speak when particular motivations or pitfalls become relevant.
- **Stop combat:** a hero can spend a maneuver to attempt a hard Presence test, or another appropriate test chosen by the Director, to halt combat and start negotiation. This can succeed only if the other side is willing and capable of negotiating.
- **Prepare outcomes:** establish the main request, lesser help for Interest 2, additional conditions for Interest 3, a bonus for Interest 5, and possible retaliation for Interest 0.
- **Maintain progression:** a failed negotiation can make the adventure harder but should leave ways for the story to continue.
- **Tune difficulty:** more starting Interest improves likely offers; more Patience gives more arguments; more motivations gives more favorable approaches; more pitfalls increases risk. Excessive hidden pitfalls can feel unfair without opportunities for research.

## Source inconsistency

The rules on printed page 288 call an unused-motivation appeal a **medium test**, while the worked example on page 291 calls it **easy**. Their explicit argument outcomes are the dependable reference: tier 1 only costs Patience; tiers 2-3 raise Interest. Preserve and flag this discrepancy when discussing the source rather than silently importing generic easy-test outcomes.
