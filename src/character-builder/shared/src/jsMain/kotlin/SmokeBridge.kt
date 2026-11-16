@file:OptIn(ExperimentalJsExport::class)

import dev.modern4e.builder.smokeFixture

/** A structural JS object; no Kotlin collections or runtime types cross the boundary. */
@JsExport
external interface SmokeData {
    val fixtureId: String
    val message: String
}

/** Adapts the common fixture to a plain object with generated TypeScript declarations. */
@JsExport
fun getSmokeFixture(): SmokeData {
    val fixture = smokeFixture()
    val result = js("({})")
    result.fixtureId = fixture.fixtureId
    result.message = fixture.message
    return result.unsafeCast<SmokeData>()
}
