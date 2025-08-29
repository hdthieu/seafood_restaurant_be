import { Test, TestingModule } from '@nestjs/testing';
import { OrderstatushistoryService } from './orderstatushistory.service';

describe('OrderstatushistoryService', () => {
  let service: OrderstatushistoryService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [OrderstatushistoryService],
    }).compile();

    service = module.get<OrderstatushistoryService>(OrderstatushistoryService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
