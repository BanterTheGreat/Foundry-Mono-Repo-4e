import { Logger } from "../shared/logger.js";

class Dice {
    constructor(name, oldDamage, newDamage) {
        this.Name = name;
        this.OldDamage = new DiceDamage(...oldDamage);
        this.NewDamage = new DiceDamage(...newDamage);
    }
}

// With Mod Classes
export class D4DiceWithMod extends Dice {
    constructor() {
        super("D4 With Mod", [0, 2.5 + 4, 8], [5, 2.5 + 4, 8]);
    }
}

export class D6DiceWithMod extends Dice {
    constructor() {
        super("D6 With Mod", [0, 3.5 + 4, 10], [5, 3.5 + 4, 10]);
    }
}

export class D8DiceWithMod extends Dice {
    constructor() {
        super("D8 With Mod", [0, 4.5 + 4, 12], [5, 4.5 + 4, 12]);
    }
}

export class D10DiceWithMod extends Dice {
    constructor() {
        super("D10 With Mod", [0, 5.5 + 4, 14], [5, 5.5 + 4, 14]);
    }
}

export class D12DiceWithMod extends Dice {
    constructor() {
        super("D12 With Mod", [0, 6.5 + 4, 16], [5, 6.5 + 4, 16]);
    }
}

// Without Mod Classes
export class D4Dice extends Dice {
    constructor() {
        super("D4", [0, 2.5, 4], [1, 2.5, 4]);
    }
}

export class D6Dice extends Dice {
    constructor() {
        super("D6", [0, 3.5, 6], [1, 3.5, 6]);
    }
}

export class D8Dice extends Dice {
    constructor() {
        super("D8", [0, 4.5, 8], [1, 4.5, 8]);
    }
}

export class D10Dice extends Dice {
    constructor() {
        super("D10", [0, 5.5, 10], [1, 5.5, 10]);
    }
}

export class D12Dice extends Dice {
    constructor() {
        super("D12", [0, 6.5, 12], [1, 6.5, 12]);
    }
}



export class DiceDamage {
    miss = 0;
    hit = 0;
    crit = 0;

    constructor(miss, hit, crit) {
        this.miss = miss;
        this.hit = hit;
        this.crit = crit;
    }
}

export function calculateAverage(diceClass) {
    // Base AC = 14 + Level
    // Assuming Level 1
    // Assuming bonus to hit = 4 + 3;
    // Hit: 65%
    // Crit: 5%
    // Miss: 30%
    var missAvg = diceClass.miss * 0.30;
    var hitAvg = diceClass.hit * 0.65;
    var critAvg = diceClass.crit * 0.05;

    return Math.round((missAvg + hitAvg + critAvg) * 10) / 10;
}

export function logCalculation(diceClass) {
    const oldAverage = calculateAverage(diceClass.OldDamage);
    const newAverage = calculateAverage(diceClass.NewDamage);
    const percentage = Math.floor(newAverage / oldAverage * 100);
    
    Logger.info("Calculated damage averages", {
        dice: diceClass.Name,
        oldAverage,
        newAverage,
        percentage,
    });

    return [oldAverage, newAverage, percentage];
}
