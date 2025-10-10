import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsEnum, IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { AudienceScope } from 'src/common/enums';

export class AudienceRulesDto {
    @ApiPropertyOptional({ enum: AudienceScope, description: 'ALL | POINTS | BIRTHDAY | COMPANY | NEW' })
    @IsOptional()
    @IsEnum(AudienceScope)
    scope?: AudienceScope;

    @ApiPropertyOptional({ description: 'Ngưỡng điểm khi scope=POINTS' })
    @IsOptional()
    @IsInt()
    @Min(0)
    pointsMin?: number;

    @ApiPropertyOptional({ description: 'true=áp theo THÁNG sinh nhật; false=đúng NGÀY' })
    @IsOptional()
    @IsBoolean()
    birthdayMonth?: boolean;

    @ApiPropertyOptional({ type: [Number], description: 'Các thứ trong tuần áp dụng (0=CN..6=T7)' })
    @IsOptional()
    @IsArray()
    daysOfWeek?: number[];

    @ApiPropertyOptional({ description: 'HH:mm' })
    @IsOptional()
    @IsString()
    startTime?: string | null;

    @ApiPropertyOptional({ description: 'HH:mm' })
    @IsOptional()
    @IsString()
    endTime?: string | null;

    @ApiPropertyOptional()
    @IsOptional()
    @IsInt()
    @Min(1)
    guestCountMin?: number;

    @ApiPropertyOptional()
    @IsOptional()
    @IsInt()
    @Min(1)
    guestCountMax?: number | null;
}

