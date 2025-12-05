// src/modules/face/face.controller.ts
import {
  Body,
  Controller,
  Get,
  Logger,
  Post,
  Req,
  Param,
  Delete,
  BadRequestException,
  UseGuards,
  Query,
} from '@nestjs/common';
import { RekogService, FaceAttrs } from './rekog.service';
import { ImgDto } from './dto/img.dto';
import { randomUUID } from 'crypto';
import { Roles } from 'src/common/decorators/roles.decorator';
import { UserRole } from 'src/common/enums';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FaceSnapshot } from './dto/face-snapshot.entity';
import * as path from 'path';
import * as fs from 'node:fs/promises';
import { JwtAuthGuard } from '../core/auth/guards/jwt-auth.guard';

/** Bạn có thể import từ constants riêng; ở đây khai báo trực tiếp cho tiện */
const POSE_THRESH = {
  YAW_MIN: 8,
  PITCH_ABS_MAX: 25,
};
const EYES_CONF_MIN = 70;
const FRONT_MIRROR = true;
const CHALLENGE_TTL = 2 * 60_000;

type LivenessStep = 'LEFT' | 'RIGHT' | 'BLINK';
type Challenge = { id: string; steps: LivenessStep[]; exp: number };

// 👇 THÊM LẠI 2 DÒNG NÀY (ngoài class)
const STEPS_POOL: LivenessStep[] = ['LEFT', 'RIGHT', 'BLINK'];
const challengeStore = new Map<string, Challenge>();

const logger = new Logger('FaceController');

@UseGuards(JwtAuthGuard)
@Controller('face')
export class FaceController {
  constructor(
    private readonly rk: RekogService,
    @InjectRepository(FaceSnapshot)
    private readonly snapRepo: Repository<FaceSnapshot>,
  ) {}

  private async saveBase64ToStorage(imageBase64: string, userId: string): Promise<string> {
    const clean = imageBase64.replace(/^data:image\/\w+;base64,/, '');
    const buf = Buffer.from(clean, 'base64');

    const dir = path.resolve(process.cwd(), 'uploads', 'faces', userId);
    await fs.mkdir(dir, { recursive: true });

    const filename = `${Date.now()}.jpg`;
    const fullPath = path.join(dir, filename);
    await fs.writeFile(fullPath, buf);

    const url = `/uploads/faces/${userId}/${filename}`;
    return url;
  }

  @Get('health')
  async health() {
    return this.rk.health();
  }

  /** (Debug) Đăng ký nhanh từng ảnh một */
  @Post('enroll')
  enroll(@Req() req: any, @Body() dto: ImgDto) {
    return this.rk.enroll(req.user.id, dto.imageBase64);
  }

