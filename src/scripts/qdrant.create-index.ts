import "dotenv/config";
import { QdrantClient } from "@qdrant/js-client-rest";

async function run() {
  const client = new QdrantClient({
    url: process.env.QDRANT_URL!,
    apiKey: process.env.QDRANT_API_KEY || undefined,
  });

  const collection = process.env.QDRANT_DOC_COLLECTION || "restaurant_docs";

  console.log("🔧 Create payload index for 'source' in", collection);

  await client.createPayloadIndex(collection as any, {
    field_name: "source",
    field_schema: "keyword", // hoặc { type: "keyword" } tùy version
  } as any);

  console.log("✅ Done");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
