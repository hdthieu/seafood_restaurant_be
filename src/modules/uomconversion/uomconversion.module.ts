import { Module } from '@nestjs/common';
import { UomconversionService } from './uomconversion.service';
import { UomconversionController } from './uomconversion.controller';
import { UomConversion } from './entities/uomconversion.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UnitsOfMeasure } from '@modules/units-of-measure/entities/units-of-measure.entity';

@Module({
  imports: [TypeOrmModule.forFeature([UomConversion, UnitsOfMeasure])],
  controllers: [UomconversionController],
  providers: [UomconversionService],
})
export class UomconversionModule { }
