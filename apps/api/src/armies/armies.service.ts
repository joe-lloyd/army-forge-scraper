import { ArmyBook, Unit } from "@opr-api/shared";
import { Injectable, OnModuleInit } from "@nestjs/common";
import * as fs from "fs-extra";
import * as path from "path";

@Injectable()
export class ArmiesService implements OnModuleInit {
  private armies: ArmyBook[] = [];
  private readonly dataPath = path.join(
    __dirname,
    "..",
    "..",
    "..",
    "..",
    "data",
  );

  async onModuleInit() {
    await this.loadArmies();
  }

  async loadArmies() {
    try {
      if (!(await fs.pathExists(this.dataPath))) {
        console.warn(`Data path ${this.dataPath} does not exist.`);
        return;
      }

      const getJsonFiles = async (dir: string): Promise<string[]> => {
        const items = await fs.readdir(dir);
        let files: string[] = [];
        for (const item of items) {
          const res = path.resolve(dir, item);
          const stats = await fs.stat(res);
          if (stats.isDirectory()) {
            files = files.concat(await getJsonFiles(res));
          } else if (res.endsWith(".json")) {
            files.push(res);
          }
        }
        return files;
      };

      const jsonFiles = await getJsonFiles(this.dataPath);

      const loadedArmies: ArmyBook[] = [];
      for (const filePath of jsonFiles) {
        try {
          const data = (await fs.readJson(filePath)) as ArmyBook;
          if (data && data.uid) {
            loadedArmies.push(data);
          }
        } catch (e) {
          console.error(`Failed to parse ${filePath}:`, e.message);
        }
      }

      this.armies = loadedArmies;
      console.log(
        `Loaded ${this.armies.length} armies from ${jsonFiles.length} files.`,
      );
    } catch (error: any) {
      console.error("Failed to load armies:", error.message);
    }
  }

  findAll() {
    return this.armies.map((a) => ({
      uid: a.uid,
      name: a.name,
      genericName: a.genericName,
      unitsCount: a.units?.length || 0,
    }));
  }

  findOne(id: string): ArmyBook | undefined {
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
