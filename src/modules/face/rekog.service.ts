// src/modules/face/service/rekog.service.ts
import { Injectable, Logger } from '@nestjs/common';
import {
  RekognitionClient,
  DescribeCollectionCommand,
  IndexFacesCommand,
  SearchFacesByImageCommand,
  ListFacesCommand,
  DeleteFacesCommand,
  DetectFacesCommand,
} from '@aws-sdk/client-rekognition';
import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts';

/** Kiểu thống nhất cho EyesOpen */
export type EyesOpenAttr = { value: boolean; conf: number };

type FaceAttrsOk = {
  ok: true;
  pose: { yaw: number; pitch: number; roll: number };
  eyesOpen?: EyesOpenAttr; // có thể undefined nếu Rekognition không trả
  quality?: { brightness?: number; sharpness?: number };
};

type FaceAttrsErr =
  | { ok: false; reason: 'NO_FACE' }
  | { ok: false; reason: 'IMAGE_TOO_LARGE' }
  | { ok: false; reason: 'IMAGE_BAD' };

export type FaceAttrs = FaceAttrsOk | FaceAttrsErr;

@Injectable()
export class RekogService {
  private readonly logger = new Logger(RekogService.name);

  private readonly region = process.env.AWS_REGION || 'ap-southeast-1';
  private readonly collectionId = process.env.REKOG_COLLECTION_ID || '';

  // KHÔNG log full secret – chỉ log 4 ký tự cuối để kiểm tra có nạp env
  private readonly accessKeyLast4 = (process.env.AWS_ACCESS_KEY_ID || '').slice(-4);
  private readonly secretKeyLast4 = (process.env.AWS_SECRET_ACCESS_KEY || '').slice(-4);
  private readonly sessionTokenSet = !!process.env.AWS_SESSION_TOKEN;

  private readonly client = new RekognitionClient({
    region: this.region,
    // Nếu đang dùng ENV chuẩn (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_SESSION_TOKEN)
    // thì không cần truyền credentials ở đây.
  });

  private readonly sts = new STSClient({ region: this.region });

  constructor() {
    // Log cấu hình “an toàn”
    this.logger.log(`Init Rekog: region=${this.region}, collection=${this.collectionId || '(empty)'}`);
    this.logger.log(
      `ENV: AKID(*${this.accessKeyLast4 || '????'}), SECRET(*${this.secretKeyLast4 || '????'}), TOKEN=${
        this.sessionTokenSet
      }`,
    );

    if (!this.collectionId) {
      this.logger.error('REKOG_COLLECTION_ID is empty! Hãy đặt trong .env');
    }
  }

  /** Dùng để gọi nhanh kiểm tra cấu hình */
  async health() {
    try {
      const who = await this.sts.send(new GetCallerIdentityCommand({}));
      this.logger.log(`STS: Account=${who.Account}, Arn=${who.Arn}`);
    } catch (e: any) {
      this.logger.error('STS GetCallerIdentity FAILED', this.prettyErr(e));
    }

    try {
      const d = await this.client.send(new DescribeCollectionCommand({ CollectionId: this.collectionId }));
      this.logger.log(
        `DescribeCollection OK: FaceModel=${d.FaceModelVersion}, Faces=${d.FaceCount}, ARN=${d.CollectionARN}`,
      );
      return { ok: true, faces: d.FaceCount ?? 0, arn: d.CollectionARN };
    } catch (e: any) {
      this.logger.error('DescribeCollection FAILED', this.prettyErr(e));
      return { ok: false, error: this.prettyErr(e) };
    }
  }

  /* ---------- Internal helpers ---------- */

  private prettyErr(e: any) {
    return JSON.stringify(
      {
        name: e?.name,
        message: e?.message,
        type: e?.__type,
        code: e?.Code,
        http: e?.$metadata?.httpStatusCode,
        requestId: e?.$metadata?.requestId,
      },
      null,
      2,
    );
  }

