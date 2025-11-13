import { Body, Controller, Post } from "@nestjs/common";
import { AiService } from "./ai.service";
import { ChatRequestDto, ChatResponseDto } from "../ai/dto/ai.chat.dto";

@Controller("api/ai")
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Post("chat")
  async chat(@Body() body: ChatRequestDto): Promise<ChatResponseDto> {
    const res = await this.ai.chat(body.messages || [], { role: "MANAGER" });
    return res as ChatResponseDto;
  }
}
