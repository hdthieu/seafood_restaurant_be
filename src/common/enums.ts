
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

export enum TableStatus {
    ACTIVE = 'ACTIVE',     // Đang hoạt động
    INACTIVE = 'INACTIVE', // Tạm ngưng
}

export enum OrderType {
    DINE_IN = 'DINE_IN',
    TAKE_AWAY = 'TAKE_AWAY'
}