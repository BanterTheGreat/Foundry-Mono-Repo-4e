import {
    D10Dice,
    D10DiceWithMod, D12Dice,
    D12DiceWithMod, D4Dice,
    D4DiceWithMod, D6Dice,
    D6DiceWithMod, D8Dice,
    D8DiceWithMod,
    logCalculation
} from "./damage-calculator.js";
import { Logger } from "../shared/logger.js";

export class Scratchpad {
    static runScratchPad() {
        // Helper function to calculate averages
        const getAverage = (array) => array.length === 0 ? 0 : array.reduce((acc, num) => acc + num, 0) / array.length;
        
        // Calculate "with mod" values
        const [d4withModOld, d4withModNew, d4Percentage] = logCalculation(new D4DiceWithMod());
        const [d6withModOld, d6withModNew, d6Percentage] = logCalculation(new D6DiceWithMod());
        const [d8withModOld, d8withModNew, d8Percentage] = logCalculation(new D8DiceWithMod());
        const [d10withModOld, d10withModNew, d10Percentage] = logCalculation(new D10DiceWithMod());
        const [d12withModOld, d12withModNew, d12Percentage] = logCalculation(new D12DiceWithMod());

        // Calculate averages for "with mod"
        const averageOldDamageWithMod = getAverage([d4withModOld, d6withModOld, d8withModOld, d10withModOld, d12withModOld]);
        const averageNewDamageWithMod = getAverage([d4withModNew, d6withModNew, d8withModNew, d10withModNew, d12withModNew]);
        
        Logger.info("Calculated overall damage averages with modifier", {
            oldAverage: averageOldDamageWithMod,
            newAverage: averageNewDamageWithMod,
            percentage: Math.floor(averageNewDamageWithMod / averageOldDamageWithMod * 100),
        });
        
        // Calculate "without mod" values
        const [d4withoutModOld, d4withoutModNew, d4WithoutPercentage] = logCalculation(new D4Dice());
        const [d6withoutModOld, d6withoutModNew, d6WithoutPercentage] = logCalculation(new D6Dice());
        const [d8withoutModOld, d8withoutModNew, d8WithoutPercentage] = logCalculation(new D8Dice());
        const [d10withoutModOld, d10withoutModNew, d10WithoutPercentage] = logCalculation(new D10Dice());
        const [d12withoutModOld, d12withoutModNew, d12WithoutPercentage] = logCalculation(new D12Dice());

        // Calculate averages for "without mod"
        const averageOldDamageWithoutMod = getAverage([d4withoutModOld, d6withoutModOld, d8withoutModOld, d10withoutModOld, d12withoutModOld]);
        const averageNewDamageWithoutMod = getAverage([d4withoutModNew, d6withoutModNew, d8withoutModNew, d10withoutModNew, d12withoutModNew]);

        Logger.info("Calculated overall damage averages without modifier", {
            oldAverage: averageOldDamageWithoutMod,
            newAverage: averageNewDamageWithoutMod,
            percentage: Math.floor(averageNewDamageWithoutMod / averageOldDamageWithoutMod * 100),
        });
    }
}
