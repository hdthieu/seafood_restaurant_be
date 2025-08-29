import { Test, TestingModule } from '@nestjs/testing';
import { OrderstatushistoryController } from './orderstatushistory.controller';
import { OrderstatushistoryService } from './orderstatushistory.service';

describe('OrderstatushistoryController', () => {
  let controller: OrderstatushistoryController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrderstatushistoryController],
      providers: [OrderstatushistoryService],
    }).compile();

    controller = module.get<OrderstatushistoryController>(OrderstatushistoryController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
