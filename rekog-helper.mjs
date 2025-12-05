// rekog-helper.mjs
import {
  RekognitionClient,
  DescribeCollectionCommand,
  IndexFacesCommand,
  SearchFacesByImageCommand,
  DetectFacesCommand,
  ListFacesCommand,
  DeleteFacesCommand,
} from "@aws-sdk/client-rekognition";

const region = process.env.AWS_REGION || "ap-southeast-1";
const collectionId = process.env.REKOG_COLLECTION_ID || "";

const client = new RekognitionClient({ region });

function cleanBase64(b64 = "") {
  return b64.replace(/^data:image\/\w+;base64,/, "");
}

/* ============================================================
   HEALTH
   ============================================================ */
async function handleHealth() {
  try {
    const res = await client.send(
      new DescribeCollectionCommand({ CollectionId: collectionId })
    );

    console.error(
      "[AWS][HEALTH]",
      JSON.stringify(
        {
          http: res.$metadata?.httpStatusCode,
          faces: res.FaceCount,
          model: res.FaceModelVersion,
        },
        null,
        2
      )
    );

    return {
      ok: true,
      faces: res.FaceCount ?? 0,
      arn: res.CollectionARN,
    };
  } catch (e) {
    console.error("[AWS][HEALTH][ERROR]", e.message);
    return { ok: false, error: e.message };
  }
}

/* ============================================================
   ENROLL
   ============================================================ */
async function handleEnroll(payload) {
  const { userId, imageBase64 } = payload || {};
  const bytes = Buffer.from(cleanBase64(imageBase64), "base64");

  const res = await client.send(
    new IndexFacesCommand({
      CollectionId: collectionId,
      Image: { Bytes: bytes },
      ExternalImageId: userId,
      MaxFaces: 1,
      QualityFilter: "AUTO",
    })
  );

  const faces = (res.FaceRecords || []).map((fr) => ({
    faceId: fr.Face?.FaceId,
    confidence: fr.Face?.Confidence,
  }));

  console.error(
    "[AWS][ENROLL]",
    JSON.stringify(
      {
        userId,
        faces,
        unindexed: (res.UnindexedFaces || []).length,
      },
      null,
      2
    )
  );

  return { ok: faces.length > 0, faces };
}

/* ============================================================
   VERIFY
   ============================================================ */
async function handleVerify(payload) {
  const { userId, imageBase64, awsMin = 70 } = payload || {};
  const bytes = Buffer.from(cleanBase64(imageBase64), "base64");

  const res = await client.send(
    new SearchFacesByImageCommand({
      CollectionId: collectionId,
      Image: { Bytes: bytes },
      FaceMatchThreshold: awsMin,
      MaxFaces: 5,
    })
  );

  const matches = (res.FaceMatches || []).map((m) => ({
    similarity: m.Similarity,
    faceId: m.Face?.FaceId,
    externalId: m.Face?.ExternalImageId,
  }));

  console.error(
    "[AWS][VERIFY]",
    JSON.stringify(
      {
        userId,
        awsMin,
        matches,
      },
      null,
      2
    )
  );

  return { matches: res.FaceMatches ?? [] };
}

/* ============================================================
   DETECT ATTRIBUTES
   ============================================================ */
async function handleDetect(payload) {
  const bytes = Buffer.from(cleanBase64(payload.imageBase64), "base64");

  const res = await client.send(
    new DetectFacesCommand({
      Image: { Bytes: bytes },
      Attributes: ["ALL"],
    })
  );

  console.error(
    "[AWS][DETECT]",
    JSON.stringify(
      {
        detected: res.FaceDetails?.length ?? 0,
      },
      null,
      2
    )
  );

  return { details: res.FaceDetails ?? [] };
}

/* ============================================================
   COUNT USER FACES
   ============================================================ */
async function handleCountForUser(payload) {
  const { userId } = payload;

  let nextToken;
  let count = 0;

  do {
    const r = await client.send(
      new ListFacesCommand({
        CollectionId: collectionId,
        NextToken: nextToken,
      })
    );

    count += (r.Faces || []).filter(
      (f) => f.ExternalImageId === userId
    ).length;

    nextToken = r.NextToken;
  } while (nextToken);

  console.error(
    "[AWS][COUNT]",
    JSON.stringify({ userId, count }, null, 2)
  );

  return { ok: true, count };
}

/* ============================================================
   DELETE ALL FACES OF USER
   ============================================================ */
async function handleDeleteAllForUser(payload) {
  const { userId } = payload;
  let nextToken;
  const faceIds = [];

  do {
    const r = await client.send(
      new ListFacesCommand({
        CollectionId: collectionId,
        NextToken: nextToken,
      })
    );

    for (const f of r.Faces || []) {
      if (f.ExternalImageId === userId) {
        faceIds.push(f.FaceId);
      }
    }

    nextToken = r.NextToken;
  } while (nextToken);

  if (!faceIds.length) {
    console.error("[AWS][DELETE_ALL] none");
    return { ok: true, deleted: 0 };
  }

  const delRes = await client.send(
    new DeleteFacesCommand({
      CollectionId: collectionId,
      FaceIds: faceIds,
    })
  );

  console.error(
    "[AWS][DELETE_ALL]",
    JSON.stringify({ userId, deleted: delRes.DeletedFaces?.length }, null, 2)
  );

  return { ok: true, deleted: delRes.DeletedFaces?.length ?? 0 };
}

/* ============================================================
   MAIN PROCESS
   ============================================================ */
let input = "";
process.stdin.on("data", (d) => (input += d));
process.stdin.on("end", async () => {
  try {
    const { cmd, payload } = JSON.parse(input || "{}");
    let result;

    if (cmd === "health") result = await handleHealth();
    else if (cmd === "enroll") result = await handleEnroll(payload);
    else if (cmd === "verify") result = await handleVerify(payload);
    else if (cmd === "detect") result = await handleDetect(payload);
    else if (cmd === "countForUser") result = await handleCountForUser(payload);
    else if (cmd === "deleteAllForUser") result = await handleDeleteAllForUser(payload);
    else throw new Error("UNKNOWN_CMD: " + cmd);

    process.stdout.write(JSON.stringify(result || {}));
    process.exit(0);
  } catch (e) {
    console.error("[HELPER][ERROR]", e.message);
    process.exit(1);
  }
});
