package dev.modern4e.builder

/** Build fixture only; this is not a character or rules contract. */
data class SmokeResult(val fixtureId: String, val message: String)

/** Produces the same deterministic fixture on every platform without IO. */
fun smokeFixture(): SmokeResult = SmokeResult(
    fixtureId = "shared-core-v1",
    message = "Shared core is ready.",
)
