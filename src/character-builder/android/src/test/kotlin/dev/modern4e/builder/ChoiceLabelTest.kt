package dev.modern4e.builder

import org.junit.Assert.assertEquals
import org.junit.Test

class ChoiceLabelTest {
    private fun label(id: String, className: String? = "Fighter") = Progression.choiceLabel(id, className)

    @Test fun powerPoolsNameTheirPowerType() {
        assertEquals("At-Will attack power", label("modern4e.choice.class-attack-at-will"))
        assertEquals("Encounter attack power", label("modern4e.choice.class-attack-encounter"))
        assertEquals("Encounter attack power", label("modern4e.choice.class-attack-encounter-7"))
        assertEquals("Daily attack power", label("modern4e.choice.class-attack-daily-5"))
        assertEquals("Utility power", label("modern4e.choice.class-utility-2"))
        assertEquals("Utility power", label("modern4e.choice.class-utility-10"))
    }

    @Test fun classFeatureChoicesDropTheClassPrefix() {
        assertEquals("Reactivity", label("modern4e.choice.fighter-reactivity"))
        assertEquals("Specialization", label("modern4e.choice.fighter-specialization"))
        assertEquals("Channel Divinity", label("modern4e.choice.cleric-channel-divinity", "Cleric"))
        assertEquals("Techniques", label("modern4e.choice.wizard-techniques-5", "Wizard"))
    }

    @Test fun repeatedClassWordsAndPossessivesReadNaturally() {
        assertEquals("Rogue Tactics", label("modern4e.choice.rogue-rogue-tactics", "Rogue"))
        assertEquals("Paladin's Grace", label("modern4e.choice.paladin-paladin-s-grace", "Paladin"))
        assertEquals("Hunter's Specialization", label("modern4e.choice.ranger-hunters-specialization", "Ranger"))
        assertEquals("Vindicator's Censure", label("modern4e.choice.avenger-vindicators-censure", "Avenger"))
    }

    @Test fun unknownClassKeepsEveryWordAndNeverShowsTheIdPrefix() {
        assertEquals("Fighter Reactivity", label("modern4e.choice.fighter-reactivity", null))
        assertEquals("Feat", label("feat"))
    }
}
