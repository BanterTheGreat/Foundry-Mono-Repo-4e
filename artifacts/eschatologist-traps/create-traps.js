// Create three DnD4e 0.9.3 trap NPCs in Eschatologist. Run once as GM.
if (!game.user.isGM) {
  throw new Error('Run this macro as GM.');
}
if (game.system.id !== 'dnd4e' || game.system.version !== '0.9.3') {
  throw new Error('These actors target DnD4e 0.9.3.');
}
const data = [
  {
    "name": "Shotgun Trap",
    "type": "NPC",
    "img": "icons/svg/trap.svg",
    "system": {
      "advancedCals": false,
      "details": {
        "level": 7,
        "tier": 1,
        "exp": 75,
        "size": "med",
        "type": "",
        "origin": "",
        "other": "Object; Trap",
        "role": {
          "primary": "",
          "secondary": "minion",
          "leader": false
        },
        "saves": {
          "value": 0
        }
      },
      "attributes": {
        "hp": {
          "value": 1,
          "max": 1,
          "autototal": false
        },
        "init": {
          "base": 0
        }
      },
      "abilities": {
        "str": {
          "value": 10
        },
        "con": {
          "value": 10
        },
        "dex": {
          "value": 10
        },
        "int": {
          "value": 10
        },
        "wis": {
          "value": 10
        },
        "cha": {
          "value": 10
        }
      },
      "defences": {
        "ac": {
          "base": 10
        },
        "fort": {
          "base": 10
        },
        "ref": {
          "base": 10
        },
        "wil": {
          "base": 10
        }
      },
      "skills": {
        "acr": {
          "base": 3
        },
        "arc": {
          "base": 3
        },
        "ath": {
          "base": 3
        },
        "blu": {
          "base": 3
        },
        "dip": {
          "base": 3
        },
        "dun": {
          "base": 3
        },
        "end": {
          "base": 3
        },
        "hea": {
          "base": 3
        },
        "his": {
          "base": 3
        },
        "ins": {
          "base": 3
        },
        "itm": {
          "base": 3
        },
        "nat": {
          "base": 3
        },
        "prc": {
          "base": 3
        },
        "rel": {
          "base": 3
        },
        "stl": {
          "base": 3
        },
        "stw": {
          "base": 3
        },
        "thi": {
          "base": 3
        }
      },
      "movement": {
        "base": {
          "base": 0
        },
        "walk": {
          "formula": "0"
        },
        "run": {
          "formula": "0"
        },
        "charge": {
          "formula": "0"
        },
        "shift": {
          "formula": "0"
        },
        "notes": "Stationary object."
      },
      "actionpoints": {
        "value": 0
      },
      "biography": "<p>Object trap. The source supplies no defenses, initiative, abilities, size, movement, saves, or action points. Sheet placeholders: Medium, abilities 10, defenses 10, initiative 0, speed 0, save bonus 0, action points 0; unlisted skills use half level. HP 1 represents the minion classification; confirm object durability with the GM. Detection DCs are checks made by creatures, not this actor’s Perception skill. Triggers and conditional effects require GM adjudication.</p>",
      "powerGroupTypes": "action",
      "powerSortTypes": "none"
    },
    "prototypeToken": {
      "name": "Shotgun Trap",
      "actorLink": false,
      "disposition": -1,
      "width": 1,
      "height": 1,
      "texture": {
        "src": "icons/svg/trap.svg"
      }
    },
    "items": [
      {
        "name": "Detect",
        "type": "feature",
        "system": {
          "featureType": "trait",
          "description": {
            "value": "<p>Perception DC 19: You barely manage to notice a taut wire attached to the door, leading inside the rail car. DC 24: Hidden in the mechanism under the train is a shotgun, pointed right at you.</p>"
          }
        }
      },
      {
        "name": "Countermeasures",
        "type": "feature",
        "system": {
          "featureType": "trait",
          "description": {
            "value": "<p><strong>Disable:</strong> Thievery DC 24 to open the door safely and disarm the trap. Failing by 5 or more triggers it.<br><strong>Dodge:</strong> A character who suspects a trap can hide under the level of the rail car floor as he opens the door, and so is only hit by the shotgun in the train wheels. The attack deals 1d10+2 damage, or 1d10+14 on a critical hit. Use the separate Dodge damage attack to represent this situation.</p>"
          }
        }
      },
      {
        "name": "Point Blank Blast",
        "type": "power",
        "system": {
          "powerType": "inherent",
          "powersource": "",
          "prepared": true,
          "useType": "encounter",
          "actionType": "reaction",
          "weaponType": "none",
          "weaponUse": "none",
          "rangeType": "range",
          "rangePower": "1",
          "target": "Triggering creature",
          "attack": {
            "isAttack": true,
            "isBasic": false,
            "ability": "",
            "formula": "10",
            "def": "ref"
          },
          "hit": {
            "isDamage": true,
            "formula": "3d10+6",
            "critFormula": "3d10+42",
            "detail": "3d10+6 damage, or 3d10+42 on a critical hit."
          },
          "damageType": {},
          "description": {
            "chat": "As you slide the door open, a wire snaps and a trio of shotguns—one at floor level of the car, one pointed down from the ceiling, and one mounted underneath the car in its wheel area—discharge in your face.",
            "value": "<p><em>As you slide the door open, a wire snaps and a trio of shotguns—one at floor level of the car, one pointed down from the ceiling, and one mounted underneath the car in its wheel area—discharge in your face.</em></p><p>3d10+6 damage, or 3d10+42 on a critical hit.</p>"
          },
          "trigger": "A creature opens the trapped door.",
          "miss": {
            "halfDamage": true,
            "formula": "",
            "detail": "Half damage."
          },
          "effect": {
            "detail": "Secondary Attack: Repeat the attack against each other creature in Close Blast 3, but it deals half damage on a hit, and none on a miss. Use the separate Secondary Attack power once per other creature."
          }
        }
      },
      {
        "name": "Point Blank Blast — Secondary Attack",
        "type": "power",
        "system": {
          "powerType": "inherent",
          "powersource": "",
          "prepared": true,
          "useType": "encounter",
          "actionType": "reaction",
          "weaponType": "none",
          "weaponUse": "none",
          "rangeType": "closeBlast",
          "rangePower": "3",
          "target": "Each other creature in the blast (excluding the triggering creature)",
          "attack": {
            "isAttack": true,
            "isBasic": false,
            "ability": "",
            "formula": "10",
            "def": "ref"
          },
          "hit": {
            "isDamage": true,
            "formula": "floor((3d10+6)/2)",
            "critFormula": "floor((3d10+42)/2)",
            "detail": "Half of the primary attack damage on a hit; none on a miss."
          },
          "damageType": {},
          "description": {
            "chat": "As you slide the door open, a wire snaps and a trio of shotguns—one at floor level of the car, one pointed down from the ceiling, and one mounted underneath the car in its wheel area—discharge in your face.",
            "value": "<p><em>As you slide the door open, a wire snaps and a trio of shotguns—one at floor level of the car, one pointed down from the ceiling, and one mounted underneath the car in its wheel area—discharge in your face.</em></p><p>Half of the primary attack damage on a hit; none on a miss.</p>"
          },
          "area": "3",
          "trigger": "Resolve after Point Blank Blast; part of the same encounter use.",
          "miss": {
            "halfDamage": false,
            "formula": "",
            "detail": "None."
          },
          "special": "This is a component of Point Blank Blast, not an additional independent use. Roll against each other creature in Close Blast 3."
        }
      },
      {
        "name": "Point Blank Blast — Dodge damage",
        "type": "power",
        "system": {
          "powerType": "inherent",
          "powersource": "",
          "prepared": true,
          "useType": "encounter",
          "actionType": "reaction",
          "weaponType": "none",
          "weaponUse": "none",
          "rangeType": "range",
          "rangePower": "1",
          "target": "Triggering creature hiding below the rail car floor",
          "attack": {
            "isAttack": true,
            "isBasic": false,
            "ability": "",
            "formula": "10",
            "def": "ref"
          },
          "hit": {
            "isDamage": true,
            "formula": "1d10+2",
            "critFormula": "1d10+14",
            "detail": "1d10+2 damage, or 1d10+14 on a critical hit."
          },
          "damageType": {},
          "description": {
            "chat": "As you slide the door open, a wire snaps and a trio of shotguns—one at floor level of the car, one pointed down from the ceiling, and one mounted underneath the car in its wheel area—discharge in your face.",
            "value": "<p><em>As you slide the door open, a wire snaps and a trio of shotguns—one at floor level of the car, one pointed down from the ceiling, and one mounted underneath the car in its wheel area—discharge in your face.</em></p><p>1d10+2 damage, or 1d10+14 on a critical hit.</p>"
          },
          "trigger": "A creature who suspects the trap hides below the rail car floor while opening the trapped door.",
          "requirement": "Apply the Dodge countermeasure; replaces primary damage, not an additional attack.",
          "miss": {
            "halfDamage": true,
            "formula": "",
            "detail": "Half damage, as for Point Blank Blast."
          },
          "special": "Only the shotgun in the train wheels can hit this creature. Resolve the other creatures’ secondary attacks normally."
        }
      }
    ]
  },
  {
    "name": "Tripwire Mine Trap",
    "type": "NPC",
    "img": "icons/svg/trap.svg",
    "system": {
      "advancedCals": false,
      "details": {
        "level": 7,
        "tier": 1,
        "exp": 75,
        "size": "med",
        "type": "",
        "origin": "",
        "other": "Object; Trap",
        "role": {
          "primary": "",
          "secondary": "minion",
          "leader": false
        },
        "saves": {
          "value": 0
        }
      },
      "attributes": {
        "hp": {
          "value": 1,
          "max": 1,
          "autototal": false
        },
        "init": {
          "base": 0
        }
      },
      "abilities": {
        "str": {
          "value": 10
        },
        "con": {
          "value": 10
        },
        "dex": {
          "value": 10
        },
        "int": {
          "value": 10
        },
        "wis": {
          "value": 10
        },
        "cha": {
          "value": 10
        }
      },
      "defences": {
        "ac": {
          "base": 10
        },
        "fort": {
          "base": 10
        },
        "ref": {
          "base": 10
        },
        "wil": {
          "base": 10
        }
      },
      "skills": {
        "acr": {
          "base": 3
        },
        "arc": {
          "base": 3
        },
        "ath": {
          "base": 3
        },
        "blu": {
          "base": 3
        },
        "dip": {
          "base": 3
        },
        "dun": {
          "base": 3
        },
        "end": {
          "base": 3
        },
        "hea": {
          "base": 3
        },
        "his": {
          "base": 3
        },
        "ins": {
          "base": 3
        },
        "itm": {
          "base": 3
        },
        "nat": {
          "base": 3
        },
        "prc": {
          "base": 3
        },
        "rel": {
          "base": 3
        },
        "stl": {
          "base": 3
        },
        "stw": {
          "base": 3
        },
        "thi": {
          "base": 3
        }
      },
      "movement": {
        "base": {
          "base": 0
        },
        "walk": {
          "formula": "0"
        },
        "run": {
          "formula": "0"
        },
        "charge": {
          "formula": "0"
        },
        "shift": {
          "formula": "0"
        },
        "notes": "Stationary object."
      },
      "actionpoints": {
        "value": 0
      },
      "biography": "<p>Object trap. The source supplies no defenses, initiative, abilities, size, movement, saves, or action points. Sheet placeholders: Medium, abilities 10, defenses 10, initiative 0, speed 0, save bonus 0, action points 0; unlisted skills use half level. HP 1 represents the minion classification; confirm object durability with the GM. Detection DCs are checks made by creatures, not this actor’s Perception skill. Triggers and conditional effects require GM adjudication.</p>",
      "powerGroupTypes": "action",
      "powerSortTypes": "none"
    },
    "prototypeToken": {
      "name": "Tripwire Mine Trap",
      "actorLink": false,
      "disposition": -1,
      "width": 1,
      "height": 1,
      "texture": {
        "src": "icons/svg/trap.svg"
      }
    },
    "items": [
      {
        "name": "Detect",
        "type": "feature",
        "system": {
          "featureType": "trait",
          "description": {
            "value": "<p>Perception DC 24: You react to the pressure of a wire against your shin fast enough to stop walking before you trigger the trap.</p>"
          }
        }
      },
      {
        "name": "Countermeasures",
        "type": "feature",
        "system": {
          "featureType": "trait",
          "description": {
            "value": "<p><strong>Disable:</strong> Thievery DC 24 to disable the trap. Failing by 5 or more triggers it.<br><strong>Step Over:</strong> A character aware of the trap can step over it (Dexterity DC 4).</p>"
          }
        }
      },
      {
        "name": "Mine Explosion",
        "type": "power",
        "system": {
          "powerType": "inherent",
          "powersource": "",
          "prepared": true,
          "useType": "encounter",
          "actionType": "reaction",
          "weaponType": "none",
          "weaponUse": "none",
          "rangeType": "closeBurst",
          "rangePower": "2",
          "target": "Creatures in burst",
          "attack": {
            "isAttack": true,
            "isBasic": false,
            "ability": "",
            "formula": "10",
            "def": "ref"
          },
          "hit": {
            "isDamage": true,
            "formula": "5d6",
            "critFormula": "30",
            "detail": "5d6 damage and the target is knocked prone."
          },
          "damageType": {},
          "description": {
            "chat": "Your foot snags something, and then you’re hurled back by an explosion.",
            "value": "<p><em>Your foot snags something, and then you’re hurled back by an explosion.</em></p><p>5d6 damage and the target is knocked prone.</p>"
          },
          "area": "2",
          "trigger": "A creature enters the trapped space.",
          "miss": {
            "halfDamage": true,
            "formula": "",
            "detail": "Half damage. The target is not knocked prone on a miss."
          }
        }
      }
    ]
  },
  {
    "name": "Piercing Clamp Trap",
    "type": "NPC",
    "img": "icons/svg/trap.svg",
    "system": {
      "advancedCals": false,
      "details": {
        "level": 2,
        "tier": 1,
        "exp": 31,
        "size": "med",
        "type": "",
        "origin": "",
        "other": "Object; Trap",
        "role": {
          "primary": "",
          "secondary": "minion",
          "leader": false
        },
        "saves": {
          "value": 0
        }
      },
      "attributes": {
        "hp": {
          "value": 1,
          "max": 1,
          "autototal": false
        },
        "init": {
          "base": 0
        }
      },
      "abilities": {
        "str": {
          "value": 10
        },
        "con": {
          "value": 10
        },
        "dex": {
          "value": 10
        },
        "int": {
          "value": 10
        },
        "wis": {
          "value": 10
        },
        "cha": {
          "value": 10
        }
      },
      "defences": {
        "ac": {
          "base": 10
        },
        "fort": {
          "base": 10
        },
        "ref": {
          "base": 10
        },
        "wil": {
          "base": 10
        }
      },
      "skills": {
        "acr": {
          "base": 1
        },
        "arc": {
          "base": 1
        },
        "ath": {
          "base": 1
        },
        "blu": {
          "base": 1
        },
        "dip": {
          "base": 1
        },
        "dun": {
          "base": 1
        },
        "end": {
          "base": 1
        },
        "hea": {
          "base": 1
        },
        "his": {
          "base": 1
        },
        "ins": {
          "base": 1
        },
        "itm": {
          "base": 1
        },
        "nat": {
          "base": 1
        },
        "prc": {
          "base": 1
        },
        "rel": {
          "base": 1
        },
        "stl": {
          "base": 1
        },
        "stw": {
          "base": 1
        },
        "thi": {
          "base": 1
        }
      },
      "movement": {
        "base": {
          "base": 0
        },
        "walk": {
          "formula": "0"
        },
        "run": {
          "formula": "0"
        },
        "charge": {
          "formula": "0"
        },
        "shift": {
          "formula": "0"
        },
        "notes": "Stationary object."
      },
      "actionpoints": {
        "value": 0
      },
      "biography": "<p>Object trap. The source supplies no defenses, initiative, abilities, size, movement, saves, or action points. Sheet placeholders: Medium, abilities 10, defenses 10, initiative 0, speed 0, save bonus 0, action points 0; unlisted skills use half level. HP 1 represents the minion classification; confirm object durability with the GM. Detection DCs are checks made by creatures, not this actor’s Perception skill. Triggers and conditional effects require GM adjudication.</p>",
      "powerGroupTypes": "action",
      "powerSortTypes": "none"
    },
    "prototypeToken": {
      "name": "Piercing Clamp Trap",
      "actorLink": false,
      "disposition": -1,
      "width": 1,
      "height": 1,
      "texture": {
        "src": "icons/svg/trap.svg"
      }
    },
    "items": [
      {
        "name": "Detect",
        "type": "feature",
        "system": {
          "featureType": "trait",
          "description": {
            "value": "<p>Perception DC 20: One of the burlap sacks on the floor has something metallic peeking through.</p>"
          }
        }
      },
      {
        "name": "Countermeasures",
        "type": "feature",
        "system": {
          "featureType": "trait",
          "description": {
            "value": "<p><strong>Disable:</strong> Thievery DC 20 to disable the trap.<br><strong>Step Over:</strong> A character aware of the trap can step over it with a Dexterity check (DC 4).</p>"
          }
        }
      },
      {
        "name": "Foot Grab",
        "type": "power",
        "system": {
          "powerType": "inherent",
          "powersource": "",
          "prepared": true,
          "useType": "encounter",
          "actionType": "reaction",
          "weaponType": "none",
          "weaponUse": "none",
          "rangeType": "melee",
          "rangePower": "1",
          "target": "Triggering creature",
          "attack": {
            "isAttack": true,
            "isBasic": false,
            "ability": "",
            "formula": "8",
            "def": "ac"
          },
          "hit": {
            "isDamage": true,
            "formula": "1d6+2",
            "critFormula": "8",
            "detail": "1d6+2 damage, and the target is grabbed by its foot, if it has one (escape DC 18). Until the grab ends, the target takes ongoing 5 damage. Each time the target makes an escape attempt against the grab, the target takes 5 damage. If the trap drops the target below 1 hit point, the target loses the foot."
          },
          "damageType": {},
          "description": {
            "chat": "You step on what looks like a discarded burlap sack, but there’s a click, and your leg feels like it’s been bitten by a dragon.",
            "value": "<p><em>You step on what looks like a discarded burlap sack, but there’s a click, and your leg feels like it’s been bitten by a dragon.</em></p><p>1d6+2 damage, and the target is grabbed by its foot, if it has one (escape DC 18). Until the grab ends, the target takes ongoing 5 damage. Each time the target makes an escape attempt against the grab, the target takes 5 damage. If the trap drops the target below 1 hit point, the target loses the foot.</p>"
          },
          "trigger": "A creature enters the trapped space.",
          "miss": {
            "halfDamage": false,
            "formula": "",
            "detail": "No miss effect specified."
          }
        }
      }
    ]
  }
];
const folders = game.folders.filter(folder => folder.type === 'Actor' && folder.name === 'Eschatologist');
if (folders.length > 1) {
  throw new Error('Multiple Actor folders named Eschatologist; choose a destination before importing.');
}
const destination = folders[0] ?? await Folder.create({ name: 'Eschatologist', type: 'Actor' });
const existing = data.filter(entry => game.actors.some(actor => actor.name === entry.name && actor.folder?.id === destination.id));
if (existing.length) {
  throw new Error('Trap actors already exist in Eschatatologist: ' + existing.map(entry => entry.name).join(', '));
}
const created = await Actor.createDocuments(data.map(entry => ({ ...entry, folder: destination.id })));
ui.notifications.info('Created ' + created.length + ' trap NPCs in Eschatologist.');
