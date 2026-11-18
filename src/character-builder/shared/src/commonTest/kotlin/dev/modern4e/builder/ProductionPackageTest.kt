package dev.modern4e.builder

import kotlin.test.*

/** Generated current-data packages retain codec compatibility on both JVM and JS. */
class ProductionPackageTest {
    @Test
    fun generatedPackagesAreConsumableOnBothTargets() {
        val json = ContractCodec.json
        for (name in productionFixtures.keys.filter { it.endsWith("/manifest.json") }) {
            val prefix = name.removeSuffix("manifest.json")
            val manifest = assertIs<ContractResult.Available<PackageManifest>>(ContractCodec.decodeManifest(productionFixtures.getValue(name))).value
            assertEquals(2, manifest.formatVersion)
            val entries = manifest.chunks.flatMap { json.decodeFromString<EntryChunk>(productionFixtures.getValue("$prefix$it.json")).entries }
            val metadata = manifest.indexes.flatMap { json.decodeFromString<ContentIndex>(productionFixtures.getValue("$prefix$it.json")).entries }
            assertEquals(entries.map { it.id }, metadata.map { it.id })
            for (entry in entries) {
                assertFalse(entry.id == "class3")
                assertEquals(entry, json.decodeFromString<ContentEntry>(json.encodeToString(ContentEntry.serializer(), entry)))
            }
        }
    }
}
