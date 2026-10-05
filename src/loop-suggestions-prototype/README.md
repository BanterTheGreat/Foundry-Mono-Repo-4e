# Loop Suggestions (Prototype)

A system-independent Foundry v13+ companion for The Sound of Silence. This is a disposable prototype for answering: do automatically ranked phrase joins make manual loop preparation faster?

Enable both modules, open a playlist sound's configuration, and expand **Suggested loops**. Click **Find suggested loops**, select a ranked region, and copy its start/end timestamps into SoS. Use SoS's existing join preview to audition it. This module does not change loop settings or play audio.

Analysis runs locally in the GM's browser: no Python, model downloads, server, uploads, or player-side analysis. A worker compares pitch-class distributions, spectral tone, onset rhythm, and loudness around possible joins. It searches 4-, 8-, and 16-bar phrases, assumes 4/4, and estimates one constant tempo. Provide a BPM override if automatic estimation misses the beat. Vocals, changing tempo, unusual meter, half/double-time estimates, and incorrect bar phase can produce misleading suggestions. Rank and labels are heuristics, not calibrated confidence.

Tracks must be between 12 seconds and 15 minutes. Audio is fetched in full and decoded at 11025 Hz for analysis; the more energetic stereo channel is used. Browser-supported audio files work, and remote URLs need CORS permission. Results for up to ten paths are retained in memory until the browser reloads. Run analysis again after replacing an audio file at the same path.

The panel attaches through Foundry's sound-sheet render hook, alongside SoS's current `.sos-sound-config` container. If the container is unavailable, it appears separately in the sheet. No SoS source is copied or modified. The prototype has not been validated inside Foundry; reload and check the browser console after installation.

Install for local evaluation from the repository root:

```sh
npm run copy-module -- loop-suggestions-prototype
```

Files: `scripts/main.js` attaches the panel and loads audio; `scripts/analysis.js` contains the pure heuristic; `scripts/analysis-worker.js` runs that heuristic off the UI thread; `styles/suggestions.css` scopes the presentation to this panel.
