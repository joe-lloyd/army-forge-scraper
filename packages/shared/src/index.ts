export interface ArmyBook {
  uid: string;
  name: string;
  genericName?: string;
  background?: string;
  enabledGameSystems: number[];
  units: Unit[];
  upgradePackages: UpgradePackage[];
  specialRules: any[];
}

export interface Unit {
  id: string;
  name: string;
  cost: number;
  quality: number;
  defense: number;
  size: number;
  weapons: Weapon[];
  rules: Rule[];
  upgrades: string[];
  genericName?: string;
}

export interface Weapon {
  id: string;
  name: string;
  count: number;
  range: number;
  attacks: number;
  specialRules: any[];
  label: string;
}

export interface Rule {
  id: string;
  name: string;
  rating?: number;
  label: string;
}

export interface UpgradePackage {
  uid: string;
  sections: UpgradeSection[];
}

export interface UpgradeSection {
  id: string;
  label: string;
  options: UpgradeOption[];
  type: string;
}

export interface UpgradeOption {
  id: string;
  label: string;
  cost: number;
  gains: any[];
}
