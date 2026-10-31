// Command-line helpers shared by the map generators' entry scripts.

/**
 * Value following a `--flag` on the command line, or the fallback when the flag is absent.
 * @param {string} flag Flag name including dashes, e.g. `--seed`.
 * @param {string|number|undefined} fallback Value returned when the flag is absent.
 * @returns {string|number|undefined}
 */
export function cliArg(flag, fallback) {
  const at = process.argv.indexOf(flag);
  return at === -1 ? fallback : process.argv[at + 1];
}

/**
 * The first positional argument (a map path), or the fallback when it is missing or is a `--flag`.
 * @param {string} fallback Path used when no positional argument was given.
 * @returns {string}
 */
export function cliMapPath(fallback) {
  const first = process.argv[2];
  return first && !first.startsWith('--') ? first : fallback;
}
