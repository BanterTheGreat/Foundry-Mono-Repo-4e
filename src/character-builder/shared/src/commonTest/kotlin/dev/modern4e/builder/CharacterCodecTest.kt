package dev.modern4e.builder

import kotlinx.serialization.json.*
import kotlin.test.*

/** Identical import/export fixtures and policies run on JVM and JavaScript. */
class CharacterCodecTest {
    private val json = ContractCodec.json
    private val golden get() = json.parseToJsonElement(contractFixtures.getValue("character.json")).jsonObject
    private fun decode(tree: JsonElement) = ContractCodec.decode(tree.toString())
    private fun document() = assertIs<ContractResult.Available<CharacterDocument>>(decode(golden)).value
    private fun reject(tree: JsonElement, path: String? = null) {
        val errors = assertIs<ContractResult.Unavailable>(decode(tree)).diagnostics
        assertTrue(errors.all { it.kind == DiagnosticKind.INCOMPATIBLE_FORMAT })
        if (path != null) {
            assertTrue(errors.any { path in it.message }, errors.toString())
        }
    }

    @Test
    fun everyDecisionAndMetadataSurvivesRepeatedExchange() {
        val fixture = document()
        val history = fixture.levels.last()
        val progression = history.replacements.single().copy(kind = ReplacementKind.PROGRESSION,
            replacement = history.replacements.single().replacement.copy(instanceId = "progression-instance"))
        val initial = fixture.copy(
            identity = CharacterIdentity("\u00c1da \uD83D\uDDE1", "Player", "Line one\n\"quoted\" \\ notes"),
            levels = fixture.levels.dropLast(1) + history.copy(replacements = history.replacements + progression),
            equipment = fixture.equipment.map { it.copy(configuration = mapOf("custom-key" to "custom value", "hand" to "off")) },
            manualAdjustments = ModifierOperation.entries.mapIndexed { index, operation ->
                ManualAdjustment("manual.$index", TypedModifier(ModifierTarget(Statistic.SKILL_CHECK, skill = Skill.MEDICINE),
                    operation, -index, BonusType.POWER), if (index == 0) "" else "Optional reason")
            },
        )
        var current = initial
        repeat(3) {
            val encoded = assertIs<ContractResult.Available<String>>(ContractCodec.encodeChecked(current)).value
            current = assertIs<ContractResult.Available<CharacterDocument>>(ContractCodec.decode(encoded)).value
            assertEquals(initial, current)
        }
        assertEquals(4, current.levels.first().proficiencies.size)
        assertEquals(initial.packages, current.packages)
        assertEquals(initial.abilities, current.abilities)
        assertEquals(initial.levels, current.levels)
        assertEquals(initial.equipment, current.equipment)
        assertEquals(initial.manualAdjustments, current.manualAdjustments)
    }

    @Test
    fun missingOptionalFieldsUseOnlyContractDefaults() {
        val minimal = JsonObject(golden - setOf("levels", "equipment", "manualAdjustments") +
            ("identity" to JsonObject(mapOf("name" to JsonPrimitive("Ada")))))
        val decoded = assertIs<ContractResult.Available<CharacterDocument>>(decode(minimal)).value
        assertEquals(emptyList(), decoded.levels)
        assertEquals(emptyList(), decoded.equipment)
        assertEquals(emptyList(), decoded.manualAdjustments)
        assertEquals(CharacterIdentity("Ada"), decoded.identity)
        assertEquals(decoded, assertIs<ContractResult.Available<CharacterDocument>>(ContractCodec.decode(ContractCodec.encode(decoded))).value)
        for (key in listOf("id", "savedAt", "identity", "packages", "level", "abilities")) {
            reject(JsonObject(golden - key), "$.${key}")
        }
        reject(JsonObject(golden + ("levels" to JsonNull)), "$.levels")
    }

    @Test
    fun versionsAreRequiredIntegersAndSeparateFromContentRevisions() {
        for (version in listOf(JsonNull, JsonPrimitive("1"), JsonPrimitive(true), JsonPrimitive(1.5), JsonPrimitive(2), JsonPrimitive(0))) {
            reject(JsonObject(golden + ("formatVersion" to version)), "$.formatVersion")
        }
        reject(JsonObject(golden - "formatVersion"), "$.formatVersion")
        val changed = document().copy(packages = listOf(PackageRevision("uninstalled", "future/revision-999")))
        assertEquals(changed, assertIs<ContractResult.Available<CharacterDocument>>(ContractCodec.decode(ContractCodec.encode(changed))).value)
    }

