import { Module } from '@nestjs/common';
import { UomconversionService } from './uomconversion.service';
import { UomconversionController } from './uomconversion.controller';
import { UomConversion } from './entities/uomconversion.entity';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  imports: [TypeOrmModule.forFeature([UomConversion])],
  controllers: [UomconversionController],
  providers: [UomconversionService],
})
export class UomconversionModule {}
