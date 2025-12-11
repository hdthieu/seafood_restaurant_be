// src/modules/ai/ai.controller.ts
import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { AiService } from "./ai.service";
import { ChatRequestDto, ChatResponseDto } from "../ai/dto/ai.chat.dto";
import { JwtAuthGuard } from "@modules/core/auth/guards/jwt-auth.guard";

@UseGuards(JwtAuthGuard)
@Controller("api/ai")
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Post("chat")
  async chat(@Body() body: ChatRequestDto): Promise<ChatResponseDto> {
    // ✅ Chỉ cần messages, ai có JWT là dùng được, không phân role
    const res = await this.ai.chat(body.messages || []);
    return res as ChatResponseDto;
  }
}
