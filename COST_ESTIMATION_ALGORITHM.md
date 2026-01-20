# 💰 Thuật Toán Ước Tính Chi Phí Tối Ưu Cho Chuyến Đi

## 📌 Tổng Quan

Hệ thống tính chi phí tối ưu cho chuyến đi **BeroTravel** dựa trên cấu trúc dữ liệu phân cấp:
- **Journey**: Chuyến đi (N ngày)
- **Day**: Ngày thứ N (chứa N stops)
- **Stop**: Địa điểm cụ thể với thời gian và chi phí

---

## 🏗️ Kiến Trúc Chi Phí

### 1️⃣ **Accommodation Cost** (Chi phí lưu trú)

**Nguồn dữ liệu:**
```typescript
// Từ bookings module
- InventoryUnit (place_id, base_price, unit_type)
- Availability (date, price_override, available_count)
```

**Công thức:**
```
accommodation_cost = Σ(nightly_rate × nights)

nightly_rate = average(price_override || base_price) for each night

nights = (checkout_date - checkin_date) / 86400000 (milliseconds in a day)
```

**Ví dụ:**
```
- Check-in: 2026-01-20
- Check-out: 2026-01-23 (3 ngày)
- Base rate: 500,000 VND/night
- Price override ngày 21-22: 600,000 VND (peak season)

Tính toán:
- Ngày 1 (20/1): 500,000 VND
- Ngày 2 (21/1): 600,000 VND (override)
- Ngày 3 (22/1): 600,000 VND (override)
- TỔNG: 1,700,000 VND
```

**Tối ưu:**
- ✅ Batch query: Lấy tất cả availability records trong khoảng ngày 1 lần
- ✅ Caching: Cache place info để tránh duplicate queries
- ✅ Dynamic pricing: Hỗ trợ price override tự động

---

### 2️⃣ **Dining Cost** (Chi phí ăn uống)

**Nguồn dữ liệu:**
```typescript
// Từ places module
- Place (category = 'RESTAURANT', name)
- JourneyStop (start_time, end_time, place_id)
```

**Logic phân loại:**
```
Dựa vào start_time của stop:
- 06:00 - 11:00 → Breakfast
- 11:00 - 17:00 → Lunch
- 17:00 - 23:00 → Dinner
```

**Chi phí mặc định (COST_RATES):**
```typescript
{
  RESTAURANT: {
    breakfast: 100,000 VND,
    lunch: 150,000 VND,
    dinner: 200,000 VND
  },
  CAFE: {
    breakfast: 50,000 VND,
    lunch: 80,000 VND,
    dinner: 100,000 VND
  },
  STREET_FOOD: {
    breakfast: 30,000 VND,
    lunch: 50,000 VND,
    dinner: 70,000 VND
  }
}
```

**Ví dụ tính toán:**
```
Ngày 1 (21/1):
- 08:00-09:00: Quán phở (breakfast) → 100,000 VND
- 12:00-13:00: Nhà hàng (lunch) → 150,000 VND
- 18:00-19:00: Quán cơm tấm (dinner) → 50,000 VND
- TỔNG ngày 1: 300,000 VND

Chuyến 3 ngày × 300,000 = 900,000 VND tổng ăn
```

**Tối ưu:**
- ✅ Heuristic heuristic thông minh: Dùng thời gian start_time để classify
- ✅ User override: Cho phép user set chi phí cụ thể
- ✅ Smart grouping: Nếu có 2 restaurants cùng time → chọn 1 representative

---

### 3️⃣ **Activity Cost** (Chi phí hoạt động)

**Nguồn dữ liệu:**
```typescript
// Từ journey stops
- JourneyStop.estimated_cost (set by user hoặc auto-calc)
- Place.category (SIGHTSEEING, HIKING, ADVENTURE, etc.)
```

**Chi phí mặc định:**
```typescript
{
  SIGHTSEEING: 150,000 VND,  // Temple, museum entry
  HOTEL: 0 VND,               // No entry cost
  RESTAURANT: 0 VND,          // Covered by dining
  HIKING: 50,000 VND,         // Guide + equipment
  TOUR: 300,000 VND,          // Full-day guided tour
  ADVENTURE: 500,000 VND      // Extreme activities
}
```

**Ví dụ:**
```
Chuyến 3 ngày:

Ngày 1:
- 08:00: Phở (Restaurant) → 0 VND (covered by dining)
- 10:00: Chùa Thầy (Sightseeing) → 150,000 VND
- 14:00: Chèo thuyền (Activity) → 200,000 VND (user set)

Ngày 2:
- 07:00: Tour du lịch (Tour) → 300,000 VND
- 18:00: Quán cơm tấm (Restaurant) → 0 VND

Ngày 3:
- 09:00: Văn Miếu (Sightseeing) → 150,000 VND

TỔNG ACTIVITY: 800,000 VND
```

