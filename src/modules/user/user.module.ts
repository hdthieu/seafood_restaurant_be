import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { User } from './entities/user.entity';
import { Profile } from '../profile/entities/profile.entity';
import { Shift } from './entities/shift.entity';
import { WorkSchedule } from './entities/work-schedule.entity';
import { Attendance } from './entities/attendance';
import { GeoRule } from './entities/geo-rules.entity';
import { NetRule } from './entities/net-rules.entity';
import { Branch } from './entities/branch.entity';

import { UserService } from './user.service';
import { ShiftService } from './services/shift.service';
import { WorkScheduleService } from './work-schedule.service';
import { AttendanceService } from './services/attendance.service';
import { MobileAttendanceService } from './mobile-attendance.service';
import { RulesService } from './services/rules.service';
import { BranchService } from './services/branch.service';

import { UserController } from './user.controller';
import { ShiftController } from './shift.controller';
import { WorkScheduleController } from './work-schedule.controller';
import { AttendanceController } from './attendance.controller';
import { MobileAttendanceController } from './mobile-attendance.controller';
import { RulesController } from './controllers/rules.controller';
// (nếu có) import { BranchController } from './controllers/branch.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User, Profile, Shift, WorkSchedule, Attendance, GeoRule, NetRule, Branch,
    ]),
  ],
  controllers: [
    UserController,
    ShiftController,
    WorkScheduleController,
    AttendanceController,
    MobileAttendanceController,
    RulesController,
    // BranchController,
  ],
  providers: [
    UserService,
    ShiftService,
    WorkScheduleService,
    AttendanceService,
    MobileAttendanceService,
    RulesService,
    BranchService,               // ← THÊM VÀO ĐÂY
  ],
  exports: [
    UserService,
    ShiftService,
    WorkScheduleService,
    AttendanceService,
    MobileAttendanceService,
    RulesService,
    BranchService,               // (có thể export nếu module khác dùng)
  ],
})
export class UserModule {}
