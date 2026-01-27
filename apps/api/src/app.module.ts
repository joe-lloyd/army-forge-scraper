import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ArmiesModule } from './armies/armies.module';

@Module({
  imports: [ArmiesModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
