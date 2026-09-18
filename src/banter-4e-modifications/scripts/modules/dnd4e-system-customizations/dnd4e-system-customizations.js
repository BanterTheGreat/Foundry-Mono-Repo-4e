/**
 * Applies this module's homebrew changes to the DnD4e system configuration.
 */
export class Dnd4eSystemCustomizations {
  static replaceConditionList() {
    // Remove a lot of unnecesary status effects to reduce clutter.
    const statusEffectsToRemove = [
      "ammo_count",
      "attack_down",
      "attack_up",
      "defUp",
      "disarmed",
      "drunk",
      "flying",
      "insubstantial",
      "mounted",
      "sleeping",
      "torch",
      "oath",
      "hunter_mark",
      "ongoing_1",
      "ongoing_2",
      "ongoing_3",
      "cover",
      "defDown",
      "regen",
      "running",
      "sneaking",
      "squeezing",
      "target",
      "cover",
      "coverSup",
    ]

    CONFIG.statusEffects = CONFIG.statusEffects.filter(x => !statusEffectsToRemove.includes(x.id));

    // Potentially add new status effects.
    const newStatusEffects = [
      // {
      //     icon: 'systems/pf2e/icons/conditions/flat-footed.webp',
      //     id: '4e_sc_advantage',
      //     label: 'Grants CA',
      // },
    ];

    CONFIG.statusEffects = CONFIG.statusEffects.concat(newStatusEffects);
  }

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
