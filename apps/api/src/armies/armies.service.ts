import { ArmyBook, Unit } from "@opr-api/shared";
import { Injectable, OnModuleInit } from "@nestjs/common";
import * as fs from "fs-extra";
import * as path from "path";

@Injectable()
export class ArmiesService implements OnModuleInit {
  private armies: (ArmyBook & { systemContextId: number })[] = [];
  private readonly dataPath = path.join(
    __dirname,
    "..",
    "..",
    "..",
    "..",
    "data",
  );

  private readonly SLUG_TO_ID: Record<string, number> = {
    "grimdark-future": 2,
    "grimdark-future-firefight": 3,
    "age-of-fantasy": 4,
    "age-of-fantasy-skirmish": 5,
  };

  async onModuleInit() {
    await this.loadArmies();
  }

  async loadArmies() {
    try {
      if (!(await fs.pathExists(this.dataPath))) {
        console.warn(`Data path ${this.dataPath} does not exist.`);
        return;
      }

      this.armies = [];
      const systems = await fs.readdir(this.dataPath);

      for (const systemSlug of systems) {
        const systemId = this.SLUG_TO_ID[systemSlug];
        if (!systemId) continue;

        const systemPath = path.join(this.dataPath, systemSlug);
        const versions = await fs.readdir(systemPath);

        for (const version of versions) {
          const versionPath = path.join(systemPath, version);
          if (!(await fs.stat(versionPath)).isDirectory()) continue;

          const files = await fs.readdir(versionPath);
          for (const file of files) {
            if (!file.endsWith(".json")) continue;

            try {
              const filePath = path.join(versionPath, file);
              const data = (await fs.readJson(filePath)) as ArmyBook;
              if (data && data.uid) {
                this.armies.push({
                  ...data,
                  systemContextId: systemId,
                });
              }
            } catch (e: unknown) {
              const msg = e instanceof Error ? e.message : String(e);
              console.error(`Failed to parse ${file}:`, msg);
            }
          }
        }
      }

      console.log(
        `Loaded ${this.armies.length} army books across all systems.`,
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Failed to load armies:", message);
    }
  }

  findAll(gameSystemId?: number) {
    let filtered = this.armies;
    if (gameSystemId) {
      filtered = this.armies.filter((a) => a.systemContextId === gameSystemId);
    }
    return filtered.map((a) => ({
      uid: a.uid,
      name: a.name,
      genericName: a.genericName,
      unitsCount: a.units?.length || 0,
      enabledGameSystems: a.enabledGameSystems,
      systemId: a.systemContextId,
    }));
  }

  findOne(id: string, gameSystemId?: number): ArmyBook | undefined {
    if (gameSystemId) {
      return this.armies.find(
        (a) => a.uid === id && a.systemContextId === gameSystemId,
      );
    }
    return this.armies.find((a) => a.uid === id);
  }

  queryUnits(
    armyId: string,
    constraints: { minCost?: number; maxCost?: number; quality?: number },
  ): Unit[] | null {
    const army = this.findOne(armyId);
    if (!army) return null;

    let units = army.units || [];

    if (constraints.minCost !== undefined) {
      units = units.filter((u) => u.cost >= (constraints.minCost as number));
    }
    if (constraints.maxCost !== undefined) {
      units = units.filter((u) => u.cost <= (constraints.maxCost as number));
    }
    if (constraints.quality !== undefined) {
      units = units.filter((u) => u.quality === constraints.quality);
    }

    return units;
  }
}
