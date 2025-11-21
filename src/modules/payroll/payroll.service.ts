// src/modules/payroll/payroll.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager, ILike } from 'typeorm';
import { Payroll } from './entities/payroll.entity';
import { PayrollSlip } from './entities/payroll-slip.entity';
import { SalarySetting } from './entities/salary-setting.entity';
import { CashType } from '@modules/cashbook/entities/cash_types.entity';
import { CashbookService } from '@modules/cashbook/cashbook.service';
import { CashbookType, CounterpartyGroup, PayrollStatus, PayrollSlipStatus, SalaryType, InvoiceStatus } from 'src/common/enums';
import { CreatePayrollDto } from './dto/create-payroll.dto';
import { PayPayrollDto } from './dto/pay-payroll.dto';
import { ResponseCommon, ResponseException } from 'src/common/common_dto/respone.dto';
import { PageMeta } from 'src/common/common_dto/paginated';
import { ListPayrollDto } from './dto/list-payroll.dto';
import { Between } from 'typeorm';
import { Attendance } from '@modules/user/entities/attendance'; // chỉnh path
import { Shift } from '@modules/user/entities/shift.entity';               // nếu cần
import { AttendanceStatus } from 'src/common/enums';
import { UpsertSalarySettingDto } from './dto/upsertSalarySettingDto';
import { SalaryMeta } from './entities/salary-setting.entity';
import { Invoice } from '@modules/invoice/entities/invoice.entity';


// helper



@Injectable()
export class PayrollService {
  constructor(
    @InjectRepository(Payroll) private readonly payrollRepo: Repository<Payroll>,
    @InjectRepository(PayrollSlip) private readonly slipRepo: Repository<PayrollSlip>,
    @InjectRepository(SalarySetting) private readonly settingRepo: Repository<SalarySetting>,
    private readonly dataSource: DataSource,
    private readonly cashbookService: CashbookService,
    @InjectRepository(CashType) private readonly cashTypeRepo: Repository<CashType>,
  ) { }

  private genPayrollCode() {
    const d = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
    const rand = Math.floor(Math.random() * 900) + 100;
    return `BL${d}${rand}`;
  }

  private genSlipCode() {
    const d = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
    const rand = Math.floor(Math.random() * 900) + 100; // 100–999
    return `PL${d}${rand}`;
  }


  // ---- SALARY SETTING ----
  // async upsertSalarySetting(dto: any) {
  //   const { staffId, salaryType, baseAmount, overtimeRate } = dto;
  //   let setting = await this.settingRepo.findOne({
  //     where: { staff: { id: staffId } as any },
  //     relations: ['staff'],
  //   });

  //   if (!setting) {
  //     setting = this.settingRepo.create({
  //       staff: { id: staffId } as any,
  //       salaryType,
  //       baseAmount,
  //       overtimeRate: overtimeRate ?? '0',
  //     });
  //   } else {
  //     setting.salaryType = salaryType;
  //     setting.baseAmount = baseAmount;
  //     setting.overtimeRate = overtimeRate ?? setting.overtimeRate;
  //   }

  //   const saved = await this.settingRepo.save(setting);
  //   return new ResponseCommon(200, true, 'UPSERT_SALARY_SETTING_SUCCESS', saved);
  // }

  async getSalarySetting(staffId: string) {
    const setting = await this.settingRepo.findOne({
      where: { staff: { id: staffId } as any },
      relations: ['staff'],
    });
    return new ResponseCommon(200, true, 'GET_SALARY_SETTING_SUCCESS', setting);
  }

