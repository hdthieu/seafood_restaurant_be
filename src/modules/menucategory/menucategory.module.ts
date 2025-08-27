import { Module } from '@nestjs/common';
import { MenucategoryService } from './menucategory.service';
import { MenucategoryController } from './menucategory.controller';

@Module({
  controllers: [MenucategoryController],
  providers: [MenucategoryService],
})
export class MenucategoryModule {}
