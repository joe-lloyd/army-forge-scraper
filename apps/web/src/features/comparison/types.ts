export interface Weapon {
  id: string;
  name: string;
  range: number;
  attacks: number;
  specialRules: any[];
  count: number;
}

export interface Item {
  id: string;
  name: string;
  content: any[];
  count: number;
}

export interface UpgradeOption {
  id: string;
  uid?: string;
  label: string;
  cost: number;
  costs?: { unitId: string; cost: number }[];
  gains: any[];
  finalCost?: number;
}

export interface UpgradeSection {
  id: string;
  uid?: string;
  label: string;
  options: UpgradeOption[];
}

export interface Unit {
  id: string;
  name: string;
  genericName?: string;
  cost: number;
  quality: number;
  defense: number;
  weapons: Weapon[];
  items?: Item[];
  rules: any[];
  upgrades: string[];
  size?: number;
  bases?: Record<string, string>;
  product?: {
    storeLinksPhysical?: string[];
    storeLinksDigital?: string[];
  };
}

export interface UpgradePackage {
  uid: string;
  hint: string;
  sections: UpgradeSection[];
}

export interface Spell {
  id: string;
  name: string;
  threshold: number;
  effect: string;
}

export interface SpecialRule {
  id: string;
  name: string;
  description: string;
}

export interface ArmyData {
  name: string;
  genericName?: string;
  units: Unit[];
  upgradePackages: UpgradePackage[];
  rules?: any[];
  spells?: Spell[];
  specialRules?: SpecialRule[];
  background?: string;
}
