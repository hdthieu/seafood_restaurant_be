import { Module } from '@nestjs/common';
import { MenuitemingredientService } from './menuitemingredient.service';
import { MenuitemingredientController } from './menuitemingredient.controller';

@Module({
  controllers: [MenuitemingredientController],
  providers: [MenuitemingredientService],
})
export class MenuitemingredientModule {}
