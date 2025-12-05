// src/modules/face/rekog.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'child_process';

export type EyesOpenAttr = { value: boolean; conf: number };
type FaceAttrsOk = {
  ok: true;
  pose: { yaw: number; pitch: number; roll: number };
  eyesOpen?: EyesOpenAttr;
  quality?: { brightness?: number; sharpness?: number };
};
type FaceAttrsErr =
  | { ok: false; reason: 'NO_FACE' }
  | { ok: false; reason: 'IMAGE_TOO_LARGE' }
  | { ok: false; reason: 'IMAGE_BAD' };
export type FaceAttrs = FaceAttrsOk | FaceAttrsErr;

@Injectable()
export class RekogService {
  private readonly logger = new Logger('Rekog');

  constructor() {
    this.logger.log('RekogService ready.');
  }

  /** Mini helper – không log raw output để tránh rác */
  private runHelper<T = any>(cmd: string, payload?: any): Promise<T> {
    return new Promise((resolve, reject) => {
      const child = spawn('node', ['rekog-helper.mjs'], {
        cwd: process.cwd(),
        shell: false,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      child.stdin.write(JSON.stringify({ cmd, payload }));
      child.stdin.end();

      let out = '';
      let err = '';

      child.stdout.on('data', (d) => (out += d.toString()));
      child.stderr.on('data', (d) => (err += d.toString()));

      child.on('close', (code) => {
        if (code === 0) {
          try {
            resolve(JSON.parse(out || '{}'));
          } catch (e) {
            reject(new Error('JSON_PARSE_ERROR'));
          }
        } else {
          reject(new Error(err || out || 'HELPER_ERROR'));
        }
      });
    });
  }

  /* ================= HEALTH ================= */

  async health() {
    try {
      const r = await this.runHelper('health');
      return r;
    } catch (e) {
      this.logger.error('Health check failed', e);
      return { ok: false, error: 'HEALTH_ERROR' };
    }
  }

  /* ================= ENROLL ================= */

  // src/modules/face/rekog.service.ts

async enroll(
  userId: string,
  base64: string,
): Promise<{ ok: boolean; faces: any[] }> {
  try {
    const r = await this.runHelper<{ ok: boolean; faces: any[] }>('enroll', {
      userId,
      imageBase64: base64,
    });

    if (r?.ok && r.faces?.length) {
      const f = r.faces[0];
      this.logger.log(
        `ENROLL OK user=${userId} faceId=${f.faceId} conf=${Math.round(
          f.confidence ?? 0,
        )}%`,
      );
    } else {
      this.logger.warn(`ENROLL FAIL user=${userId}`);
    }

    // luôn trả về { ok, faces }
    return r;
  } catch (e) {
    this.logger.error(`ENROLL ERROR user=${userId}`, e);
    // khi lỗi cũng trả { ok: false, faces: [] } để TS luôn có field faces
    return { ok: false, faces: [] };
  }
}


  /* ================= VERIFY ================= */

  async verify(
  userId: string,
  imageBase64: string,
  appThreshold = 85,
): Promise<{ ok: boolean; score: number | null; reason?: string }> {
  try {
    const r = await this.runHelper<any>('verify', {
      userId,
      imageBase64,
      awsMin: 70,
    });

    const matches = r?.matches ?? [];
    if (!matches.length) {
      this.logger.warn(`VERIFY NO_MATCH user=${userId}`);
      return { ok: false, score: 0, reason: 'NO_MATCH' };
    }

    const best = matches[0];
    const score = best.Similarity ?? 0;
    const extId = best.Face?.ExternalImageId;
    const faceId = best.Face?.FaceId;

    // 🔥 LOG CHÍNH EM ĐANG MUỐN
    this.logger.log(
      `VERIFY user=${userId} score=${Math.round(score)}% extId=${extId} faceId=${faceId}`,
    );

    // Sai người
    if (extId && extId !== userId) {
      this.logger.warn(`VERIFY DIFF_USER user=${userId} matched=${extId}`);
      return { ok: false, score, reason: 'DIFF_USER' };
    }

    // Điểm thấp
    if (score < appThreshold) {
      this.logger.warn(`VERIFY LOW_SCORE user=${userId} score=${score}`);
      return { ok: false, score, reason: 'LOW_SCORE' };
    }

    return { ok: true, score };
  } catch (e: any) {
    this.logger.error(
      `VERIFY ERROR user=${userId} name=${e?.name} msg=${e?.message}`,
    );
    return { ok: false, score: null, reason: 'ERROR' };
  }
}

  /* ================= DETECT ATTRS ================= */

  async detectAttrs(imageBase64: string): Promise<FaceAttrs> {
    try {
      const r = await this.runHelper<any>('detect', { imageBase64 });

      const f = r?.details?.[0];
      if (!f) return { ok: false, reason: 'NO_FACE' };

      return {
        ok: true,
        pose: {
          yaw: f.Pose?.Yaw ?? 0,
          pitch: f.Pose?.Pitch ?? 0,
          roll: f.Pose?.Roll ?? 0,
        },
        eyesOpen:
          typeof f.EyesOpen?.Value === 'boolean'
            ? { value: !!f.EyesOpen.Value, conf: f.EyesOpen.Confidence ?? 0 }
            : undefined,
        quality: {
          brightness: f.Quality?.Brightness,
          sharpness: f.Quality?.Sharpness,
        },
      };
    } catch (e) {
      this.logger.error('DETECT ERROR', e);
      return { ok: false, reason: 'IMAGE_BAD' };
    }
  }

  /* ================= STATUS / DELETE ================= */

  async enrollStatus(userId: string) {
    try {
      const r = await this.runHelper<{ ok: boolean; count: number }>(
        'countForUser',
        { userId },
      );

      this.logger.log(`COUNT user=${userId} faces=${r.count}`);
      return { count: r.count ?? 0 };
    } catch {
      return { count: 0 };
    }
  }

  async deleteAllForUser(userId: string) {
    const r = await this.runHelper('deleteAllForUser', { userId });
    this.logger.warn(`DELETE_ALL user=${userId} deleted=${r.deleted}`);
    return { deleted: r.deleted };
  }

  async deleteByFaceIds(faceIds: string[]) {
    const r = await this.runHelper('deleteByFaceIds', { faceIds });
    this.logger.warn(`DELETE_BY_IDS deleted=${r.deleted}`);
    return { deleted: r.deleted };
  }
}
