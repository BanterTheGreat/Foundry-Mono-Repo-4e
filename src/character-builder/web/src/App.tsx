import { getSmokeFixture } from "@modern4e/shared";

/** Presentation only: the fixture comes from the compiled Kotlin implementation. */
export function App() {
  const fixture = getSmokeFixture();
  return <main>
    <p className="eyebrow">Modern 4e</p>
    <h1>Character Builder</h1>
    <section aria-label="Shared core status">
      <h2>{fixture.message}</h2>
      <code>{fixture.fixtureId}</code>
      <p>Foundation preview. Character creation is not available yet.</p>
    </section>
  </main>;
}
