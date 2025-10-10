// src/modules/face/service/rekog.service.ts
import { Injectable, Logger } from '@nestjs/common';
import {
  RekognitionClient,
  DescribeCollectionCommand,
  IndexFacesCommand,
  SearchFacesByImageCommand,
    ListFacesCommand,        // <—
  DeleteFacesCommand,      // <—
  DetectFacesCommand, 
} from '@aws-sdk/client-rekognition';
import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts';
type FaceAttrsOk = {
  ok: true;
  pose: { yaw: number; pitch: number; roll: number };
  eyesOpen: { left: boolean; conf: number };
  quality?: { brightness?: number; sharpness?: number };
};

type FaceAttrsErr =
  | { ok: false; reason: 'NO_FACE' }
  | { ok: false; reason: 'IMAGE_TOO_LARGE' };

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
    // nếu đang dùng ENV chuẩn (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_SESSION_TOKEN)
    // thì không cần truyền credentials ở đây.
  });

  private readonly sts = new STSClient({ region: this.region });

  constructor() {
    // Log cấu hình “an toàn”
    this.logger.log(
      `Init Rekog: region=${this.region}, collection=${this.collectionId || '(empty)'}`,
    );
    this.logger.log(
      `ENV: AKID(*${this.accessKeyLast4 || '????'}), SECRET(*${this.secretKeyLast4 || '????'}), TOKEN=${this.sessionTokenSet}`,
    );

    if (!this.collectionId) {
      this.logger.error('REKOG_COLLECTION_ID is empty! Hãy đặt trong .env');
    }
  }

  /** Dùng để gọi nhanh kiểm tra cấu hình */
  async health() {
    // 1) Ai đang ký request?
    try {
      const who = await this.sts.send(new GetCallerIdentityCommand({}));
      this.logger.log(`STS: Account=${who.Account}, Arn=${who.Arn}`);
    } catch (e: any) {
      this.logger.error('STS GetCallerIdentity FAILED', this.prettyErr(e));
    }

    // 2) Collection có tồn tại/đúng region không?
    try {
      const d = await this.client.send(
        new DescribeCollectionCommand({ CollectionId: this.collectionId }),
      );
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
    // gom các field hay gặp để đọc log dễ
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
      await this.client.send(
        new DescribeCollectionCommand({ CollectionId: this.collectionId }),
      );
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
  async enroll(userId: string, imageBase64: string) {
    await this.ensureCollection();
    const img = Buffer.from(imageBase64, 'base64');

    const r = await this.client.send(
      new IndexFacesCommand({
        CollectionId: this.collectionId,
        Image: { Bytes: img },
        ExternalImageId: userId,
        QualityFilter: 'AUTO',
        DetectionAttributes: [],
      }),
    );

    const ok = (r.FaceRecords?.length ?? 0) > 0;
    this.logger.log(
      `Enroll user=${userId} → faces=${r.FaceRecords?.length ?? 0}`,
    );

    return {
      ok,
      faces: (r.FaceRecords ?? []).map((fr) => ({
        faceId: fr.Face?.FaceId,
        confidence: fr.Face?.Confidence,
      })),
    };
  }

  /** Verify: so khớp selfie hiện tại với mẫu đã enroll của userId */
  async verify(userId: string, imageBase64: string, threshold = 90) {
  await this.ensureCollection();

  // vệ sinh b64 (loại bỏ data URL prefix nếu có)
  const b64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');
  const buf = Buffer.from(b64, 'base64');

  try {
    const r = await this.client.send(new SearchFacesByImageCommand({
      CollectionId: this.collectionId,
      Image: { Bytes: buf },
      FaceMatchThreshold: threshold,
      MaxFaces: 5,
    }));

    const matches = (r.FaceMatches ?? []).map(m => ({
      similarity: m.Similarity ?? 0,
      externalId: m.Face?.ExternalImageId,
      faceId: m.Face?.FaceId,
    }));

    const top = matches.sort((a,b)=>b.similarity-a.similarity)[0];
    const ok = !!top && top.externalId === userId && top.similarity >= threshold;

    return { ok, top, matches, reason: ok ? 'PASS' : 'NO_MATCH' as const };
  } catch (e: any) {
    if (e?.name === 'InvalidParameterException'
        && /no faces in the image/i.test(e?.message ?? '')) {
      // Ảnh hợp lệ nhưng không chứa khuôn mặt
      return { ok: false, top: undefined, matches: [], reason: 'NO_FACE' as const };
    }
    if (e?.name === 'ImageTooLargeException') {
      return { ok: false, reason: 'IMAGE_TOO_LARGE' as const };
    }
    this.logger.error('SearchFacesByImage failed', e);
    throw e; // để global filter trả 500 nếu là lỗi khác
  }
}
 /** Đếm số mẫu hiện có của user (lọc theo ExternalImageId) */
  async enrollStatus(userId: string) {
    await this.ensureCollection();
    let nextToken: string | undefined;
    let count = 0;
    do {
      const r = await this.client.send(new ListFacesCommand({
        CollectionId: this.collectionId,
        NextToken: nextToken,
        MaxResults: 1000,
      }));
      count += (r.Faces ?? []).filter(f => f.ExternalImageId === userId).length;
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
      const r = await this.client.send(new ListFacesCommand({
        CollectionId: this.collectionId,
        NextToken: nextToken,
        MaxResults: 1000,
      }));
      for (const f of (r.Faces ?? [])) {
        if (f.ExternalImageId === userId && f.FaceId) ids.push(f.FaceId);
      }
      nextToken = r.NextToken;
    } while (nextToken);
    if (ids.length === 0) return { deleted: 0 };
    const d = await this.client.send(new DeleteFacesCommand({
      CollectionId: this.collectionId,
      FaceIds: ids,
    }));
    return { deleted: d?.DeletedFaces?.length ?? 0 };
  }

  /** Liveness “nhẹ”: đọc pose/eyes để chống ảnh tĩnh (fallback khi chưa dùng Liveness SDK) */
  
  async detectAttrs(imageBase64: string): Promise<FaceAttrs> {
  await this.ensureCollection();
  const b64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');
  const buf = Buffer.from(b64, 'base64');

  const r = await this.client.send(new DetectFacesCommand({
    Image: { Bytes: buf },
    Attributes: ['ALL'],
  }));

  const f = (r.FaceDetails ?? [])[0];
  if (!f) return { ok: false, reason: 'NO_FACE' };

  const q = f.Quality; // <-- Quality nằm ở đây
  return {
    ok: true,
    pose: {
      yaw: f.Pose?.Yaw ?? 0,
      pitch: f.Pose?.Pitch ?? 0,
      roll: f.Pose?.Roll ?? 0,
    },
    eyesOpen: {
      left: f.EyesOpen?.Value ?? false,
      conf: f.EyesOpen?.Confidence ?? 0,
    },
    quality: {
      brightness: q?.Brightness,  // <-- Đúng chỗ
      sharpness: q?.Sharpness,    // <-- Đúng chỗ
    },
  };
  }
}
