import {
  Controller,
  Get,
  Param,
  Query,
  NotFoundException,
} from "@nestjs/common";
import { ArmiesService } from "./armies.service";

@Controller("armies")
export class ArmiesController {
  constructor(private readonly armiesService: ArmiesService) {}

  @Get()
  findAll(@Query("gameSystem") gameSystem?: string) {
    return this.armiesService.findAll(
      gameSystem ? parseInt(gameSystem) : undefined,
    );
  }

  @Get(":id")
  findOne(@Param("id") id: string, @Query("gameSystem") gameSystem?: string) {
    const army = this.armiesService.findOne(
      id,
      gameSystem ? parseInt(gameSystem) : undefined,
    );
    if (!army) {
      throw new NotFoundException(`Army with ID ${id} not found`);
    }
    return army;
  }

  @Get(":id/units")
  findUnits(
    @Param("id") id: string,
    @Query("minCost") minCost?: string,
    @Query("maxCost") maxCost?: string,
    @Query("quality") quality?: string,
  ) {
    const units = this.armiesService.queryUnits(id, {
      minCost: minCost ? parseInt(minCost) : undefined,
      maxCost: maxCost ? parseInt(maxCost) : undefined,
      quality: quality ? parseInt(quality) : undefined,
    });

    if (!units) {
      throw new NotFoundException(`Army with ID ${id} not found`);
    }

    return units;
  }
}
