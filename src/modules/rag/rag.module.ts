import { Module } from "@nestjs/common";
import { RagService } from "./rag.service";
import { LlmModule } from "@modules/ai/llm.module";
@Module({
  imports: [LlmModule],
  providers: [RagService],
  exports: [RagService],
})
export class RagModule {}
