/**
 * Read the same configured definitions used by the 0.9.3 condition copy buttons.
 * Return only condition details, never module flags or executable source.
 */
export function conditionData(config, game, id) {
  const status = config?.statusEffects?.find(status => status.id === id);
  if (!status) {
    throw new Error(`Unknown configured condition: ${id}. Use list_conditions to discover IDs.`);
  }
  const localize = value => game.i18n?.localize(value) ?? value;
  const modes = ["custom", "multiply", "add", "downgrade", "upgrade", "override"];
  return {
    id: status.id,
    name: localize(status.name),
    img: status.img,
    changes: (status.changes ?? []).map(change => ({
      key: change.key, value: String(change.value),
      type: change.type ?? modes[change.mode],
      ...(change.priority != null ? { priority: change.priority } : {}),
      ...(change.phase !== undefined ? { phase: change.phase } : {})
    }))
  };
}
