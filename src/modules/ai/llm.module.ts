import { Global, Module } from "@nestjs/common";
import { LlmGateway } from "./llm.gateway";

@Global() // 👈 giúp provider khả dụng toàn app, không cần import ở mọi module
@Module({
  providers: [LlmGateway],
  exports: [LlmGateway],
})
export class LlmModule {}
