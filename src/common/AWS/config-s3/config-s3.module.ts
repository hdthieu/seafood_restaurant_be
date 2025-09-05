import { Module } from '@nestjs/common';
import { ConfigS3Service } from './config-s3.service';

@Module({
  providers: [ConfigS3Service],
  exports: [ConfigS3Service],
})
export class ConfigS3Module { }
