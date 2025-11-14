import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class UiMessageDto {
  @ApiProperty({ enum: ["user", "assistant"] })
  role!: "user" | "assistant";

  @ApiProperty()
  content!: string;
}

export class ChatRequestDto {
  @ApiProperty({ type: [UiMessageDto] })
  messages!: UiMessageDto[];
}

export class ChatResponseDto {
  @ApiProperty({ enum: ["assistant", "user"] })
  role!: "assistant" | "user";

  @ApiProperty()
  content!: string;

  // Cho phép trả về SmartSQL ({ rows, sql }) hoặc Sales payload ({ by, series, kpi }) hoặc RAG ({ sources })
  @ApiPropertyOptional({
    type: "object",
    additionalProperties: true,
    description:
      "Kết quả mở rộng: { rows, sql } | { by, series, kpi } | { sources }. Tùy theo route Smart-SQL / RAG / Chat.",
  })
  data?: any;
}
