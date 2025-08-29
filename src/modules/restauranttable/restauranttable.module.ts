import { Module } from '@nestjs/common';
import { RestaurantTablesService } from './restauranttable.service';
import { RestauranttableController } from './restauranttable.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RestaurantTable } from './entities/restauranttable.entity';
import { Area } from '../area/entities/area.entity';

@Module({
  imports: [TypeOrmModule.forFeature([RestaurantTable, Area])],
  controllers: [RestauranttableController],
  providers: [RestaurantTablesService],
})
export class RestauranttableModule {}