  @Get('admin/user/:userId')
  @Roles(UserRole.MANAGER)
  async getUserFaces(@Param('userId') userId: string) {
    const snaps = await this.snapRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: 10,
    });

    return {
      userId,
      count: snaps.length,
      snapshots: snaps.map((s) => ({
        id: s.id,
        imageUrl: s.imageUrl,
        createdAt: s.createdAt,
      })),
    };
  }

  @Post('admin/reset')
  @Roles(UserRole.MANAGER)
  async adminReset(@Body() body: { userId: string }) {
    const r = await this.rk.deleteAllForUser(body.userId);
    await this.snapRepo.delete({ userId: body.userId });

    return { ok: true, deletedFaces: r.deleted };
  }

  @Delete('admin/snapshot/:id')
  @Roles(UserRole.MANAGER)
  async deleteSnapshot(@Param('id') id: string) {
    const snap = await this.snapRepo.findOne({ where: { id } });
    if (!snap) {
      throw new BadRequestException('SNAPSHOT_NOT_FOUND');
    }

    if (snap.rekogFaceId) {
      await this.rk.deleteByFaceIds([snap.rekogFaceId]);
    }

    await this.snapRepo.delete(id);

    return { ok: true };
  }

  /** (Debug) Verify nhanh một ảnh */
  @Post('verify')
  verify(@Req() req: any, @Body() dto: ImgDto) {
    // trả thẳng { ok, score, reason } từ RekogService
    return this.rk.verify(req.user.id, dto.imageBase64, 90);
  }

  /** Đã enroll chưa */
  @Get('status')
  async status(@Req() req: any, @Query('userId') userId?: string) {
    const uid = userId ?? req.user?.id;
    if (!uid) {
      throw new BadRequestException('MISSING_USER_ID');
    }
    const info = await this.rk.enrollStatus(uid);
    return { enrolled: info.count > 0, count: info.count };
  }

  /** Xoá toàn bộ mẫu của user (self) */
  @Post('reset')
  async reset(@Req() req: any) {
    const r = await this.rk.deleteAllForUser(req.user.id);
    await this.snapRepo.delete({ userId: req.user.id });
    return { ok: true, deleted: r.deleted };
  }

  @Get('admin/user/:userId/stats')
  @Roles(UserRole.MANAGER)
  async getUserFaceStats(@Param('userId') userId: string) {
    const aws = await this.rk.enrollStatus(userId);
    const local = await this.snapRepo.count({ where: { userId } });
    return { userId, awsFaces: aws.count, localSnapshots: local };
  }

  @Post('admin/enroll')
  @Roles(UserRole.MANAGER)
  async adminEnroll(@Body() body: { userId: string; imageBase64: string }) {
    const r = await this.rk.enroll(body.userId, body.imageBase64);

    if (!r.ok || !r.faces?.length) {
      throw new BadRequestException('NO_FACE_DETECTED');
    }

    const first = r.faces[0];
    const url = await this.saveBase64ToStorage(body.imageBase64, body.userId);

    const snap = this.snapRepo.create({
      userId: body.userId,
      imageUrl: url,
      rekogFaceId: first.faceId ?? null,
    });

    await this.snapRepo.save(snap);

    return {
      ok: true,
      face: {
        rekogFaceId: first.faceId,
        confidence: first.confidence,
        snapshotId: snap.id,
        imageUrl: snap.imageUrl,
      },
    };
  }

  /** B1: phát challenge 3 pose (LEFT/RIGHT/BLINK) */
  @Post('enroll-start')
  enrollStart() {
    const steps = shuffle(STEPS_POOL).slice(0, 3);
    const ch: Challenge = { id: randomUUID(), steps, exp: Date.now() + CHALLENGE_TTL };
    challengeStore.set(ch.id, ch);
    return { ok: true, challenge: ch };
  }

  /** B2: nộp đủ 3 ảnh theo thứ tự → validate liveness → index ảnh “bình thường” */
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

    const mirrorTol = process.env.MIRROR_TOL === '1';

    for (let i = 0; i < body.frames.length; i++) {
      const fr = body.frames[i];
      const det = await this.rk.detectAttrs(fr.imageBase64);
      if (!det.ok) return { ok: false, reason: 'NO_FACE', at: i };

      let yaw = det.pose.yaw ?? 0;
      const pitch = det.pose.pitch ?? 0;

      if (FRONT_MIRROR) yaw = -yaw;

      const pitchOk = Math.abs(pitch) <= POSE_THRESH.PITCH_ABS_MAX;
      const absYaw = Math.abs(yaw);
      const dir = absYaw >= POSE_THRESH.YAW_MIN ? (yaw > 0 ? 'RIGHT' : 'LEFT') : 'CENTER';
      const strongTurn = absYaw >= POSE_THRESH.YAW_MIN + 4;

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
        const conf = det.eyesOpen?.conf ?? 0;
        const val = det.eyesOpen?.value;
        const closedLoose =
          (val === false && conf >= EYES_CONF_MIN) || (val === true && conf <= 40);
        if (!closedLoose) {
          logger.warn(`BLINK_FAIL eyesOpen=${String(val)} conf=${conf.toFixed(1)}`);
          return { ok: false, reason: 'BLINK_FAIL', at: i };
        }
      }

      analyzed.push({ step: fr.step, imageBase64: fr.imageBase64, yaw, pitch, det: det as any });
    }

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
