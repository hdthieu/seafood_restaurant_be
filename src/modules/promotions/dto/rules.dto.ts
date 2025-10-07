import { ApiPropertyOptional } from '@nestjs/swagger';

export class PromotionRulesDto {
    @ApiPropertyOptional({ example: false })
    birthdayOnly?: boolean;

    @ApiPropertyOptional({ example: [5, 6], description: 'Thứ trong tuần (0=CN ... 6=T7)' })
    daysOfWeek?: number[];

    @ApiPropertyOptional({
        example: [{ start: '15:00', end: '17:00' }],
        description: 'Các khung giờ áp dụng (HH:mm)',
    })
    timeWindows?: { start: string; end: string }[];
}