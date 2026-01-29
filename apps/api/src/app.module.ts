import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { DataModule } from "./data/data.module";
import { ArmiesModule } from "./armies/armies.module";

@Module({
  imports: [DataModule, ArmiesModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
