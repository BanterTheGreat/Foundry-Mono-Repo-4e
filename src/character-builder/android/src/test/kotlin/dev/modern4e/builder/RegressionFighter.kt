package dev.modern4e.builder

import java.io.File

/** The generated level-19 regression Fighter and the typical Levels edits the performance baselines replay on it. */
internal object RegressionFighter {
    fun document(): CharacterDocument = (ContractCodec.decode(File("../shared/fixtures/sample-regression-fighter-19.json")
        .readText(Charsets.UTF_8)) as ContractResult.Available).value

    /**
     * One edit of each common kind, applied in order. Each keeps the edited slot's saved occurrence, as a picker does
     * when it reopens a made choice.
     */
    val edits: List<Pair<String, BuilderEdit>> = listOf(
        "unrelated feat" to BuilderEdit.Entry(14, ChoiceSlotId("advancement.14", "feat", 0),
            "modern4e.feat.fast-runner", "feat-14"),
        "encounter power" to BuilderEdit.Entry(7, ChoiceSlotId("fighter", "modern4e.choice.class-attack-encounter-7", 0),
            "modern4e.power.fighter-power1018", "attack-encounter-7"),
        "ability at 4" to BuilderEdit.Advancement(4, AbilityAdvancement(AdvancementRules.abilitySlot(4),
            mapOf(Ability.WISDOM to 1))),
        "level 1 skill" to BuilderEdit.Proficiency(1, ProficiencyChoice(ChoiceSlotId("creation", "free-skill", 0), Skill.NATURE)),
        "paragon path" to BuilderEdit.Entry(11, ChoiceSlotId("advancement.11", "paragon-path", 0),
            "modern4e.path.paragonpath219", "celebrity"),
    )
}