**Tối ưu:**
- ✅ User input: Cho phép user set estimated_cost khi add stop
- ✅ Smart defaults: Auto-suggest mức giá cho category nếu user ko set
- ✅ Priority levels: Mark "must-do", "optional", "flexible" để user prioritize budget

---

### 4️⃣ **Transportation Cost** (Chi phí vận chuyển)

**Nguồn dữ liệu:**
```typescript
// Từ journey service
- JourneyStop.transit_from_previous (distance, mode, duration)
- Place.location (GeoJSON coordinates)
```

**Formula:**
```
transport_cost = distance_km × cost_rate[mode]

Rates:
- DRIVING: 3,000 VND/km (xăng + hao mòn)
- PUBLIC_TRANSPORT: 1,000 VND/km (bus/train avg)
- WALKING: 0 VND/km (free)
```

**Ví dụ tính toán:**

```
Ngày 1:
- Stop 1 (Phở) → Start: 08:00, End: 09:00
- Stop 2 (Chùa Thầy) → Start: 10:15 (sau 15p + 25p drive)
  - Distance: 8 km
  - Mode: DRIVING
  - Cost: 8 × 3,000 = 24,000 VND

- Stop 3 (Chèo thuyền) → Start: 14:30 (sau 1h transit)
  - Distance: 15 km
  - Mode: DRIVING
  - Cost: 15 × 3,000 = 45,000 VND

Ngày 1 transport: 69,000 VND

---

Giữa ngày 1 → 2:
- Stop cuối ngày 1 (Quán cơm) → Stop đầu ngày 2 (Hotel)
- Distance: 20 km
- Mode: DRIVING
- Cost: 20 × 3,000 = 60,000 VND

TỔNG TRANSPORTATION (3 ngày): ~400,000 VND
```

**Tối ưu:**
- ✅ Batch calculation: Tính tất cả transit costs trong loop duy nhất
- ✅ Smart mode selection: Default DRIVING (có thể user override)
- ✅ Distance caching: Reuse distance từ journey service (đã tính trong recalculateDaySchedule)

---

### 5️⃣ **Group Split Cost** (Chia chi phí nhóm)

**Công thức cơ bản:**
```
cost_per_person = total_cost / member_count
```

**Ví dụ:**
```
Total cost: 3,000,000 VND
Members: 4 người
Cost per person: 750,000 VND

(Nếu chia đều 50-50)
```

**Advanced: Custom Split**
```typescript
// Nếu user muốn chia không đều
{
  user_1: 30%, // 900,000 VND
  user_2: 30%, // 900,000 VND
  user_3: 20%, // 600,000 VND
  user_4: 20%  // 600,000 VND
}

// Hoặc per-item:
// user_1 không tham gia tour → không phải trả tour cost
// user_2 ở hotel cao cấp → trả thêm accommodation
```

**Tối ưu:**
- ✅ Flexible split: Support % hoặc fixed amount
- ✅ Per-item assignment: Track who joins which activity
- ✅ Settlement tracking: Who owes whom

---

## 📊 Cost Summary Structure

```typescript
{
  // Breakdown by category
  total_accommodation: 1,700,000,
  total_dining: 900,000,
  total_activities: 800,000,
  total_transportation: 400,000,
  total_miscellaneous: 0,
  
  // Grand total
  grand_total: 3,800,000,
  
  // Per-person (for 4 members)
  cost_per_person: 950,000,
  
  // Confidence level (based on estimate vs booked ratio)
  confidence_level: "medium"
  // "exact": 90%+ booked
  // "high": 70-90% booked
  // "medium": 40-70% booked
  // "low": <40% booked (mostly estimated)
  
  currency: "VND",
  
  // Details for each category
  details: {
    accommodation: [...],
    dining: [...],
    activities: [...],
    transportation: [...]
  }
}
```

---

## 🔄 Data Flow & Dependencies

```
Journey Module (journey.service.ts)
    ↓
Journey Entity {
    days: JourneyDay[] {
        stops: JourneyStop[] {
            place_id (ref to Places)
            estimated_cost
            start_time, end_time
            transit_from_previous {
                distance_km
                mode (DRIVING/WALKING/PUBLIC_TRANSPORT)
            }
        }
    }
}
    ↓
Cost Estimation Service
    ↓
┌─────────────────────────────────────────────┐
│ Parallel Queries (Optimization)             │
├─────────────────────────────────────────────┤
│ 1. Places repo.find({_id: {$in: placeIds}}) │
│ 2. Units repo.find({place_id})              │
│ 3. Availability repo.find({date range})     │
└─────────────────────────────────────────────┘
    ↓
Calculate Costs (5 categories)
    ↓
Aggregate & Return CostEstimationBreakdown
```

