import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateCashOtherPartyDto {
    @ApiProperty({ description: 'Name of the Cash Other Party', maxLength: 255 })
    @IsString()
    @MaxLength(255)
    name: string;

    @ApiPropertyOptional({ description: 'Phone number of the Cash Other Party', nullable: true })
    @IsOptional()
    phone?: string | null;

    @ApiPropertyOptional({ description: 'Address of the Cash Other Party', maxLength: 255, nullable: true })
    @IsOptional()
    @IsString()
    @MaxLength(255)
    address?: string | null;

    @ApiPropertyOptional({ description: 'Ward of the Cash Other Party', maxLength: 100, nullable: true })
    @IsOptional()
    @IsString()
    @MaxLength(100)
    ward?: string | null;

    @ApiPropertyOptional({ description: 'District of the Cash Other Party', maxLength: 100, nullable: true })
    @IsOptional()
    @IsString()
    @MaxLength(100)
    district?: string | null;

    @ApiPropertyOptional({ description: 'Province of the Cash Other Party', maxLength: 100, nullable: true })
    @IsOptional()
    @IsString()
    @MaxLength(100)
    province?: string | null;

    @ApiPropertyOptional({ description: 'Additional notes', nullable: true })
    @IsOptional()
    @IsString()
    note?: string | null;
}