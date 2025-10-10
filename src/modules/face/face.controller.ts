import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../core/auth/guards/jwt-auth.guard';
import { RekogService } from './rekog.service';
import { ImgDto } from './dto/img.dto';
import { Get } from '@nestjs/common';``
import { LivenessStep, EnrollChallenge, POSE_THRESH, EYES_CONF_MIN } from '../../common/enums';
import { randomUUID } from 'crypto';

const CHALLENGE_STEPS_POOL: LivenessStep[] = ['LEFT', 'RIGHT', 'BLINK'];
const challengeStore = new Map<string, EnrollChallenge>();
@UseGuards(JwtAuthGuard)
@Controller('face')
export class FaceController {
  constructor(private readonly rk: RekogService) {}

  /** Đăng ký khuôn mặt (gọi 3–5 lần với ảnh khác nhau) */
  @Post('enroll')
  enroll(@Req() req: any, @Body() dto: ImgDto) {
    return this.rk.enroll(req.user.id, dto.imageBase64);
  }

  /** Kiểm tra khớp khuôn mặt (test nhanh) */
  @Post('verify')
  verify(@Req() req: any, @Body() dto: ImgDto) {
    return this.rk.verify(req.user.id, dto.imageBase64, 90);
  }

   @Get('status')
  async status(@Req() req: any) {
    const info = await this.rk.enrollStatus(req.user.id);
    return { enrolled: info.count > 0, count: info.count };
  }

  /** Xoá toàn bộ mẫu cũ để đăng ký lại (nút "Chỉnh sửa") */
  @Post('reset')
  async reset(@Req() req: any) {
    const r = await this.rk.deleteAllForUser(req.user.id);
    return { ok: true, deleted: r.deleted };
  }

 /** B1: phát challenge (ví dụ 3 bước) */
  @Post('enroll-start')
  enrollStart(@Req() req: any) {
    const steps: LivenessStep[] = shuffle(CHALLENGE_STEPS_POOL).slice(0, 3);
    const ch: EnrollChallenge = { id: randomUUID(), steps, exp: Date.now() + 2 * 60_000 };
    challengeStore.set(ch.id, ch);
    return { ok: true, challenge: ch };
  }

  /** B2: FE nộp ảnh theo từng bước để BE validate + index */
  @Post('enroll-submit')
  async enrollSubmit(
    @Req() req: any,
    @Body() body: { challengeId: string; frames: { step: LivenessStep; imageBase64: string }[] }
  ) {
    const ch = challengeStore.get(body.challengeId);
    if (!ch || Date.now() > ch.exp) return { ok: false, reason: 'CHALLENGE_EXPIRED' };
    // kiểm số lượng & thứ tự
    if (body.frames.length !== ch.steps.length) return { ok: false, reason: 'WRONG_STEP_COUNT' };
    for (let i = 0; i < ch.steps.length; i++) {
      if (body.frames[i].step !== ch.steps[i]) return { ok: false, reason: 'WRONG_STEP_ORDER' };
    }

    // validate từng frame
    for (let i = 0; i < body.frames.length; i++) {
      const { step, imageBase64 } = body.frames[i];
      const det = await this.rk.detectAttrs(imageBase64);
      if (!det.ok) return { ok: false, reason: 'NO_FACE' };

      const { yaw, pitch } = det.pose;
      const eyes = det.eyesOpen;

      if (step === 'LEFT'   && !(yaw <= POSE_THRESH.YAW_LEFT && pitch >= POSE_THRESH.PITCH_MIN && pitch <= POSE_THRESH.PITCH_MAX)) {
        return { ok: false, reason: 'POSE_LEFT_FAIL', at: i };
      }
      if (step === 'RIGHT'  && !(yaw >= POSE_THRESH.YAW_RIGHT && pitch >= POSE_THRESH.PITCH_MIN && pitch <= POSE_THRESH.PITCH_MAX)) {
        return { ok: false, reason: 'POSE_RIGHT_FAIL', at: i };
      }
      if (step === 'BLINK') {
        // BLINK “giản lược”: yêu cầu mắt mở ở khung 1 & nhắm ở khung 2 (hoặc ngược).
        // Ở đây đơn giản: chỉ cần EyesOpen Value=false hoặc Confidence thấp (mô phỏng nhắm mắt).
        const isClosed = eyes.left === false && (det.eyesOpen.conf ?? 0) >= EYES_CONF_MIN;
        if (!isClosed) return { ok: false, reason: 'BLINK_FAIL', at: i };
      }
    }

    // tất cả pass → index tất cả frame làm mẫu
    for (const fr of body.frames) {
      await this.rk.enroll(req.user.id, fr.imageBase64);
    }
    challengeStore.delete(body.challengeId);
    return { ok: true, enrolled: body.frames.length };
  }
}

function shuffle<T>(arr: T[]) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}


