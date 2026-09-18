/**
 * Applies this module's homebrew changes to the DnD4e system configuration.
 */
export class Dnd4eSystemCustomizations {
  /**
   * Replaces the standard DnD4e skill list with this world's homebrew skills.
   *
   * The DnD4e v0.9 data model derives the permitted actor skill keys from
   * CONFIG.DND4E.skills during initialization.
   */
  static replaceSkills() {
    const { skills } = CONFIG.DND4E;

    // Remake with different ability in-world. Heal: 'Intelligence'. Religion: 'Wisdom'.
    delete skills.hea;
    delete skills.rel;

    // Remake with different name in-world. 'Society'
    delete skills.his;

    // Merged into other skills.
    delete skills.stw;
    delete skills.dun;

    skills.cra = {
      label: "Crafting",
      ability: "int",
      armourCheck: false,
    };

    skills.soc = {
      label: "Society",
      ability: "int",
      armourCheck: false,
    };

    skills.banter_rel = {
      label: "Religion",
      ability: "wis",
      armourCheck: false,
    };

    skills.banter_hea = {
      label: "Medicine",
      ability: "int",
      armourCheck: false,
    };
  }
}
