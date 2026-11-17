package dev.modern4e.builder

import kotlinx.serialization.json.*
import kotlin.test.*

/** Personal details round-trip as portable decisions without changing legacy v1 data. */
class CharacterIdentityTest {
    private fun original() = assertIs<ContractResult.Available<CharacterDocument>>(
        ContractCodec.decode(contractFixtures.getValue("character.json"))).value

    @Test fun legacyDocumentRetainsItsWireRepresentation() {
        val old = original()
        assertEquals("", old.identity.age)
        assertEquals("", old.identity.deity)
        assertEquals("", old.identity.size)
        assertEquals(ContractCodec.json.parseToJsonElement(contractFixtures.getValue("character.json")),
            ContractCodec.json.parseToJsonElement(ContractCodec.encode(old)))
    }

    @Test fun personalDetailsRoundTripAndCanBeCleared() {
        val doc = original().let { it.copy(identity = it.identity.copy(gender = "Woman", age = "28", deity = "Erathis",
            languages = "Common, Dwarven", size = "Medium")) }
        val restored = assertIs<ContractResult.Available<CharacterDocument>>(ContractCodec.decode(ContractCodec.encode(doc))).value
        assertEquals(doc, restored)
        val cleared = restored.copy(identity = restored.identity.copy(deity = ""))
        val encoded = ContractCodec.encode(cleared)
        assertFalse(ContractCodec.json.parseToJsonElement(encoded).jsonObject.getValue("identity").jsonObject.containsKey("deity"))
        assertEquals("", assertIs<ContractResult.Available<CharacterDocument>>(ContractCodec.decode(encoded)).value.identity.deity)
    }

    @Test fun numericPersonalFieldsAreNotSilentlyCoerced() {
        val tree = ContractCodec.json.parseToJsonElement(ContractCodec.encode(original())).jsonObject
        val identity = tree.getValue("identity").jsonObject
        val malformed = JsonObject(tree + ("identity" to JsonObject(identity + ("age" to JsonPrimitive(28)))))
        assertIs<ContractResult.Unavailable>(ContractCodec.decode(malformed.toString()))
    }
}