  private async ensureCollection() {
    try {
      await this.client.send(new DescribeCollectionCommand({ CollectionId: this.collectionId }));
    } catch (e: any) {
      if (e?.name === 'ResourceNotFoundException') {
        this.logger.error(
          `Collection "${this.collectionId}" KHÔNG TỒN TẠI ở region ${this.region}.` +
            ` Tạo CLI: aws rekognition create-collection --region ${this.region} --collection-id ${this.collectionId}`,
        );
      } else if (e?.name === 'AccessDeniedException') {
        this.logger.error(
          'AccessDenied khi DescribeCollection → sai credential/permission/region. Xem log STS & ENV ở trên.',
        );
      } else {
        this.logger.error('DescribeCollection lỗi khác:', this.prettyErr(e));
      }
      throw e;
    }
  }

  /* ---------- Public APIs ---------- */

  /** Enroll: thêm ảnh làm mẫu cho user (nên gọi 3–5 ảnh) */
  // src/modules/face/rekog.service.ts
private toBuffer(imageBase64: string): Uint8Array {
    const clean = imageBase64.replace(/^data:image\/\w+;base64,/, '');
    return Buffer.from(clean, 'base64');
  }

  /** Enroll: thêm ảnh làm mẫu cho user (nên gọi 3–5 ảnh) */
  async enroll(userId: string, base64: string) {
    try {
      // dùng lại helper để chịu được cả base64 thuần lẫn dataURL
      const bytes = this.toBuffer(base64);

      const cmd = new IndexFacesCommand({
        CollectionId: this.collectionId,
        Image: { Bytes: bytes },
        ExternalImageId: userId,
        MaxFaces: 1,
        QualityFilter: 'AUTO',
      });

      const res = await this.client.send(cmd);

      if (!res.FaceRecords || res.FaceRecords.length === 0) {
        return { ok: false, faces: [] };
      }

      const faces = res.FaceRecords.map((f) => ({
        faceId: f.Face?.FaceId,
        confidence: f.Face?.Confidence,
      }));

      return { ok: true, faces };
    } catch (e) {
      this.logger.error('REKOG ENROLL ERR:', e as any);
      return { ok: false, faces: [] };
    }
  }

  /** Verify: so khớp selfie hiện tại với mẫu đã enroll của userId */

 
  // * So khớp khuôn mặt hiện tại với collection
  //  * Trả về:
  //  *  - ok: true/false
  //  *  - score: similarity %
  //  *  - reason:
  //  *      - NO_FACE      : AWS không detect mặt
  //  *      - NO_MATCH     : có mặt nhưng không có match nào trên collection
  //  *      - DIFF_USER    : match là userId khác
  //  *      - LOW_SCORE    : đúng user nhưng score < threshold
  //  *      - ERROR        : lỗi runtime
  //  */

async verify(
  userId: string,
  imageBase64: string,
  appThreshold = 85,    // ngưỡng chấm công của bạn
): Promise<{ ok: boolean; score: number | null; reason?: string }> {
  
   if (!imageBase64) {
    this.logger.warn('VERIFY EMPTY_IMAGE', { userId });
    return { ok: false, score: null, reason: 'IMAGE_EMPTY' };
  }
  const awsMin = 70; // cho phép AWS trả về kết quả từ 70% trở lên

  try {
    const bytes = this.toBuffer(imageBase64);
    const cmd = new SearchFacesByImageCommand({
      CollectionId: this.collectionId,
      Image: { Bytes: bytes },
      FaceMatchThreshold: awsMin,
      MaxFaces: 5,
    });

    const res = await this.client.send(cmd);

    const matches = res.FaceMatches ?? [];
    if (!matches.length) {
      this.logger.warn('VERIFY NO_MATCH', {
        userId,
        awsMin,
        appThreshold,
      });
      return { ok: false, score: 0, reason: 'NO_MATCH' };
    }

    const best = matches[0];
    const score = best.Similarity ?? 0;
    const face = best.Face;
    const externalId = face?.ExternalImageId;

    this.logger.log({
      tag: 'VERIFY_RESULT',
      userId,
      awsMin,
      appThreshold,
      score,
      matchedExternalId: externalId,
      matchedFaceId: face?.FaceId,
    });

    if (externalId && externalId !== userId) {
      return { ok: false, score, reason: 'DIFF_USER' };
    }

    if (score < appThreshold) {
      return { ok: false, score, reason: 'LOW_SCORE' };
    }

    return { ok: true, score };
  } catch (err) {
    this.logger.error(`VERIFY ERROR user=${userId}`, {
      name: (err as any)?.name,
      message: (err as any)?.message,
    });
    return { ok: false, score: null, reason: 'ERROR' };
  }
}






