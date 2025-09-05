import { Test, TestingModule } from '@nestjs/testing';
import { ConfigS3Service } from './config-s3.service';

describe('ConfigS3Service', () => {
  let service: ConfigS3Service;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ConfigS3Service],
    }).compile();

    service = module.get<ConfigS3Service>(ConfigS3Service);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
