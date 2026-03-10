import { UserActionType, ACTION_SCORES, MAX_CATEGORY_SCORE } from '../../../common/constants';

// Define DNA Group interface for type safety
export interface DNAGroup {
  id: string;
  keys: string[];
  label: string;
  icon: string;
  color: string;
  catchphrase: string;
  share_template: string;
}

// Cấu hình nhóm DNA dựa trên các tag thực tế quét được từ DB
export const DNA_MAPPING: DNAGroup[] = [
  { 
    id: 'CULTURE', 
    keys: ['ĐỊA ĐIỂM DU LỊCH NỔI TIẾNG', 'ĐIỂM THU HÚT KHÁCH DU LỊCH', 'ĐỊA ĐIỂM DU LỊCH', 'ĐIỂM ĐẾN TÔN GIÁO', 'ĐIỂM MỐC LỊCH SỬ', 'BẢO TÀNG', 'CHÙA', 'BẢO TÀNG QUÂN ĐỘI', 'ĐỊA ĐIỂM LỊCH SỬ', 'BẢO TÀNG LỊCH SỬ'], 
    label: 'lịch sử', icon: '🏛️', color: '#FF9800', 
    catchphrase: 'Bạn có niềm đam mê bất tận với những giá trị truyền thống và lịch sử.',
    share_template: 'Mình là một "Nhà thám hiểm văn hóa" chính hiệu! Thích tìm hiểu những giá trị truyền thống.'
  },
  { 
    id: 'BEACH', 
    keys: ['BIỂN', 'HỒ BƠI', 'VỊNH', 'ĐẢO', 'BEACH'], 
    label: 'biển', icon: '🏖️', color: '#00BCD4', 
    catchphrase: 'Tiếng gọi của đại dương luôn là liều thuốc chữa lành tâm hồn bạn.',
    share_template: 'Tiếng gọi của đại dương luôn là liều thuốc chữa lành tâm hồn mình!'
  },
  { 
    id: 'FOOD', 
    keys: ['NHÀ HÀNG', 'NHÀ HÀNG ĐẶC SẢN', 'STREET FOOD HANOI', 'NHÀ HÀNG NỔI TIẾNG', 'NHÀ HÀNG VIỆT NAM', 'NHÀ HÀNG ĂN NHANH', 'NHÀ HÀNG GIA ĐÌNH', 'NHÀ HÀNG MÓN CHAY', 'NHÀ HÀNG PHỞ', 'NHÀ HÀNG HẢI SẢN', 'RESTAURANT'], 
    label: 'nhà hàng', icon: '🍜', color: '#F44336', 
    catchphrase: 'Với bạn, mỗi chuyến đi là một hành trình khám phá mỹ vị nhân gian.',
    share_template: 'Đam mê khám phá mỹ vị nhân gian chính là mình! Một hốc trưởng thực thụ.'
  },
  { 
    id: 'RELAX', 
    keys: ['QUÁN CÀ PHÊ', 'KHÁCH SẠN', 'CÀ PHÊ ĐẸP', 'SPA MASSAGE UY TÍN', 'CÀ PHÊ ĐẸP PHỐ CỔ', 'CÀ PHÊ', 'SPA MÁT XA', 'SPA', 'SPA SỨC KHỎE', 'CAFE', 'CHILL', 'RELAX'], 
    label: 'chill', icon: '🧘', color: '#009688', 
    catchphrase: 'Bạn tìm kiếm sự an yên và những giây phút nuông chiều bản thân.',
    share_template: 'Mình thuộc hệ "Chill & Relax", đi đâu cũng được miễn là thấy bình yên.'
  },
  { 
    id: 'NATURE', 
    keys: ['THIÊN NHIÊN', 'CÔNG VIÊN', 'VƯỜN', 'PARK', 'NATURE'], 
    label: 'thiên nhiên', icon: '🌿', color: '#4CAF50', 
    catchphrase: 'Bạn là người ăn cỏ thay cơm, luôn khao khát hít thở khí trời tự do.',
    share_template: 'Mình là "Người ăn cỏ thay cơm", luôn khao khát tự do giữa thiên nhiên.'
  },
  { 
    id: 'CHECKIN', 
    keys: ['BAR PUB SÔI ĐỘNG', 'QUÁN BAR', 'QUÁN BAR COCKTAIL', 'QUÁN RƯỢU', 'QUÁN BIA', 'HỘP ĐÊM', 'QUÁN BAR KARAOKE', 'SỐNG ẢO', 'CHECKIN'], 
    label: 'sống ảo', icon: '📸', color: '#E91E63', 
    catchphrase: 'Bạn đi để lưu giữ những khung hình tuyệt mỹ và những khoảnh khắc rạng rỡ.',
    share_template: 'Ở đâu có view đẹp, ở đó có mình! Một "Thánh check-in" thứ thiệt.'
  },
];

export class UserProfileUtils {
  /**
   * Tạo metadata chia sẻ cá nhân hóa dựa trên Persona của user
   */
  static generateShareMetadata(userId: string, topGroup: DNAGroup) {
    return {
      share_text: `${topGroup.share_template} Khám phá Travel DNA của bạn trên BeroTravel ngay!`,
      share_url: `https://berotravel.com/dna/${userId}`
    };
  }

  /**
   * Định danh Persona dựa trên label của nhóm DNA hàng đầu
   */
  static getPersonaLabel(topGroupLabel: string): string {
    const labels: Record<string, string> = {
      'lịch sử': 'Nhà thám hiểm văn hóa',
      'nhà hàng': 'Hốc trưởng',
      'chill': 'Chill guy',
      'sống ảo': 'Bậc thầy Check-in',
      'thiên nhiên': 'Ăn cỏ thay cơm',
      'biển': 'Chúa tể biển cả'
    };
    return labels[topGroupLabel] || 'Lữ khách tự do';
  }

  /**
   * Tìm cấu hình DNA group dựa trên label
   */
  static getDNAGroupByLabel(label: string | undefined): DNAGroup {
    return DNA_MAPPING.find(g => g.label === label) || DNA_MAPPING[4];
  }

  /**
   * Tìm cấu hình DNA group dựa trên ID
   */
  static getDNAGroupById(id: string): DNAGroup | undefined {
    return DNA_MAPPING.find(g => g.id === id);
  }
}