---

## ⚡ Performance Optimization

### 1. **Batch Queries (N+1 Prevention)**
```typescript
❌ BAD:
for (const stop of stops) {
  const place = await placeRepo.findOne(stop.place_id); // N queries
}

✅ GOOD:
const placeIds = stops.map(s => s.place_id);
const places = await placeRepo.find({_id: {$in: placeIds}}); // 1 query
const placeMap = new Map(places.map(p => [p._id, p]));
```

### 2. **Parallel Execution**
```typescript
❌ SEQUENTIAL:
const accommodations = await calculateAccommodation(...)
const dining = await calculateDining(...)
const activities = await calculateActivities(...)
// Total time = T1 + T2 + T3

✅ PARALLEL:
const [accommodations, dining, activities] = await Promise.all([
  calculateAccommodation(...),
  calculateDining(...),
  calculateActivities(...)
]);
// Total time = max(T1, T2, T3)
```

### 3. **Caching Place Info**
```typescript
// Inside estimateJourneyBudget
const placeCache = new Map<string, Place>();

async function getPlace(placeId: string): Promise<Place> {
  if (!placeCache.has(placeId)) {
    const place = await placeRepo.findOne(placeId);
    placeCache.set(placeId, place);
  }
  return placeCache.get(placeId);
}
```

### 4. **Lazy Calculation**
```typescript
// Only calculate costs that user needs
estimateJourneyBudget(journeyId, {
  includeAccommodation: true,
  includeDining: true,
  includeActivities: true,
  includeTransportation: false, // Skip if not needed
})
```

---

## 📋 Integration Points

### Places Module
- **Input**: Place.category, Place.priceLevel
- **Usage**: Classify stops, determine default costs

### Bookings Module
- **Input**: InventoryUnit (base_price), Availability (price_override)
- **Usage**: Calculate accommodation costs with dynamic pricing

### Journey Module
- **Input**: JourneyStop (estimated_cost, start_time, transit_from_previous)
- **Usage**: Core data source for all calculations

### Group Module
- **Input**: Group.members count
- **Usage**: Calculate per-person split

---

## 🔒 Data Accuracy & Confidence Levels

| Level | Threshold | Meaning |
|-------|-----------|---------|
| **Exact** | 90%+ | Almost all costs are booked/confirmed |
| **High** | 70-90% | Most costs estimated from reasonable data |
| **Medium** | 40-70% | Mix of booked and estimated |
| **Low** | <40% | Mostly estimated, few confirmations |

**Calculation:**
```typescript
confidence_level = (booked_items / total_items)

// Example:
// Accommodation: BOOKED ✓
// Dining: ESTIMATED (using default rates)
// Activities: 50% booked, 50% estimated
// Transportation: ESTIMATED

confidence = (1 + 0.5) / 4 = 37.5% → "low"
```

---

## 🎯 Future Enhancements

1. **AI-powered recommendations**
   - ML model predicts realistic costs based on historical data
   - "80% of travelers spend 1.2-1.5M for this itinerary"

2. **Price comparison**
   - Real-time pricing from booking.com, agoda, etc.
   - Show alternative options

3. **Budget alerts**
   - Notify when estimated cost exceeds budget
   - Suggest cost-cutting options

4. **Split strategies**
   - Smart splitting: Who goes to which activity
   - Settlement ledger: Track debts between members

5. **Multi-currency support**
   - Auto-convert USD, EUR to VND
   - Show rates used for transparency

---

## 📝 Usage Example

```typescript
// In journey controller
@Get(':id/budget')
async getJourneyBudget(
  @Param('id') journeyId: string,
  @Query('members') memberCount: number = 1
) {
  return await this.costEstimationService.estimateJourneyBudget(
    journeyId,
    true, // includeAccommodation
    memberCount
  );
}

// Response:
{
  summary: {
    total_accommodation: 1700000,
    total_dining: 900000,
    total_activities: 800000,
    total_transportation: 400000,
    grand_total: 3800000,
    cost_per_person: 950000,
    confidence_level: "medium"
  },
  details: {...}
}
```

---

## ✅ Testing Checklist

- [ ] Single day journey
- [ ] Multi-day journey (3-7 days)
- [ ] Journey with no accommodation (day trip)
- [ ] Journey with multiple accommodations (moving hotels)
- [ ] Journey with extreme distances
- [ ] Journey with price overrides
- [ ] Empty journey (no stops)
- [ ] Group split with 1, 2, 4, 10 members
- [ ] Different place categories (all types)
- [ ] Parallel execution performance
