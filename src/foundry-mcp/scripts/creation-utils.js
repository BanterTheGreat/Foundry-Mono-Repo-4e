const folderPending = new WeakMap();

/**
 * Resolve an explicit destination and create missing world folder paths for the requested document type.
 * Serialize folder work so concurrent creation requests share the same new folder.
 */
export async function resolveCreationFolder(game, destination, Folder, assertSession, documentType) {
  const previous = folderPending.get(game) ?? Promise.resolve();
  const promise = previous.catch(() => {}).then(async () => {
    assertSession();
    return findOrCreateFolder(game, destination, Folder, assertSession, documentType);
  });
  folderPending.set(game, promise);
  try {
    return await promise;
  } finally {
    if (folderPending.get(game) === promise) {
      folderPending.delete(game);
    }
  }
}

/**
 * Match folders of the requested document type only; require a path or ID for ambiguous names.
 */
async function findOrCreateFolder(game, destination, Folder, assertSession, documentType) {
  const selector = destination.trim();
  const byId = game.folders.get(selector);
  if (byId) {
    if (byId.type !== documentType || byId.pack) {
      throw new Error(`Choose a world ${documentType} folder.`);
    }
    return byId;
  }
  const segments = selector.split("/").map(segment => segment.trim());
  if (segments.some(segment => !segment || segment.length > 200)) {
    throw new Error("Use a folder name or path with non-empty names of at most 200 characters.");
  }
  const path = segments.join("/");
  const worldFolders = () => Array.from(game.folders.values()).filter(folder => folder.type === documentType && !folder.pack);
  const matches = worldFolders().filter(folder => segments.length > 1
    ? folderPath(folder) === path
    : folder.name === path);
  if (matches.length > 1) {
    throw new Error("Folder name or path is ambiguous; specify its full path or folder ID.");
  }
  if (matches.length === 1) {
    return matches[0];
  }
  let parent = null;
  for (const name of segments) {
    assertSession();
    const children = worldFolders().filter(folder => folder.name === name && (folder.folder?.id ?? null) === (parent?.id ?? null));
    if (children.length > 1) {
      throw new Error("Folder path is ambiguous; specify a folder ID.");
    }
    if (children.length === 1) {
      parent = children[0];
      continue;
    }
    parent = await Folder.create({ name, type: documentType, folder: parent?.id ?? null });
    assertSession();
    if (!parent) {
      throw new Error(`${documentType} folder creation was cancelled.`);
    }
  }
  return parent;
}

/**
 * Read the parent chain without relying on Foundry's derived folder path.
 */
function folderPath(folder) {
  const names = [];
  const visited = new Set();
  for (let current = folder; current; current = current.folder) {
    if (visited.has(current.id)) {
      throw new Error("Invalid folder hierarchy.");
    }
    visited.add(current.id);
    names.unshift(current.name);
  }
  return names.join("/");
}

/**
 * Canonical JSON makes retry fingerprints independent of property order.
 */
export function canonical(value) {
  if (Array.isArray(value)) {
    return value.map(canonical);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  }
  return value;
}

