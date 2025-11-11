// src/ai/ai.module.ts
import { Module } from "@nestjs/common";
import { AiController } from "./ai.controller";
import { AiService } from "./ai.service";
import { ToolsService } from "./tools.service";
import { TypeOrmModule } from "@nestjs/typeorm";
import {RagModule} from "../rag/rag.module";
@Module({
  imports: [
    // Đảm bảo AppModule đã gọi TypeOrmModule.forRoot(...)
    TypeOrmModule.forFeature([]), // không cần entity vì dùng ds.query
    RagModule,
  ],
  controllers: [AiController],
  providers: [AiService, ToolsService],
  exports: [AiService],
})
export class AiModule {}