  // ---- CREATE PAYROLL ----
  async createPayroll(dto: CreatePayrollDto) {
    return this.dataSource.transaction(async (em) => {
      const from = new Date(dto.workDateFrom);
      const to = new Date(dto.workDateTo);

      let settings = await em.getRepository(SalarySetting).find({ relations: ['staff'] });

      if (!dto.applyAllStaff && dto.staffIds?.length) {
        settings = settings.filter((s) => dto.staffIds!.includes(s.staff.id));
      }

      if (!settings.length) {
        throw new ResponseException('NO_STAFF', 400, 'NO_STAFF_FOR_PAYROLL_CALCULATION');
      }

      let payroll = em.getRepository(Payroll).create({
        code: this.genPayrollCode(),
        name: dto.name ?? `Bảng lương ${from.getMonth() + 1}/${from.getFullYear()}`,
        workDateFrom: from,
        workDateTo: to,
        payCycle: dto.payCycle,
        status: PayrollStatus.TEMP,
        totalAmount: '0',
        paidAmount: '0',
        remainingAmount: '0',
      });
      payroll = await em.save(payroll);

      let total = 0;

      for (const setting of settings) {
        const workingUnits = await this.calcWorkingUnits(
          setting.staff.id,
          from,
          to,
          setting.salaryType,
        );

        const basic = Number(setting.baseAmount) * workingUnits;

        const meta = (setting.meta ?? {}) as SalaryMeta;

        // 1) Doanh thu cá nhân
        const revenue =
          meta.bonusEnabled && meta.bonusType === 'PERSONAL_REVENUE'
            ? await this.getPersonalRevenue(setting.staff.id, from, to, em)
            : 0;

        const bonusAmount = this.calcCommissionFromRules(
          revenue,
          meta.bonusRules ?? [],
        );

        // 2) Phụ cấp (ví dụ theo ngày công)
        const workingDays = workingUnits; // nếu salaryType PER_STANDARD_DAY
        const allowanceAmount = this.calcAllowance(workingDays, meta);

        // 3) Giảm trừ
        // TODO: sau này bạn query attendance để ra lateTimes / lateMinutes / earlyTimes / earlyMinutes
        // 3) Giảm trừ: lấy dữ liệu đi muộn / về sớm từ Attendance
        const violations = await this.getLateEarlyViolations(
          setting.staff.id,
          from,
          to,
        );

        const deductionAmount = this.calcDeduction(meta, violations);


        const overtimeAmount = 0;
        const commissionAmount = 0; // nếu bạn muốn tách riêng hoa hồng

        const totalAmount =
          basic +
          overtimeAmount +
          bonusAmount +
          commissionAmount +
          allowanceAmount -
          deductionAmount;

        total += totalAmount;

        const slip = em.getRepository(PayrollSlip).create({
          code: this.genSlipCode(),
          payroll,
          staff: setting.staff,
          workingUnits,
          basicSalary: String(basic),
          overtimeAmount: String(overtimeAmount),
          bonusAmount: String(bonusAmount),
          commissionAmount: String(commissionAmount),
          allowanceAmount: String(allowanceAmount),
          deductionAmount: String(deductionAmount),
          totalAmount: String(totalAmount),
          paidAmount: '0',
          remainingAmount: String(totalAmount),
          status: PayrollSlipStatus.CLOSED,
        });

        await em.save(slip);
      }



      payroll.totalAmount = String(total);
      payroll.remainingAmount = String(total);
      payroll.status = PayrollStatus.CLOSED;
      await em.save(payroll);

      return new ResponseCommon(201, true, 'CREATE_PAYROLL_SUCCESS', payroll);
    });
  }

  private readonly STANDARD_DAY_HOURS = 8; // 1 ngày công = 8h

  private async calcWorkingUnits(
    staffId: string,
    from: Date,
    to: Date,
    salaryType: SalaryType,
  ): Promise<number> {
    const attRepo = this.dataSource.getRepository(Attendance);
    const fromISO = from.toISOString().slice(0, 10);
    const toISO = to.toISOString().slice(0, 10);

    switch (salaryType) {
      case SalaryType.PER_SHIFT: {
        // Mỗi bản ghi Attendance = 1 ca
        const count = await attRepo.count({
          where: {
            userId: staffId,
            dateISO: Between(fromISO, toISO),
            // tương tự trên: chỉ tính ca có trạng thái hợp lệ
            // status: Not(AttendanceStatus.MISSING),
          } as any,
        });
        return count; // số ca
      }

      case SalaryType.PER_HOUR: {
        const hours = await this.calcTotalHours(staffId, from, to);
        return hours; // số giờ
      }

      case SalaryType.PER_STANDARD_DAY: {
        const hours = await this.calcTotalHours(staffId, from, to);
        return hours / this.STANDARD_DAY_HOURS; // số ngày công
      }

      case SalaryType.FIXED:
      default:
        // Lương cố định theo kỳ → luôn 1 đơn vị
        return 1;
    }
  }


