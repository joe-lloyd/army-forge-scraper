export interface Unit {
  id: string;
  name: string;
  genericName?: string;
  cost: number;
  quality: number;
  defense: number;
  weapons: any[];
  items?: any[];
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
  sections: any[];
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
