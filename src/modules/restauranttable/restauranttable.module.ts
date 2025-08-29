import { Module } from '@nestjs/common';
import { RestauranttableService } from './restauranttable.service';
import { RestauranttableController } from './restauranttable.controller';

@Module({
  controllers: [RestauranttableController],
  providers: [RestauranttableService],
})
export class RestauranttableModule {}
