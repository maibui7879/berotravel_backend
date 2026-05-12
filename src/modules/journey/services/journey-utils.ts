export class JourneyUtils {
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
    const R = 6371; 
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Number((R * c).toFixed(1));
  }

  static timeToMinutes(time: string | null | undefined): number {
    const safeTime = time || '00:00'; 
    const [h, m] = safeTime.split(':').map(Number);
    return h * 60 + m;
  }

  static addMinutesToTime(time: string | null | undefined, mins: number): string {
    const totalMinutes = this.timeToMinutes(time || '08:00') + mins;
    const h = Math.floor((totalMinutes / 60) % 24);
    const m = Math.floor(totalMinutes % 60);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  }

  static getDurationMinutes(startTime: string, endTime: string): number {
    const start = this.timeToMinutes(startTime);
    let end = this.timeToMinutes(endTime);
    if (end < start) end += 1440; 
    return end - start;
  }

  static compareTime(t1: string | null | undefined, t2: string | null | undefined): number {
    return this.timeToMinutes(t1) - this.timeToMinutes(t2);
  }
}