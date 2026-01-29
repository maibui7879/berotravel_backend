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
  // LƯU TRÚ
  ACCOMMODATION = 'ACCOMMODATION', 
  HOTEL = 'HOTEL',
  HOSTEL = 'HOSTEL',
  HOMESTAY = 'HOMESTAY',
  RESORT = 'RESORT',
  GUEST_HOUSE = 'GUEST_HOUSE',
  // ĂN UỐNG
  RESTAURANT = 'RESTAURANT',
  CAFE = 'CAFE',
  BAR_PUB = 'BAR_PUB',             // Nightlife: Bar, Pub, Club
  STREET_FOOD = 'STREET_FOOD',     // Đặc sản vỉa hè
  
  // KHÁM PHÁ & VĂN HÓA
  SIGHTSEEING = 'SIGHTSEEING',     // Địa danh, Di tích
  CULTURE = 'CULTURE',             // Bảo tàng, Nhà hát, Triển lãm
  PARK = 'PARK',                   // Công viên, Khu dã ngoại
  
  // TRẢI NGHIỆM & GIẢI TRÍ
  EXPERIENCE = 'EXPERIENCE',       // Workshop, Lớp học nấu ăn, Tour nội đô
  ENTERTAINMENT = 'ENTERTAINMENT', // Rạp phim, Khu vui chơi, Karaoke
  WELLNESS = 'WELLNESS',           // Spa, Massage, Yoga, Gym
  
  // MUA SẮM
  SHOPPING = 'SHOPPING',           // TTTM, Siêu thị
  LOCAL_MARKET = 'LOCAL_MARKET',   // Chợ địa phương, Cửa hàng lưu niệm
  
  // TIỆN ÍCH THIẾT YẾU
  TRANSPORT = 'TRANSPORT',         // Bến xe, Ga tàu, Sân bay, Cho thuê xe
  HEALTH = 'HEALTH',               // Bệnh viện, Hiệu thuốc
  FINANCE = 'FINANCE',             // ATM, Ngân hàng, Đổi tiền
  CONVENIENCE = 'CONVENIENCE',     // Cửa hàng tiện lợi 24/7 (Circle K, Mart)
  LAUNDRY = 'LAUNDRY',             // Giặt là (Khách du lịch cực cần)
  
  OTHER = 'OTHER'
}

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

export enum UserActionType {
  VIEW_DETAILS = 'VIEW_DETAILS',   // Xem chi tiết
  SEARCH_CLICK = 'SEARCH_CLICK',   // Click từ kết quả tìm kiếm
  ADD_TO_FAVORITE = 'ADD_TO_FAVORITE', // Thả tim
  ADD_TO_PLAN = 'ADD_TO_PLAN',     // Thêm vào lịch trình
  CHECK_IN = 'CHECK_IN',           // Check-in thực tế
  BOOKING = 'BOOKING',             // Đặt vé/phòng (Quan trọng nhất)
  RATING_HIGH = 'RATING_HIGH', 
  REMOVE_FROM_PLAN = 'REMOVE_FROM_PLAN', 
  REMOVE_FROM_FAVORITE = 'REMOVE_FROM_FAVORITE'    // Đánh giá 4-5 sao
}

export const ACTION_SCORES: Record<UserActionType, number> = {
  [UserActionType.VIEW_DETAILS]: 0.05,
  [UserActionType.SEARCH_CLICK]: 0.1,
  [UserActionType.ADD_TO_FAVORITE]: 0.5,
  [UserActionType.ADD_TO_PLAN]: 1.0,
  [UserActionType.CHECK_IN]: 2.0,
  [UserActionType.BOOKING]: 3.0,
  [UserActionType.RATING_HIGH]: 1.5,
  [UserActionType.REMOVE_FROM_PLAN]: -1.0, 
  [UserActionType.REMOVE_FROM_FAVORITE]: -0.5
};

// Điểm tối đa cho 1 category (tránh việc 1 sở thích lấn át tất cả)
export const MAX_CATEGORY_SCORE = 10.0;