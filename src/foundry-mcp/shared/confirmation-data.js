export const CHANGE_SUMMARY_MAX_LENGTH = 1000;

/**
 * Accept optional plain-language review text without document-write semantics.
 */
export function validateChangeSummary(summary) {
  if (summary !== undefined && (typeof summary !== "string" || !summary.trim() || summary.length > CHANGE_SUMMARY_MAX_LENGTH)) {
    throw new Error(`Change summary must be nonempty text of at most ${CHANGE_SUMMARY_MAX_LENGTH} characters.`);
  }
}
