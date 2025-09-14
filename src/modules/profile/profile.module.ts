import { Module } from '@nestjs/common';
import { ProfileService } from './profile.service';
import { ProfileController } from './profile.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../user/entities/user.entity';
import { Profile } from './entities/profile.entity';
import { ConfigS3Module } from 'src/common/AWS/config-s3/config-s3.module';

@Module({
  imports: [TypeOrmModule.forFeature([User, Profile]), ConfigS3Module],
  controllers: [ProfileController],
  providers: [ProfileService],
})
export class ProfileModule { }
