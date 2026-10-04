/**
 * Displays DnD4e actor levels in the sidebar and its popout without changing names.
 */
export class ActorDirectoryLevels {
  /**
   * Add or refresh badges whenever Foundry renders the actor directory.
   * @param {ActorDirectory} directory The rendered directory.
   * @param {HTMLElement} html The directory's rendered HTML.
   */
  static onRenderActorDirectory(directory, html) {
    const root = html?.querySelectorAll ? html : directory.element;
    if (!root) {
      return;
    }

    for (const row of root.querySelectorAll(".directory-item.document[data-document-id]")) {
      const actor = game.actors.get(row.dataset.documentId);
      const name = row.querySelector(".document-name");
      const level = actor?.system?.details?.level;
      let badge = row.querySelector(".banter-actor-level");
      if (!name || !Number.isInteger(level) || level < 0) {
        badge?.remove();
        row.classList.remove("banter-actor-level-row");
        continue;
      }

      if (!badge) {
        badge = root.ownerDocument.createElement("span");
        badge.className = "banter-actor-level";
        name.after(badge);
      }

      row.classList.add("banter-actor-level-row");
      badge.textContent = `Lv ${level}`;
      badge.title = `Level ${level}`;
    }
  }

  /**
   * Refresh visible badges after a level edit, including the detached sidebar.
   * @param {Actor} actor The updated actor.
   * @param {object} changes The actor update's changed fields.
   */
  static onUpdateActor(actor, changes) {
    if (actor.isToken || (!foundry.utils.hasProperty(changes, "system.details.level")
      && !Object.hasOwn(changes, "system.details.level"))) {
      return;
    }

    for (const directory of [ui.actors, ui.actors?.popout]) {
      if (directory?.rendered) {
        ActorDirectoryLevels.onRenderActorDirectory(directory, directory.element);
      }
    }
  }
}
