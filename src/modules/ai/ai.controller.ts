// src/ai/ai.controller.ts
import { Body, Controller, Post, UseGuards, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { AiService } from "./ai.service";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "@modules/core/auth/guards/roles.guard";
import { ChatRequestDto, ChatResponseDto } from "./dto/ai.chat.dto";
import {JwtAuthGuard} from "@modules/core/auth/guards/jwt-auth.guard";
@ApiTags("AI")
@ApiBearerAuth() // nếu RolesGuard yêu cầu Bearer token, bật nút Authorize trong Swagger
@Controller("ai")

@UseGuards( JwtAuthGuard,RolesGuard)
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Post("admin-chat")
  @Roles("MANAGER") // quyền hệ thống của bạn
  @ApiOperation({ summary: "Chatbot (MANAGER): hỏi tình hình/doanh thu từ invoices" })
  @ApiBody({ type: ChatRequestDto })
  @ApiOkResponse({ type: ChatResponseDto })
  async adminChat(@Req() req, @Body() body: ChatRequestDto) {
    const messages = Array.isArray(body?.messages) ? body.messages : [];
    // Nếu bạn muốn thống nhất tên role, đổi "ADMIN" thành "MANAGER" và chỉnh prompt trong AiService
    return this.ai.chat(messages, { role: "MANAGER" });
  }
}
