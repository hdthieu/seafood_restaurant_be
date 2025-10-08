
export enum UserRole {
  MANAGER = 'MANAGER',
  CASHIER = 'CASHIER',
  WAITER = 'WAITER',
  KITCHEN = 'KITCHEN',
}

export enum UserStatus {
  NEW = 'NEW',              // Vừa tạo, chưa kích hoạt (chờ xác thực hoặc admin duyệt)
  ACTIVE = 'ACTIVE',        // Đang hoạt động bình thường
  INACTIVE = 'INACTIVE',    // Tạm khóa bởi quản lý
  DELETED = 'DELETED',      // Đã xóa (soft-delete)
}

export enum InventoryAction {
  IMPORT = 'IMPORT',
  EXPORT = 'EXPORT',
  ADJUST = 'ADJUST',       // điều chỉnh chênh lệch
  WASTE = 'WASTE',
  IN = 'IN',
  OUT = 'OUT',
}

export enum Country {
  VietNam = 'VietNam',
  USA = 'USA',
  Canada = 'Canada',
}

export enum OrderStatus {
  PENDING = 'PENDING',            // Đơn mới được tạo, chưa xác nhận
  CONFIRMED = 'CONFIRMED',        // Nhân viên phục vụ đã xác nhận đơn
  PREPARING = 'PREPARING',        // Bếp đang chế biến
  READY = 'READY',                // Món đã nấu xong, chờ phục vụ mang ra
  SERVED = 'SERVED',              // Đã phục vụ xong cho bàn
  PAID = 'PAID',                  // Đã thanh toán
  CANCELLED = 'CANCELLED',        // Đơn bị hủy (khách hủy hoặc admin)
}

export enum SupplierStatus { ACTIVE = 'ACTIVE', INACTIVE = 'INACTIVE' }

export enum TableStatus {
  ACTIVE = 'ACTIVE',     // Đang hoạt động
  INACTIVE = 'INACTIVE', // Tạm ngưng
}

export enum AreaStatus {
  AVAILABLE = 'AVAILABLE',   // Đang hoạt động, cho phép đặt bàn
  UNAVAILABLE = 'UNAVAILABLE', // Không hoạt động (tạm ngưng)
  MAINTENANCE = 'MAINTENANCE', // Đang bảo trì (tùy chọn)
  FULL = 'FULL'  // Đầy bàn
}

export enum OrderType {
  DINE_IN = 'DINE_IN',
  TAKE_AWAY = 'TAKE_AWAY'
}

export enum InvoiceStatus {
  UNPAID = 'UNPAID',
  PARTIAL = 'PARTIAL',
  PAID = 'PAID',
}

export enum PaymentMethod {
  CASH = 'CASH',
  CARD = 'CARD',
  VNPAY = 'VNPAY',
   VIETQR = 'VIETQR',
}

export enum PaymentStatus {
  PENDING = 'PENDING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
}

//Khách hàng 
export enum CustomerType { PERSONAL = 'PERSONAL', COMPANY = 'COMPANY' }
export enum Gender { MALE = 'MALE', FEMALE = 'FEMALE', OTHER = 'OTHER' }



// Trạng thái 
export enum ItemStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  PREPARING = 'PREPARING',
  READY = 'READY',
  SERVED = 'SERVED',
  CANCELLED = 'CANCELLED',
}

export enum ReceiptStatus { DRAFT = 'DRAFT', POSTED = 'POSTED', PAID = 'PAID', CANCELLED = 'CANCELLED', OWING = 'OWING' }

export enum DiscountType {
  AMOUNT = 'AMOUNT',   // giảm số tiền (VND)
  PERCENT = 'PERCENT', // giảm theo %
}

export enum CategoryType { MENU = 'MENU', INGREDIENT = 'INGREDIENT' }





export enum MoneySource {
  CASH = 'CASH',
  BANK = 'BANK',
}

export enum VoucherKind {
  RECEIPT = 'RECEIPT', // Thu
  PAYMENT = 'PAYMENT', // Chi
}

export enum PostingState {
  DRAFT = 'DRAFT',
  POSTED = 'POSTED',
  CANCELLED = 'CANCELLED',
}

export enum DiscountTypePromotion { PERCENT='PERCENT', AMOUNT='AMOUNT', GIFT='GIFT' }
export enum ApplyWith    { ORDER='ORDER', CATEGORY='CATEGORY', ITEM='ITEM' }

// 'HH:mm' local time
export type TimeRange = { start: string; end: string };
export type Target    = { type: 'CATEGORY'|'ITEM'|'TABLE'|'AREA'; id: string };
export type Gift      = { itemId: string; quantity: number };

export type PromotionRules = {
  daysOfWeek?: number[];      // 0..6 (0 = CN)
  timeRanges?: TimeRange[];   // nhiều khung giờ
  birthday?: 'DAY'|'MONTH'|null; // sinh nhật cho khách

  // điều kiện khi discountType=GIFT
  gifts?: Gift[];           
  maxGiftQty?: number | null; // giới hạn quà tặng
  minItemQty?: number | null; // mua ≥ N món trong targets thì áp dụng
};