  // ---- LIST + DETAIL ----
  async listPayrolls(q: ListPayrollDto) {
    const page = Math.max(1, Number(q.page ?? 1));
    const limit = Math.max(1, Math.min(100, Number(q.limit ?? 20)));

    const qb = this.payrollRepo.createQueryBuilder('p');

    if (q.q?.trim()) {
      qb.andWhere('p.name ILIKE :q OR p.code ILIKE :q', { q: `%${q.q.trim()}%` });
    }
    if (q.status) {
      qb.andWhere('p.status = :st', { st: q.status });
    }

    qb.orderBy('p.workDateFrom', 'DESC')
      .addOrderBy('p.code', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [items, total] = await qb.getManyAndCount();

    const meta: PageMeta = { total, page, limit, pages: Math.ceil(total / limit) || 0 };
    return new ResponseCommon<typeof items, PageMeta>(200, true, 'LIST_PAYROLL_SUCCESS', items, meta);
  }

  async getPayrollDetail(id: string) {
    const payroll = await this.payrollRepo.findOne({
      where: { id },
      relations: ['slips', 'slips.staff'],
    });
    if (!payroll) throw new ResponseException('PAYROLL_NOT_FOUND', 404, 'PAYROLL_NOT_FOUND');
    return new ResponseCommon(200, true, 'GET_PAYROLL_SUCCESS', payroll);
  }

  // ---- PAY PAYROLL ----
  // ---- PAY PAYROLL ----
  async payPayroll(id: string, dto: PayPayrollDto) {
    // 1) Đảm bảo đã có loại "Chi lương nhân viên" TRƯỚC khi vào transaction
    const cashType = await this.getOrCreateSalaryCashType(); // 👈 KHÔNG dùng em nữa

    // 2) Transaction chỉ lo cập nhật bảng lương + phiếu lương
    return this.dataSource.transaction(async (em) => {
      const payroll = await em.findOne(Payroll, {
        where: { id },
        relations: ['slips', 'slips.staff'],
      });
      if (!payroll) {
        throw new ResponseException('PAYROLL_NOT_FOUND', 404, 'PAYROLL_NOT_FOUND');
      }

      let totalPaidThisTime = 0;

      for (const slip of payroll.slips) {
        if (!dto.slipIds.includes(slip.id)) continue;

        const remaining = Number(slip.remainingAmount);
        if (remaining <= 0) continue;

        // gọi CashbookService: dùng cashType.id đã tồn tại trong DB
        await this.cashbookService.createCashBookEntry({
          type: CashbookType.PAYMENT,
          date: dto.payDate,
          cashTypeId: cashType.id,
          amount: String(remaining),
          counterpartyGroup: CounterpartyGroup.STAFF,
          staffId: slip.staff.id,
          sourceCode: slip.code,
          isPostedToBusinessResult: true,
        } as any);

        slip.paidAmount = String(Number(slip.paidAmount) + remaining);
        slip.remainingAmount = '0';
        slip.status = PayrollSlipStatus.PAID;
        await em.save(slip);

        totalPaidThisTime += remaining;
      }

      payroll.paidAmount = String(Number(payroll.paidAmount) + totalPaidThisTime);
      payroll.remainingAmount = String(
        Number(payroll.totalAmount) - Number(payroll.paidAmount),
      );
      if (Number(payroll.remainingAmount) <= 0) {
        payroll.status = PayrollStatus.PAID;
      }

      await em.save(payroll);

      return new ResponseCommon(200, true, 'PAY_PAYROLL_SUCCESS', {
        payroll,
        paid: totalPaidThisTime,
      });
    });
  }


  private async getOrCreateSalaryCashType() {
    let t = await this.cashTypeRepo.findOne({
      where: { name: 'Chi lương nhân viên' },
    });
    if (!t) {
      t = await this.cashTypeRepo.save(
        this.cashTypeRepo.create({
          name: 'Chi lương nhân viên',
          isIncomeType: false,
          isActive: true,
        }),
      );
    }
    return t;
  }




  // helpers 
  private parseTimeToHours(time: string | null | undefined): number | null {
    if (!time) return null;           // "08:30"
    const [h, m] = time.split(':').map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return null;
    return h + m / 60;
  }

  private async calcTotalHours(
    staffId: string,
    from: Date,
    to: Date,
  ): Promise<number> {
    const attRepo = this.dataSource.getRepository(Attendance);

    const fromISO = from.toISOString().slice(0, 10); // 'YYYY-MM-DD'
    const toISO = to.toISOString().slice(0, 10);

    const records = await attRepo.find({
      where: {
        userId: staffId,
        dateISO: Between(fromISO, toISO),
        // chỉ tính những ca có trạng thái hợp lệ (tùy enum của bạn)
        // nếu không chắc enum thì có thể bỏ điều kiện status
        // status: Not(AttendanceStatus.MISSING),
      } as any,
      relations: ['shift'],
    });

    let totalHours = 0;

    for (const r of records) {
      // ưu tiên dùng giờ checkIn/checkOut thực tế
      let start = this.parseTimeToHours(r.checkIn);
      let end = this.parseTimeToHours(r.checkOut);

      // nếu thiếu, fallback sang khung ca
      if (start == null && r.shift) {
        start = this.parseTimeToHours(r.shift.startTime);
      }
      if (end == null && r.shift) {
        end = this.parseTimeToHours(r.shift.endTime);
      }

      if (start == null || end == null) continue;
      const diff = end - start;
      if (diff > 0) totalHours += diff;
    }

    // làm tròn 2 chữ số sau dấu phẩy
    return Math.round(totalHours * 100) / 100;
  }
  // payroll.service.ts
  async upsertSalarySetting(dto: UpsertSalarySettingDto) {
    const { staffId, salaryType, baseAmount, overtimeRate, meta } = dto;

    let setting = await this.settingRepo.findOne({
      where: { staff: { id: staffId } as any },
      relations: ['staff'],
    });

    if (!setting) {
      setting = this.settingRepo.create({
        staff: { id: staffId } as any,
        salaryType,
        baseAmount,
        overtimeRate: overtimeRate ?? '0',
        meta: meta ?? {},
      });
    } else {
      setting.salaryType = salaryType;
      setting.baseAmount = baseAmount;
      setting.overtimeRate = overtimeRate ?? setting.overtimeRate;
      setting.meta = meta ?? setting.meta ?? {};
    }

    const saved = await this.settingRepo.save(setting);
    return new ResponseCommon(200, true, 'UPSERT_SALARY_SETTING_SUCCESS', saved);
  }

  private calcAllowance(
    workingDays: number,
    meta?: SalaryMeta,
  ): number {
    if (!meta?.allowanceEnabled || !meta.allowances?.length) return 0;
    let total = 0;
    for (const a of meta.allowances) {
      if (a.type === 'PER_DAY_FIXED') {
        total += a.amount * workingDays;
      } else if (a.type === 'PER_MONTH_FIXED') {
        total += a.amount;
      }
    }
    return total;
  }

  private calcDeduction(
    meta?: SalaryMeta,
    ctx?: {
      lateTimes?: number;
      earlyTimes?: number;
      lateMinutes?: number;
      earlyMinutes?: number;
    },
  ): number {
    if (!meta?.deductionEnabled || !meta.deductions?.length) return 0;

    const {
      lateTimes = 0,
      earlyTimes = 0,
      lateMinutes = 0,
      earlyMinutes = 0,
    } = ctx || {};

    let total = 0;

    for (const d of meta.deductions) {
      const kind = d.kind ?? 'LATE';
      const condition = d.condition ?? 'BY_TIMES';
      const amt = d.amountPerUnit ?? 0;
      if (!amt) continue;

      if (condition === 'BY_TIMES') {
        const times =
          kind === 'LATE'
            ? lateTimes
            : kind === 'EARLY'
              ? earlyTimes
              : 1; // FIXED → 1 lần / mỗi kỳ lương
        total += amt * times;
      } else if (condition === 'BY_BLOCK') {
        const block = d.blockMinutes && d.blockMinutes > 0 ? d.blockMinutes : 1;
        const minutes =
          kind === 'LATE'
            ? lateMinutes
            : kind === 'EARLY'
              ? earlyMinutes
              : 0;
        const blocks = Math.floor(minutes / block);
        if (blocks > 0) total += amt * blocks;
      }
    }

    return total;
  }
  // kiểm tra đi muộn về sơm để trừ lương
  // kiểm tra đi muộn về sớm để trừ lương
  private async getLateEarlyViolations(
    staffId: string,
    from: Date,
    to: Date,
  ) {
    const attRepo = this.dataSource.getRepository(Attendance);

    const fromISO = from.toISOString().slice(0, 10);
    const toISO = to.toISOString().slice(0, 10);

    const records = await attRepo.find({
      where: {
        userId: staffId,
        dateISO: Between(fromISO, toISO),
      } as any,
      relations: ['shift'],
    });

    let lateMinutes = 0;
    let earlyMinutes = 0;
    let lateTimes = 0;
    let earlyTimes = 0;

    for (const r of records) {
      const checkIn = this.parseTimeToHours(r.checkIn);
      const shiftStart = this.parseTimeToHours(r.shift?.startTime);
      const checkOut = this.parseTimeToHours(r.checkOut);
      const shiftEnd = this.parseTimeToHours(r.shift?.endTime);

      // Đi muộn
      if (checkIn != null && shiftStart != null && checkIn > shiftStart) {
        lateMinutes += (checkIn - shiftStart) * 60;
        lateTimes += 1; // mỗi ca muộn tính 1 lần
      }

      // Về sớm
      if (checkOut != null && shiftEnd != null && checkOut < shiftEnd) {
        earlyMinutes += (shiftEnd - checkOut) * 60;
        earlyTimes += 1; // mỗi ca về sớm tính 1 lần
      }
    }

    return { lateMinutes, earlyMinutes, lateTimes, earlyTimes };
  }



  private async getPersonalRevenue(
    staffId: string,
    from: Date,
    to: Date,
    manager: EntityManager,
  ): Promise<number> {
    const qb = manager
      .getRepository(Invoice)
      .createQueryBuilder('inv')
      .innerJoin('inv.order', 'ord')
      .innerJoin('ord.createdBy', 'creator') // 👈 người tạo order
      .where('creator.id = :sid', { sid: staffId })
      .andWhere('inv.createdAt BETWEEN :from AND :to', { from, to })
      .andWhere('inv.status = :st', { st: InvoiceStatus.PAID })
      .select(
        'COALESCE(SUM(COALESCE(inv.finalAmount, inv.totalAmount)), 0)',
        'sum',
      );

    const { sum } =
      (await qb.getRawOne<{ sum: string }>()) ?? { sum: '0' };

    return Number(sum || 0);
  }

  // private calcDeductionFromViolations(
  //   meta: SalaryMeta,
  //   lateMinutes: number,
  //   earlyMinutes: number
  // ): number {
  //   if (!meta?.deductionEnabled || !meta.deductions?.length) return 0;

  //   let total = 0;

  //   for (const d of meta.deductions) {
  //     if (d.kind === "FIXED") {
  //       if (d.condition === "FIXED_PER_MONTH") {
  //         total += d.amountPerUnit; // trừ cố định
  //       }
  //       continue;
  //     }

  //     let minutes = 0;
  //     if (d.kind === "LATE") minutes = lateMinutes;
  //     if (d.kind === "EARLY") minutes = earlyMinutes;

  //     if (minutes <= 0) continue;

  //     if (d.condition === "BY_TIMES") {
  //       total += d.amountPerUnit; // mỗi lần vi phạm tính 1 lần
  //     }

  //     if (d.condition === "BY_BLOCK") {
  //       const block = d.blockMinutes || 15;
  //       const blocks = Math.ceil(minutes / block);
  //       total += blocks * d.amountPerUnit;
  //     }
  //   }

  //   return total;
  // }

  private calcCommissionFromRules(
    revenue: number,
    rules: { fromRevenue: number; percent: number }[] = [],
  ): number {
    if (!rules.length || revenue <= 0) return 0;
    const sorted = [...rules].sort((a, b) => a.fromRevenue - b.fromRevenue);

    let percent = 0;
    for (const r of sorted) {
      if (revenue >= r.fromRevenue) percent = r.percent;
    }
    return Math.round((revenue * percent) / 100);
  }


}
