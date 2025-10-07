import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { User } from './entities/user.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Profile } from '../profile/entities/profile.entity';
import {ShiftService} from "./shift.service";
import {ShiftController} from "./shift.controller";
import {Shift} from "./entities/shift.entity";
import {WorkSchedule} from "./entities/work-schedule.entity";
import {WorkScheduleService} from "./work-schedule.service";
import {WorkScheduleController} from "./work-schedule.controller";
@Module({
  imports: [TypeOrmModule.forFeature([User, Profile, Shift, WorkSchedule])],
  controllers: [UserController, ShiftController, WorkScheduleController],
  providers: [UserService, ShiftService, WorkScheduleService],
  exports: [UserService],
})
export class UserModule { }
