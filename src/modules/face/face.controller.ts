// src/modules/face/face.controller.ts
import { Body, Controller, Get, Logger, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../core/auth/guards/jwt-auth.guard';
import { RekogService, FaceAttrs } from './rekog.service';
import { ImgDto } from './dto/img.dto';
import { randomUUID } from 'crypto';

/** Bạn có thể import từ constants riêng; ở đây khai báo trực tiếp cho tiện */
const POSE_THRESH = {
  YAW_MIN: 8,          // tối thiểu để tính LEFT/RIGHT
  PITCH_ABS_MAX: 25,   // |pitch| tối đa chấp nhận
};
const EYES_CONF_MIN = 70;
const FRONT_MIRROR = true;         // preview front camera là gương → đảo yaw khi phân tích
const CHALLENGE_TTL = 2 * 60_000;  // 2 phút

type LivenessStep = 'LEFT' | 'RIGHT' | 'BLINK';
type Challenge = { id: string; steps: LivenessStep[]; exp: number };

const STEPS_POOL: LivenessStep[] = ['LEFT', 'RIGHT', 'BLINK'];
const challengeStore = new Map<string, Challenge>();
const logger = new Logger('FaceController');

@UseGuards(JwtAuthGuard)
@Controller('face')
export class FaceController {
  constructor(private readonly rk: RekogService) {}

  /** (Debug) Đăng ký nhanh từng ảnh một */
  @Post('enroll')
  enroll(@Req() req: any, @Body() dto: ImgDto) {
    return this.rk.enroll(req.user.id, dto.imageBase64);
  }

  /** (Debug) Verify nhanh một ảnh */
  @Post('verify')
  verify(@Req() req: any, @Body() dto: ImgDto) {
    return this.rk.verify(req.user.id, dto.imageBase64, 90);
  }

  /** Đã enroll chưa */
  @Get('status')
  async status(@Req() req: any) {
    const info = await this.rk.enrollStatus(req.user.id);
    return { enrolled: info.count > 0, count: info.count };
  }

  /** Xoá toàn bộ mẫu của user */
  @Post('reset')
  async reset(@Req() req: any) {
    const r = await this.rk.deleteAllForUser(req.user.id);
    return { ok: true, deleted: r.deleted };
  }

  /** B1: phát challenge 3 pose (LEFT/RIGHT/BLINK) */
  @Post('enroll-start')
  enrollStart() {
    const steps = shuffle(STEPS_POOL).slice(0, 3);
    const ch: Challenge = { id: randomUUID(), steps, exp: Date.now() + CHALLENGE_TTL };
    challengeStore.set(ch.id, ch);
    return { ok: true, challenge: ch };
  }

  /** B2: nộp đủ 3 ảnh theo thứ tự → validate liveness (nới ngưỡng) → index ảnh “bình thường” */
  @Post('enroll-submit')
  async enrollSubmit(
    @Req() req: any,
    @Body()
    body: {
      challengeId: string;
      frames: { step: LivenessStep; imageBase64: string; index?: number }[];
    },
  ) {
    const ch = challengeStore.get(body.challengeId);
    if (!ch || Date.now() > ch.exp) return { ok: false, reason: 'CHALLENGE_EXPIRED' };

    // Đủ & đúng thứ tự
    if (!body.frames || body.frames.length !== ch.steps.length) {
      return { ok: false, reason: 'WRONG_STEP_COUNT' };
    }
    for (let i = 0; i < ch.steps.length; i++) {
      if (body.frames[i].step !== ch.steps[i]) {
        return { ok: false, reason: 'WRONG_STEP_ORDER', at: i };
      }
    }

    const analyzed: Array<{
      step: LivenessStep;
      imageBase64: string;
      yaw: number;
      pitch: number;
      det: FaceAttrs & { ok: true };
    }> = [];

    const mirrorTol = process.env.MIRROR_TOL === '1'; // cứu hộ nếu trái/phải bị nhầm do mirror

    for (let i = 0; i < body.frames.length; i++) {
      const fr = body.frames[i];
      const det = await this.rk.detectAttrs(fr.imageBase64);
      if (!det.ok) return { ok: false, reason: 'NO_FACE', at: i };

      let yaw = det.pose.yaw ?? 0;
      const pitch = det.pose.pitch ?? 0;

      // camera trước: preview gương, ảnh bytes không mirror → đảo yaw để khớp hướng người dùng
      if (FRONT_MIRROR) yaw = -yaw;

      // ====== NỚI NGƯỠNG ======
      const pitchOk = Math.abs(pitch) <= POSE_THRESH.PITCH_ABS_MAX; // vd 25°
      const absYaw = Math.abs(yaw);
      const dir = absYaw >= POSE_THRESH.YAW_MIN ? (yaw > 0 ? 'RIGHT' : 'LEFT') : 'CENTER';
      const strongTurn = absYaw >= POSE_THRESH.YAW_MIN + 4; // quay rõ hơn ~4°

      if (fr.step === 'LEFT') {
        const passStrict = dir === 'LEFT' && pitchOk;
        const passMirrorTol = strongTurn && pitchOk && mirrorTol;
        if (!(passStrict || passMirrorTol)) {
          logger.warn(`POSE_LEFT_FAIL yaw=${yaw.toFixed(1)} pitch=${pitch.toFixed(1)} dir=${dir}`);
          return { ok: false, reason: 'POSE_LEFT_FAIL', at: i, yaw, pitch };
        }
      }

      if (fr.step === 'RIGHT') {
        const passStrict = dir === 'RIGHT' && pitchOk;
        const passMirrorTol = strongTurn && pitchOk && mirrorTol;
        if (!(passStrict || passMirrorTol)) {
          logger.warn(`POSE_RIGHT_FAIL yaw=${yaw.toFixed(1)} pitch=${pitch.toFixed(1)} dir=${dir}`);
          return { ok: false, reason: 'POSE_RIGHT_FAIL', at: i, yaw, pitch };
        }
      }

      if (fr.step === 'BLINK') {
        // BLINK nới: chấp nhận chắc chắn nhắm (false & conf cao) hoặc coi như nhắm (true nhưng conf thấp)
        const conf = det.eyesOpen?.conf ?? 0;
        const val = det.eyesOpen?.value;
        const closedLoose = (val === false && conf >= EYES_CONF_MIN) || (val === true && conf <= 40);
        if (!closedLoose) {
          logger.warn(`BLINK_FAIL eyesOpen=${String(val)} conf=${conf.toFixed(1)}`);
          return { ok: false, reason: 'BLINK_FAIL', at: i };
        }
      }

      analyzed.push({ step: fr.step, imageBase64: fr.imageBase64, yaw, pitch, det: det as any });
    }

    // Chọn ảnh “bình thường” để index: bỏ BLINK, ưu tiên mắt mở
    const keep = analyzed.filter((a) => a.step !== 'BLINK');
    const eyesOpen = keep.filter((a) => a.det.eyesOpen?.value === true);
    const toIndex = (eyesOpen.length ? eyesOpen : keep).slice(0, 3);

    let indexed = 0;
    for (const f of toIndex) {
      const r = await this.rk.enroll(req.user.id, f.imageBase64);
      if (r.ok) indexed++;
    }

    challengeStore.delete(body.challengeId);
    return { ok: indexed > 0, indexed };
  }
}

/* ------------- helpers ------------- */
function shuffle<T>(arr: T[]) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
