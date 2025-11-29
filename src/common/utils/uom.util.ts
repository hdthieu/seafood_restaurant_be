// src/modules/uomconversion/uom.util.ts

import { EntityManager } from 'typeorm';
import { UomConversion } from '@modules/uomconversion/entities/uomconversion.entity'; // Sửa lại đường dẫn import Entity cho đúng với cấu trúc của bạn

export async function getConversionFactorRecursive(
    em: EntityManager,
    fromCode: string,
    toCode: string,
    visited: Set<string> = new Set()
): Promise<number> {
    if (!fromCode || !toCode) return 0;
    const from = fromCode.toUpperCase().trim();
    const to = toCode.toUpperCase().trim();

    // 1. Nếu trùng nhau -> hệ số 1
    if (from === to) return 1;

    // Tránh vòng lặp vô tận (A -> B -> A)
    if (visited.has(from)) return 0;
    visited.add(from);

    const convRepo = em.getRepository(UomConversion);

    // 2. Tìm trực tiếp (Ưu tiên số 1)
    const direct = await convRepo.findOne({
        where: { from: { code: from }, to: { code: to } }
    });
    if (direct) return Number(direct.factor);

    // 3. Tìm bắc cầu (Lốc -> Chai ... -> Can)
    // Tìm tất cả các đơn vị mà 'from' có thể chuyển tới
    const candidates = await convRepo.find({
        where: { from: { code: from } },
        relations: ['to']
    });

    for (const cand of candidates) {
        // Đệ quy: Tính từ đơn vị trung gian (Chai) về đích (Can)
        const nextFactor = await getConversionFactorRecursive(em, cand.to.code, to, visited);

        // Nếu tìm thấy đường đi (nextFactor > 0)
        if (nextFactor > 0) {
            return Number(cand.factor) * nextFactor;
        }
    }

    // Không tìm thấy đường nào
    return 0;
}