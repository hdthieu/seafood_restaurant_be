// src/ai/dto/chat.dto.ts
import { ApiProperty } from '@nestjs/swagger';

export class ChatMessageDto {
  @ApiProperty({ enum: ['user', 'assistant'], example: 'user' })
  role: 'user' | 'assistant';

  @ApiProperty({ example: 'Cho tôi doanh thu hôm nay theo giờ' })
  content: string;
}

export class ChatRequestDto {
  @ApiProperty({
    type: [ChatMessageDto],
    example: [
      { role: 'user', content: 'Cho tôi doanh thu hôm nay theo giờ và hóa đơn trung bình' }
    ]
  })
  messages: ChatMessageDto[];
}

export class ChatResponseDto {
  @ApiProperty({ example: 'assistant' })
  role: string;

  // Trường hợp tool: content là JSON string, name là tên tool
  @ApiProperty({ example: 'Net: 12,500,000 VND; 32 hóa đơn; Avg ticket: 390k ...' })
  content: string;

  @ApiProperty({ required: false, example: 'getSalesSummary' })
  name?: string;
}
