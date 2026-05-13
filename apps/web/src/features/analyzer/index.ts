export { DropZone } from './components/DropZone';
export { AnalyzerLoader } from './components/AnalyzerLoader';
export { ArmyStatsCard } from './components/ArmyStatsCard';
export { UnitAnalysisCard } from './components/UnitAnalysisCard';
export { parseArmyForgeList, fetchListById, extractShareId } from './utils/parseList';
export { analyzeList, THREAT_PROFILES, OPPONENT_PROFILES } from './utils/aggregate';
export type { ArmyAnalysis, UnitAnalysis, OpponentProfile, Tier5 } from './utils/aggregate';

// Re-export the shared upgrade engine. The analyzer reads each unit's baked
// `loadout` from Army Forge directly today, but if a future flow needs to
// replay `selectedUpgrades` against the source army book it should use the
// same primitives the army detail view uses — never reimplement target
// matching here.
export {
  applyOption,
  buildBaseLoadout,
  findBestLoadout,
  enumerateOptionLoadouts,
  getAllLoadouts,
  findTargetedWeapons,
  getOptionCost,
  singularize,
  compareEquipmentNames,
  compareEquipmentToTarget,
  parseSectionTargets,
} from '@/features/explorer';
