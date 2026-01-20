// Định nghĩa vai trò người dùng
export enum Role {
  USER = 'USER',
  ADMIN = 'ADMIN',
  MERCHANT = 'MERCHANT',
}

// Trạng thái của địa điểm (Place)
export enum PlaceStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

// Danh mục địa điểm
export enum PlaceCategory {
  HOTEL = 'HOTEL',
  RESTAURANT = 'RESTAURANT',
  SIGHTSEEING = 'SIGHTSEEING',
}

// Trạng thái đặt chỗ (Booking)
export enum BookingStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  CANCELLED = 'CANCELLED',
}

// Nguồn dữ liệu
export enum DataSource {
  INTERNAL = 'INTERNAL',
  GOOGLE = 'GOOGLE',
  USER_CONTRIBUTED = 'USER_CONTRIBUTED',
}

// Metadata Keys cho Decorators
export const IS_PUBLIC_KEY = 'isPublic';
export const ROLES_KEY = 'roles';