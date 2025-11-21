import { Module } from '@nestjs/common';
import { RekogService } from './rekog.service';
import { FaceController } from './face.controller';
import {Global} from "@nestjs/common";
import {FaceSnapshot} from "./dto/face-snapshot.entity";
import {TypeOrmModule} from "@nestjs/typeorm";
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([FaceSnapshot])],
  controllers: [FaceController],
  providers: [RekogService],
  exports: [RekogService],
})
export class FaceModule {}
