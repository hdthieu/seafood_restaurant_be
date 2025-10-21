
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

export enum DiscountTypePromotion { PERCENT = 'PERCENT', AMOUNT = 'AMOUNT', GIFT = 'GIFT' }
export enum ApplyWith { ORDER = 'ORDER', CATEGORY = 'CATEGORY', ITEM = 'ITEM' }
export enum AudienceScope {
  ALL = 'ALL',
  POINTS = 'POINTS',
  BIRTHDAY = 'BIRTHDAY',
  COMPANY = 'COMPANY',
  NEW = 'NEW',
}

export enum AttendanceMethod { MANUAL = 'MANUAL', SELF = 'SELF' }
export enum AttendanceStatus {
  ON_TIME = 'ON_TIME',          // Đúng giờ
  LATE = 'LATE',             // Đi muộn / về sớm (có mặt)
  MISSING = 'MISSING',          // Chấm thiếu in/out
  ABSENT = 'ABSENT',           // Nghỉ không phép
  LEAVE = 'LEAVE',            // Nghỉ có phép
}


// chấm công bằng mặt 
export type LivenessStep = 'LEFT' | 'RIGHT' | 'BLINK';
export type EnrollChallenge = { id: string; steps: LivenessStep[]; exp: number };

export const POSE_THRESH = {
  YAW_LEFT: -8,     // quay trái: yaw <= -8°
  YAW_RIGHT: 8,     // quay phải: yaw >= 8°
  PITCH_MIN: -10,   // optional
  PITCH_MAX: 10,
};

export const EYES_CONF_MIN = 70; // % tin cậy tối thiểu khi đọc EyesOpen

export type FaceAttrs =
  | {
    ok: true;
    pose: { yaw: number; pitch: number; roll?: number };
    // đơn giản hoá mắt:
    eyesOpen?: boolean;   // true/false theo Rekognition.EyesOpen.Value
    eyesConf?: number;    // Rekognition.EyesOpen.Confidence
  }
  | { ok: false; reason: 'NO_FACE' | 'IMAGE_BAD' };



export enum StockFilter {
  ALL = 'ALL',                // Tất cả
  BELOW_THRESHOLD = 'BELOW',  // Dưới định mức tồn (quantity < alertThreshold)
  OVER_THRESHOLD = 'OVER',    // Vượt định mức tồn (quantity > alertThreshold)
  IN_STOCK = 'IN_STOCK',      // Còn hàng (quantity > 0)
  OUT_OF_STOCK = 'OUT_OF_STOCK', // Hết hàng (quantity = 0)
}

export enum Channel { DINEIN = 'DINEIN', TAKEAWAY = 'TAKEAWAY', DELIVERY = 'DELIVERY' }



// Dùng cho module Sổ quỹ
export enum CashbookType {
  RECEIPT = 'RECEIPT',
  PAYMENT = 'PAYMENT',
}

export enum CounterpartyGroup {
  CUSTOMER = 'CUSTOMER',
  SUPPLIER = 'SUPPLIER',
  STAFF = 'STAFF',
  DELIVERY_PARTNER = 'DELIVERY_PARTNER',
  OTHER = 'OTHER',
}

export enum SourceModule {
  SALE = 'SALE',
  PURCHASE = 'PURCHASE',
  OTHER = 'OTHER',
}


//socket báo bếp 
// POST /orders/:orderId/notify-items
type NotifyItemsDto = {
  items: Array<{ menuItemId: string; delta: number }>; // số lượng tăng thêm
  priority?: boolean;
};

// POST /orderitems/cancel
type CancelItemsDto = {
  itemIds: string[];
  reason: string;
};