  /** Đếm số mẫu hiện có của user (lọc theo ExternalImageId) */
  async enrollStatus(userId: string) {
    await this.ensureCollection();
    let nextToken: string | undefined;
    let count = 0;
    do {
      const r = await this.client.send(
        new ListFacesCommand({
          CollectionId: this.collectionId,
          NextToken: nextToken,
          MaxResults: 1000,
        }),
      );
      count += (r.Faces ?? []).filter((f) => f.ExternalImageId === userId).length;
      nextToken = r.NextToken;
    } while (nextToken);
    return { count };
  }

  /** Xoá tất cả faces của user để đăng ký lại */
  async deleteAllForUser(userId: string) {
    await this.ensureCollection();
    let nextToken: string | undefined;
    const ids: string[] = [];
    do {
      const r = await this.client.send(
        new ListFacesCommand({
          CollectionId: this.collectionId,
          NextToken: nextToken,
          MaxResults: 1000,
        }),
      );
      for (const f of r.Faces ?? []) {
        if (f.ExternalImageId === userId && f.FaceId) ids.push(f.FaceId);
      }
      nextToken = r.NextToken;
    } while (nextToken);

    if (ids.length === 0) return { deleted: 0 };

    const d = await this.client.send(
      new DeleteFacesCommand({
        CollectionId: this.collectionId,
        FaceIds: ids,
      }),
    );
    return { deleted: d?.DeletedFaces?.length ?? 0 };
  }

  /** Đọc pose/eyes/quality (dùng cho liveness nhẹ) */
  async detectAttrs(imageBase64: string): Promise<FaceAttrs> {
    await this.ensureCollection();

    const b64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');
    const buf = Buffer.from(b64, 'base64');

    try {
      const r = await this.client.send(
        new DetectFacesCommand({
          Image: { Bytes: buf },
          Attributes: ['ALL'],
        }),
      );

      const f = r.FaceDetails?.[0];
      if (!f) return { ok: false, reason: 'NO_FACE' };

      const eyesOpen =
        typeof f.EyesOpen?.Value === 'boolean'
          ? { value: !!f.EyesOpen.Value, conf: f.EyesOpen.Confidence ?? 0 }
          : undefined;

      return {
        ok: true,
        pose: {
          yaw: f.Pose?.Yaw ?? 0,
          pitch: f.Pose?.Pitch ?? 0,
          roll: f.Pose?.Roll ?? 0,
        },
        eyesOpen,
        quality: {
          brightness: f.Quality?.Brightness,
          sharpness: f.Quality?.Sharpness,
        },
      };
    } catch (e) {
      this.logger.error('DetectFaces failed', e as any);
      return { ok: false, reason: 'IMAGE_BAD' };
    }
  }



    /** Xoá các face cụ thể theo FaceId (dùng khi xoá 1 snapshot lẻ) */
  async deleteByFaceIds(faceIds: string[]) {
    if (!faceIds.length) return { deleted: 0 };

    await this.ensureCollection();

    const d = await this.client.send(
      new DeleteFacesCommand({
        CollectionId: this.collectionId,
        FaceIds: faceIds,
      }),
    );

    return { deleted: d?.DeletedFaces?.length ?? 0 };
  }

}