    @Test
    fun unknownFieldsAreRejectedRatherThanSilentlyDropped() {
        reject(JsonObject(golden + ("totals" to JsonObject(emptyMap()))), "$.totals")
        reject(JsonObject(golden + ("identity" to JsonObject(golden.getValue("identity").jsonObject +
            ("futureName" to JsonPrimitive("data"))))), "$.identity.futureName")
        val equipment = golden.getValue("equipment").jsonArray
        reject(JsonObject(golden + ("equipment" to JsonArray(listOf(JsonObject(equipment.first().jsonObject +
            ("description" to JsonPrimitive("not portable"))))))), "$.equipment[0].description")
    }

    @Test
    fun duplicateFieldsCannotOverwriteDecisionsIncludingEscapedKeys() {
        for (text in listOf(
            golden.toString().dropLast(1) + ",\"id\":\"replacement\"}",
            golden.toString().replace("\"name\":\"Ada\"", "\"name\":\"Ada\",\"na\\u006de\":\"other\""),
        )) {
            val result = assertIs<ContractResult.Unavailable>(ContractCodec.decode(text))
            assertTrue(result.diagnostics.any { it.code == "character.duplicateField" })
        }
        val current = document().copy(identity = CharacterIdentity("""{ } [ ] : \", "id": 2"""))
        assertEquals(current, assertIs<ContractResult.Available<CharacterDocument>>(ContractCodec.decode(ContractCodec.encode(current))).value)
    }

    @Test
    fun scalarTypesNeverCoerceQuotedNumbersOrUnquotedStrings() {
        for ((key, value) in listOf("id" to JsonPrimitive(12), "level" to JsonPrimitive("4"),
            "level" to JsonPrimitive(4.5), "level" to JsonPrimitive(2147483648L), "packages" to JsonNull)) {
            reject(JsonObject(golden + (key to value)), "$.${key}")
        }
        val equipment = golden.getValue("equipment").jsonArray.first().jsonObject
        for ((key, value) in listOf("equipped" to JsonPrimitive("true"), "quantity" to JsonPrimitive("1"))) {
            reject(JsonObject(golden + ("equipment" to JsonArray(listOf(JsonObject(equipment + (key to value)))))), "$.equipment[0].$key")
        }
        val abilities = golden.getValue("abilities").jsonObject
        reject(JsonObject(golden + ("abilities" to JsonObject(abilities + ("points" to
            JsonObject(mapOf("STRENGTH" to JsonPrimitive("4"))))))), "$.abilities.points.STRENGTH")
        reject(JsonObject(golden + ("abilities" to JsonObject(abilities + ("mainAbility" to JsonPrimitive("UNKNOWN"))))), "$.abilities.mainAbility")
    }

    @Test
    fun identifiersAndTimestampsAreValidatedOnImportAndExport() {
        for (key in listOf("id", "savedAt")) {
            reject(JsonObject(golden + (key to JsonPrimitive("  "))), "$.${key}")
        }
        val invalid = document().copy(packages = listOf(PackageRevision("", "")))
        assertIs<ContractResult.Unavailable>(ContractCodec.encodeChecked(invalid))
        assertFailsWith<IllegalArgumentException> { ContractCodec.encode(invalid) }
        val selection = document().equipment.single().selection.copy(entryId = " ", supplierPackageId = "", acknowledgedFingerprint = "")
        assertIs<ContractResult.Unavailable>(ContractCodec.encodeChecked(document().copy(equipment = listOf(document().equipment.single().copy(instanceId = "", selection = selection)))))
        for (timestamp in listOf("2025-02-29T12:00:00Z", "2026-11-16", "2026-11-16T24:00:00Z", "2026-11-16T12:00:00+24:00")) {
            reject(JsonObject(golden + ("savedAt" to JsonPrimitive(timestamp))), "$.savedAt")
        }
        for (timestamp in listOf("2024-02-29T12:00:00Z", "2026-11-16T12:00:00.123+01:00")) {
            assertIs<ContractResult.Available<CharacterDocument>>(decode(JsonObject(golden + ("savedAt" to JsonPrimitive(timestamp)))))
        }
    }

