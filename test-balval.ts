import fs from 'fs';
import path from 'path';
import { calculateArmyBalVal } from './apps/web/src/features/explorer/utils/balval';

// Let's load the Alien Hives army to test
const dataPath = path.join(process.cwd(), 'data', 'grimdark-future', '3.5.3', 'Alien Hives (w7qor7b2kuifcyvk).json');
const rawData = fs.readFileSync(dataPath, 'utf8');
const armyData = JSON.parse(rawData);

const balvalResults = calculateArmyBalVal(armyData.units);

// Print results table
console.log('--- Alien Hives BalVal Test ---');
console.table(
  Object.values(balvalResults)
    .sort((a, b) => b.normalizedBalVal - a.normalizedBalVal)
    .map(res => {
      const unit = armyData.units.find((u: any) => u.id === res.unitId);
      return {
        Name: unit?.name,
        Tier: res.tier,
        Percentile: (res.normalizedBalVal * 100).toFixed(1) + '%',
        Cost: res.unitCost,
        Offense: res.unitOffense.toFixed(2),
        EHP: res.effectiveHP.toFixed(2),
        OffEff: res.offenseEfficiency.toFixed(3),
        DefEff: res.defenseEfficiency.toFixed(3),
        RawBalVal: res.rawBalVal.toFixed(4)
      };
    })
);

// Examine a specific unit: Hive Lord
const hiveLord = armyData.units.find((u: any) => u.name === 'Hive Lord');
if (hiveLord) {
  const res = balvalResults[hiveLord.id];
  console.log('\n--- Deep Dive: Hive Lord ---');
  console.log(`Cost: ${hiveLord.cost}, Size: ${hiveLord.size}, Qua: ${hiveLord.quality}+, Def: ${hiveLord.defense}+`);
  console.log(`EHP: ${res.effectiveHP.toFixed(2)} (Expected ~ 12 * (1/(1-5/6)) = 72)`);
  console.log(`Offense: ${res.unitOffense.toFixed(2)}`);
  
  hiveLord.weapons.forEach((w: any) => {
      console.log(`  Weapon: ${w.label} (count ${w.count})`);
  });
}
