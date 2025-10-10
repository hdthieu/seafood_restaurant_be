import { Module } from '@nestjs/common';
import { RekogService } from './rekog.service';
import { FaceController } from './face.controller';
import {Global} from "@nestjs/common";
@Global()
@Module({
  controllers: [FaceController],
  providers: [RekogService],
  exports: [RekogService],
})
export class FaceModule {}
