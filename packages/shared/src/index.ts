export interface ArmyBook {
  uid: string;
  name: string;
  genericName?: string;
  background?: string;
  units: Unit[];
}

export interface Unit {
  id: string;
  name: string;
  cost: number;
  quality: number;
  defense: number;
  size: number;
  weapons: any[];
  rules: any[];
}
