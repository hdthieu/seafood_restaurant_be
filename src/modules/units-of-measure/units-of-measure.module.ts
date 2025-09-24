import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UnitsOfMeasure } from './entities/units-of-measure.entity';
import { UnitsOfMeasureService } from './units-of-measure.service';
import { UnitsOfMeasureController } from './units-of-measure.controller';

@Module({
  imports: [TypeOrmModule.forFeature([UnitsOfMeasure])],
  controllers: [UnitsOfMeasureController],
  providers: [UnitsOfMeasureService],
  // exports: [TypeOrmModule],
})
export class UnitsOfMeasureModule { }