    @Test
    fun invalidJsonLexemesReturnStructuredErrors() {
        val source = golden.toString()
        val malformed = listOf("01", "-01", "+1", "1.", ".1", "1e", "NaN").map {
            source.replace("\"formatVersion\":1", "\"formatVersion\":$it")
        } + (0..31).map { control ->
            source.replace("\"Ada\"", "\"Ada${control.toChar()}Name\"")
        } + listOf(
            source.replace("\"Ada\"", "\"bad\\x20escape\""),
            source.replace("\"Ada\"", "\"bad\\u00xzescape\""),
            "\u00a0$source",
        )
        for (text in malformed) {
            val result = assertIs<ContractResult.Unavailable>(ContractCodec.decode(text), text)
            assertTrue(result.diagnostics.any { it.code == "character.malformed" && "JSON offset" in it.message })
        }
        val escaped = document().copy(identity = CharacterIdentity("\u0000\t\n\r\"\\/\u00e9"))
        assertEquals(escaped, assertIs<ContractResult.Available<CharacterDocument>>(
            ContractCodec.decode(ContractCodec.encode(escaped))).value)
    }

    @Test
    fun opaqueConstraintsCoverEveryIdentifierOccurrenceWithoutConstrainingFreeText() {
        val identifiers = setOf("id", "instanceId", "entryId", "supplierPackageId", "packageId",
            "revision", "acknowledgedFingerprint", "sourceInstanceId", "choiceId")
        var checked = 0
        fun visit(value: JsonElement, replace: (JsonElement) -> JsonElement, path: String) {
            when (value) {
                is JsonObject -> for ((key, child) in value) {
                    val replaceChild = { replacement: JsonElement -> replace(JsonObject(value + (key to replacement))) }
                    if (key in identifiers) {
                        reject(replaceChild(JsonPrimitive("  ")), "$path.$key")
                        checked++
                    } else {
                        visit(child, replaceChild, "$path.$key")
                    }
                }
                is JsonArray -> value.forEachIndexed { index, child ->
                    visit(child, { replacement -> replace(JsonArray(value.mapIndexed { i, item ->
                        if (i == index) replacement else item
                    })) }, "$path[$index]")
                }
                else -> Unit
            }
        }
        visit(golden, { it }, "$")
        assertTrue(checked > 30)
        val freeText = document().copy(identity = CharacterIdentity("", "", ""), equipment =
            document().equipment.map { it.copy(configuration = mapOf("id" to "", "revision" to "")) })
        assertEquals(freeText, assertIs<ContractResult.Available<CharacterDocument>>(
            ContractCodec.decode(ContractCodec.encode(freeText))).value)
    }

    @Test
    fun malformedStructureAndContractInvariantsReturnErrors() {
        for (source in listOf("{", "[]", "null", "true", "", golden.toString() + " trailing")) {
            assertIs<ContractResult.Unavailable>(ContractCodec.decode(source))
        }
        for (level in listOf(0, 31, 2)) {
            reject(JsonObject(golden + ("level" to JsonPrimitive(level))))
        }
        val levels = golden.getValue("levels").jsonArray
        reject(JsonObject(golden + ("levels" to JsonArray(listOf(levels.first(), levels.first())))))
        val item = golden.getValue("equipment").jsonArray.first().jsonObject
        reject(JsonObject(golden + ("equipment" to JsonArray(listOf(JsonObject(item + ("quantity" to JsonPrimitive(0))))))))
    }

    @Test
    fun codecPreservesMechanicallyInvalidAndUnresolvedChoicesWithoutEngineValidation() {
        val current = document()
        val invalid = current.copy(abilities = current.abilities.copy(points = mapOf(Ability.STRENGTH to -7)))
        assertEquals(invalid, assertIs<ContractResult.Available<CharacterDocument>>(ContractCodec.decode(ContractCodec.encode(invalid))).value)
        val missing = current.levels.first().entries.last().selection
        assertEquals("missing.custom", missing.supplierPackageId)
        assertEquals("Lost Custom Feat", missing.savedTitle)
        assertEquals(current.savedAt, invalid.savedAt)
    }
}
