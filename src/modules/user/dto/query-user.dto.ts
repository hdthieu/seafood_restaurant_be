// dto/query-user.dto.ts
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

import { ApiPropertyOptional } from '@nestjs/swagger';

export class QueryUserDto {
    @ApiPropertyOptional({ description: 'Search keyword', example: 'John' })
    @IsOptional()
    q?: string;

    @ApiPropertyOptional({ description: 'Page number', example: 1, minimum: 1 })
    @IsOptional()
    @Transform(({ value }) => parseInt(value, 10))
    @IsInt()
    @Min(1)
    page: number = 1;

    @ApiPropertyOptional({ description: 'Number of items per page', example: 10, minimum: 1 })
    @IsOptional()
    @Transform(({ value }) => parseInt(value, 10))
    @IsInt()
    @Min(1)
    limit: number = 10;
}
