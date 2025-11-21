import "dotenv/config";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module";
import { RagService } from "../modules/rag/rag.service";

async function run() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["log", "warn", "error"],
  });

  const rag = app.get(RagService);

  // Lấy câu hỏi từ command line
  const question =
    process.argv.slice(2).join(" ") || "quy trình chế biến món cho bếp";

  console.log("❓ Question:", question);

  // Query Qdrant
  const hits = await rag.query(question, 32);

  if (!hits.length) {
    console.log("⚠️ Không có hit nào từ Qdrant.");
  } else {
    hits.forEach((h, i) => {
      console.log("\n==============================");
      console.log(
        "#",
        i + 1,
        "score=",
        h.score?.toFixed(3),
        "source=",
        h.source,
        "idx=",
        h.index
      );
      console.log("--------------------------------");
      console.log(h.text.slice(0, 500)); // in 500 ký tự đầu cho dễ đọc
    });
  }

  await app.close();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
