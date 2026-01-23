export class JourneyUtils {
  // Config tốc độ
  static readonly TRANSIT_CONFIG = {
    DRIVING: { speed: 35, buffer: 15 },
    WALKING: { speed: 5, buffer: 0 },
    PUBLIC_TRANSPORT: { speed: 25, buffer: 20 },
    FLIGHT: { speed: 600, buffer: 120 },
    BOAT: { speed: 20, buffer: 30 }
  };

  static toRad(value: number): number {
    return (value * Math.PI) / 180;
  }

  static getHaversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Bán kính trái đất (km)
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Number((R * c).toFixed(1));
  }

  static addMinutesToTime(time: string | null | undefined, mins: number): string {
    const safeTime = time || '08:00';
    const [h, m] = safeTime.split(':').map(Number);
    const date = new Date();
    date.setHours(h, m + mins, 0, 0);
    return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
  }

  static compareTime(t1: string | null, t2: string | null): number {
    const time1 = t1 || '00:00';
    const time2 = t2 || '00:00';
    const [h1, m1] = time1.split(':').map(Number);
    const [h2, m2] = time2.split(':').map(Number);
    return h1 * 60 + m1 - (h2 * 60 + m2);
  }
}