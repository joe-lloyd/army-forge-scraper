export { default as ArmyList } from './components/ArmyListContainer';
export { default as ArmyDetailView } from './components/ArmyDetailViewContainer';
export { default as SystemCategory } from './components/SystemCategoryContainer';
export { GAME_SYSTEMS } from './hooks/useArmyList';
export { useCommonRules } from './hooks/useCommonRules';
export type { CommonRulesData } from './hooks/useCommonRules';

// Shared OPR upgrade engine — also imported by the analyzer so both pages
// resolve `section.targets` / `affects` / `select` through the same code path.
export {
  buildBaseLoadout,
  applyOption,
  searchLoadouts,
  findBestLoadout,
  enumerateOptionLoadouts,
  getAllLoadouts,
  findTargetedWeapons,
  findReplacedWeapons,
  getOptionCost,
  parseSectionLabel,
  type MatchedTarget,
} from './utils/loadout';
export {
  singularize,
  compareEquipmentNames,
  compareEquipmentToTarget,
  parseSectionTargets,
  type ParsedTarget,
} from './utils/weaponNames';
