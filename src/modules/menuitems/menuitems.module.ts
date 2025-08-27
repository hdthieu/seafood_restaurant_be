import { Module } from '@nestjs/common';
import { MenuitemsService } from './menuitems.service';
import { MenuitemsController } from './menuitems.controller';

@Module({
  controllers: [MenuitemsController],
  providers: [MenuitemsService],
})
export class MenuitemsModule {}
