// src/modules/branch/branch.controller.ts
import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { BranchService } from '../services/branch.service';



@ApiTags('branches')
@Controller('branches')
export class BranchController {
  constructor(private readonly svc: BranchService) {}

  // @Get('default')
  // getDefault() {
  //   return this.svc.getDefault();
  // }
}
