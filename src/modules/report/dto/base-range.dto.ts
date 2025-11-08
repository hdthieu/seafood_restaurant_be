import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsDateString, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { Channel } from 'src/common/enums';



export class BaseRangeDto {
    @ApiPropertyOptional() 
    @IsOptional() 
    @IsDateString() 
    dateFrom?: string;
    
    @ApiPropertyOptional() 
    @IsOptional() 
    @IsDateString() 
    dateTo?: string;
    

    // @ApiPropertyOptional({ enum: Channel }) 
    // @IsOptional() 
    // @IsEnum(Channel) 
    // channel?: Channel;

    @ApiPropertyOptional() 
    @IsOptional() 
    @IsUUID() 
    areaId?: string;

    @ApiPropertyOptional() 
    @IsOptional() 
    @IsUUID() 
    tableId?: string;

    // @ApiPropertyOptional() 
    // @IsOptional() 
    // @IsUUID() 
    // receiverId?: string;  // người nhận đơn

    // @ApiPropertyOptional() 
    // @IsOptional() 
    // @IsUUID() 
    // creatorId?: string;   // người tạo
    
    // @ApiPropertyOptional()
    // @IsOptional()
    // @Transform(({ value }) => value === true || value === 'true')
    // includeCancelled?: boolean;
}
