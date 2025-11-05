// apply-promotions.dto.ts
export class ApplyPromotionsDto {
    promotionCode?: string | null;
    promotionId?: string | null;
    codes?: string[]; 
    ids?: string[];
}
