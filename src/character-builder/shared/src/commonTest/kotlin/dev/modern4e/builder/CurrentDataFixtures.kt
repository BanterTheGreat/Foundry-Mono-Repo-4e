package dev.modern4e.builder

import kotlin.test.*

/** Real production packages plus the explicitly enabled, test-only presentation override. */
internal object CurrentDataFixtures : ContentSource {
    const val overrideId = "test.modern4e.presentation-override"
    private fun asset(packageId: String, name: String): String = productionFixtures.getValue(
        (if (packageId == overrideId) "" else "authoritative/") + "$packageId/$name.json")
    override suspend fun listPackages() = ContractResult.Available(
        productionFixtures.keys.filter { it.endsWith("/manifest.json") }.sorted().map {
            assertIs<ContractResult.Available<PackageManifest>>(ContractCodec.decodeManifest(productionFixtures.getValue(it))).value
        })
    override suspend fun loadIndex(packageId: String, indexId: String) = ContractResult.Available(
        ContractCodec.json.decodeFromString<ContentIndex>(asset(packageId, indexId)))
    override suspend fun loadChunk(packageId: String, chunkId: String) = ContractResult.Available(
        ContractCodec.json.decodeFromString<EntryChunk>(asset(packageId, chunkId)))
    fun sample(level: Int = 1, custom: Boolean = false) = assertIs<ContractResult.Available<CharacterDocument>>(
        ContractCodec.decode(contractFixtures.getValue("sample-current-fighter-$level-${if (custom) "override" else "base"}.json"))).value
}
