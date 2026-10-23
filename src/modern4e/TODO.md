# TODO: Distinguish Techniques from Utility Powers

This records the intended distinction and the work needed to apply it to the
rulebook. The terminology choice and individual conversions are still pending;
this document does not change the printed rules.

## Intended roles

| Aspect | Techniques | Manouvres / Non-Attack Utility Powers |
| --- | --- | --- |
| Use case | Accomplish something outside combat with time to prepare or perform a procedure. | Act on the spot, including during a scene under pressure. |
| Frequency | Repeatable, with no inherent encounter or daily use limit. | Ordinary encounter or daily power restrictions. |
| Cost | A resource cost for each use, usually a healing surge; sometimes money or materials. | Primarily the encounter/daily use and the action required; retain any explicit additional costs. |
| Benefit | Can grant large bonuses, substantial effects, or lasting preparations. | Usually smaller bonuses or narrower effects, available immediately. |
| Access | Unlocked through a feat or class feature, then learned under the technique rules. | Selected through the utility-power rules, including applicable level, proficiency, and power-source restrictions. |

### Techniques

Techniques reward preparation, knowledge, and access to resources. A character
with time to perform a technique can use it again whenever they can meet its
requirements and pay its cost. "Infinite use" means there is no separate
encounter or daily charge to expend; it does not mean free use or unlimited
resources.

The usual expenditure is a healing surge. Some techniques instead or additionally
require money or consumed materials. Reusable foci and committed healing surges
need clear treatment so their ongoing requirements are distinguishable from a
cost paid and consumed with each performance.

Large benefits are appropriate because the character invests preparation time
and resources. Crafting an item, preparing a ward, consulting spirits, or arranging
an expedition can therefore achieve more than an immediate utility power. A
technique performed outside combat may still create an item or benefit used in
combat later; preparation is the important distinction.

Technique access remains a feat or class unlock. Learning from a teacher or
manual, and gaining techniques through advancement, should be explained in
relation to that unlock rather than presented as an independent way to bypass it.

### Manouvres / Non-Attack Utility Powers

Rename the current **Non-Combat Utility Powers** category to either **Manouvres**
or **Non-Attack Utility Powers**. The final name is undecided.

These abilities provide an immediate response or opportunity: catching a falling
ally, making a sudden leap, intervening after a failed check, or producing a quick
distraction. They use ordinary encounter or daily restrictions and usually offer
smaller bonuses or more limited effects than a comparable prepared technique.
Timing and immediate availability account for much of their value.

The new name should make clear that these abilities can be useful during combat
as well as exploration and social scenes. Decide how that category relates to
the existing combat utility selections before changing advancement terminology.

## Implementation checklist

- [ ] Choose the final category name and consistent spelling: Manouvres or
  Non-Attack Utility Powers.
- [ ] Rewrite the introductions in [Techniques](glossary/techniques.typ) and
  [Utility Powers](glossary/utility.typ) around preparation versus immediate use.
- [ ] Make the feat/class access requirement explicit in the technique chapter.
  Check [Technique Master](glossary/feats.typ), class grants, advancement picks,
  and learning from teachers or manuals for consistent wording.
- [ ] Audit techniques with no resource cost or unusually short performance
  times. Decide whether each fits the intended role or needs revision.
- [ ] Audit at-will utilities against the intended encounter/daily model;
  explicitly decide whether any exceptions should remain.
- [ ] Review preparation-oriented utilities for conversion, starting with Honing
  Rest, Seed of Healing, Goodberry, Holy Lantern, Transcendent Advisor, Church
  Attendants, and Blackguard's Death Speech. Compare against existing techniques
  before adding another entry; Death Speech overlaps Speak with Dead.
- [ ] For each conversion, specify preparation time, resource cost, duration,
  access requirements, and what repeated uses can accumulate. Review stored
  healing items, helpers, and lasting bonuses in particular.
- [ ] Preserve distinct immediate and prepared options where both have useful
  roles. For example, the Mighty Leap utility and technique need distinct names
  and descriptions if both remain.
- [ ] Review utility powers that modify technique checks, such as Studied Casting
  and Experienced Arcana. Keep their role explicit rather than automatically
  converting them into techniques.
- [ ] Update [character advancement](glossary/creation_&_advancement.typ), chapter
  headings, power cards, class features, feats, and other affected references.
  Decide how moved options affect existing selections and character progression.
- [ ] Preserve power-source restrictions and the revised skill system during
  conversions. Review both the rules and the assembly calls in the utility chapter.
- [ ] Compile and visually inspect the affected book pages after implementing
  the Typst changes.
