# 📊 Cost Estimation Algorithm - Visual Diagrams

## 1️⃣ High-Level Flow Chart

```
┌─────────────────────────────────────┐
│ User Calls: estimateJourneyBudget() │
│ Input: journeyId, memberCount       │
└────────────────┬────────────────────┘
                 │
        ┌────────▼────────┐
        │ Fetch Journey   │
        │ with all days   │
        │ and stops       │
        └────────┬────────┘
                 │
    ┌────────────┼────────────┐
    │                         │
    │                         │
    ▼                         ▼
┌─────────────────┐   ┌──────────────────┐
│ Accommodation   │   │ Extract all      │
│ Calculation     │   │ place_ids from   │
│                 │   │ stops for batch  │
│ 1. Find units   │   │ query            │
│    by place_id  │   └────────┬─────────┘
│                 │            │
│ 2. Query        │   ┌────────▼──────────┐
│    availability │   │ Batch Query All   │
│    dates        │   │ Places (1 query)  │
│                 │   │ + Units (1 query) │
│ 3. Calc avg     │   │ + Availability    │
│    price/night  │   │   (1 query)       │
│                 │   └────────┬──────────┘
│ 4. Return       │            │
│    subtotal     │            │
└────────┬────────┘            │
         │                      │
         │    ┌─────────────────┘
         │    │
         │    ▼
         │  ┌─────────────────────┐
         │  │ Classify Stops by   │
         │  │ Time:               │
         │  │ - Breakfast: 6-11   │
         │  │ - Lunch: 11-17      │
         │  │ - Dinner: 17-23     │
         │  │                     │
         │  │ Assign Costs:       │
         │  │ - user.estimated    │
         │  │   OR default rates  │
         │  └────────┬────────────┘
         │           │
    ┌────▼────────────▼─────────────────┐
    │ Activity Calculation               │
    │                                    │
    │ 1. Filter non-RESTAURANT stops     │
    │ 2. Get place.category              │
    │ 3. Assign default cost OR          │
    │    use stop.estimated_cost         │
    │ 4. Return array of activities      │
    └────┬─────────────────────────────────┘
         │
         ▼
    ┌─────────────────────────────────────┐
    │ Transportation Calculation          │
    │                                     │
    │ For each day:                       │
    │ - Within-day transit between stops  │
    │   (from transit_from_previous)      │
    │                                     │
    │ - Between-days transit              │
    │   (last stop day X → first stop     │
    │    day X+1)                         │
    │                                     │
    │ Cost = distance_km ×                │
    │        rate[mode]                   │
    └────┬──────────────────────────────────┘
         │
         ▼
    ┌────────────────────────────────────┐
    │ Aggregate & Calculate Summary      │
    │                                    │
    │ sum_accommodation = Σ              │
    │ sum_dining = Σ                     │
    │ sum_activities = Σ                 │
    │ sum_transportation = Σ             │
    │                                    │
    │ grand_total = sum of all           │
    │                                    │
    │ cost_per_person = grand_total /    │
    │                   memberCount      │
    │                                    │
    │ confidence_level = calc based on   │
    │   % of estimated vs booked         │
    └────┬───────────────────────────────┘
         │
         ▼
    ┌───────────────────────────────────┐
    │ Return CostEstimationBreakdown    │
    │ {                                 │
    │   accommodation: [...],           │
    │   dining: [...],                  │
    │   activities: [...],              │
    │   transportation: [...],          │
    │   summary: {                      │
    │     total_*: numbers,             │
    │     grand_total,                  │
    │     cost_per_person,              │
    │     confidence_level              │
    │   }                               │
    │ }                                 │
    └───────────────────────────────────┘
```

---

## 2️⃣ Data Structure Relationships

```
Journey
├── _id: ObjectId
├── name: "Phú Thọ Adventure"
├── start_date: 2026-01-20
├── end_date: 2026-01-22
├── owner_id: "user123"
├── members: ["user123", "user456"]
├── total_budget: 0
│
└── days: JourneyDay[] [
    {
        day_number: 1,
        date: 2026-01-20,
        stops: JourneyStop[] [
            {
                _id: "stop1",
                place_id: "place_phoe" ────┐
                sequence: 1,               │
                start_time: "08:00",       │
                end_time: "09:00",         │
                estimated_cost: 0,         │
                transit_from_previous: null
            },
            {
                _id: "stop2",
                place_id: "place_temple" ─┐
                sequence: 2,               │
                start_time: "10:15",       │
                end_time: "11:30",         │
                estimated_cost: 150000,    │
                transit_from_previous: {   │
                    mode: "DRIVING",       │
                    distance_km: 8,        │
                    duration_minutes: 25,  │
                    from_place_id: ...     │
                }                          │
            }                              │
        ]                                  │
    }                                      │
]                                          │
                                           │
        ┌──────────────────────────────────┘
        │
        ▼
    Places Repo
    ├── place_phoe: {
    │   _id: ObjectId("place_phoe"),
    │   name: "Quán Phở",
    │   category: "RESTAURANT",
    │   location: { type: "Point", coordinates: [105.8, 21.0] },
    │   priceLevel: 2,
    │   address: "...",
    │   ...
    │}
    └── place_temple: {
        _id: ObjectId("place_temple"),
        name: "Chùa Thầy",
        category: "SIGHTSEEING",
        location: { type: "Point", coordinates: [105.9, 21.1] },
        ...
    }


Also need:
    ├─ Bookings (InventoryUnit) for accommodation
    │  └── units: [{
    │      place_id: "place_hotel",
    │      base_price: 500000,
    │      unit_type: "ROOM"
    │  }]
    │
    └─ Bookings (Availability) for dynamic pricing
       └── availability: [{
           unit_id: "unit123",
           date: 2026-01-20,
           price_override: 600000,
           available_count: 3
       }]
```

---

## 3️⃣ Accommodation Cost Calculation Example

```
INPUT:
journey.start_date = 2026-01-20
journey.end_date = 2026-01-22
unit.base_price = 500,000 VND/night

DATABASE:
availability[
  { date: 2026-01-20, price_override: null },
  { date: 2026-01-21, price_override: 600,000 },
  { date: 2026-01-22, price_override: null }
]

CALCULATION:
┌─────────────────────────────────────────┐
│ Date                │ Price             │
├─────────────────────────────────────────┤
│ 2026-01-20 (night 1)│ 500,000 (base)    │
│ 2026-01-21 (night 2)│ 600,000 (override)│
│ 2026-01-22 (night 3)│ 500,000 (base)    │
└─────────────────────────────────────────┘

RESULT:
total_accommodation = 500,000 + 600,000 + 500,000
                    = 1,600,000 VND
nights = 3
avg_nightly_rate = 1,600,000 / 3 ≈ 533,333 VND/night
```

---

## 4️⃣ Dining Cost Classification by Time

```
TIME CLASSIFICATION:

     Breakfast        Lunch           Dinner
     06:00-11:00    11:00-17:00    17:00-23:00
         │              │              │
         ▼              ▼              ▼
    ┌────────┐     ┌──────────┐  ┌──────────┐
    │100,000 │     │150,000   │  │200,000   │
    │ VND    │     │ VND      │  │ VND      │
    │        │     │          │  │          │
    │(or user│     │(or user  │  │(or user  │
    │defined)│     │defined)  │  │defined)  │
    └────────┘     └──────────┘  └──────────┘

JOURNEY DAY EXAMPLE:

08:30 ─ Phở ──────────────────────┐
       |                          ├─ BREAKFAST: 100,000 VND
       └─ Classification: 6-11 ───┘

12:45 ─ Nhà Hàng ─────────────────┐
       |                          ├─ LUNCH: 150,000 VND
       └─ Classification: 11-17 ──┘

18:30 ─ Cơm Tấm ───────────────────┐
       |                           ├─ DINNER: 70,000 VND (STREET_FOOD rate)
       └─ Classification: 17-23 ───┘

TOTAL FOR DAY 1: 100,000 + 150,000 + 70,000 = 320,000 VND
```

---

## 5️⃣ Transportation Cost Calculation

```
WITHIN-DAY TRANSPORTATION:

Stop 1: Phở
├─ location: [105.80, 21.00]
└─ end_time: 09:00

        ↓ 
    Distance calc (Haversine)
        ↓

Stop 2: Chùa Thầy
├─ location: [105.88, 21.05]
├─ transit_from_previous: {
│  distance_km: 8,
│  mode: DRIVING,
│  duration_minutes: 25
│}
└─ Cost: 8 × 3,000 = 24,000 VND


BETWEEN-DAYS TRANSPORTATION:

Day 1 Last Stop: Chùa Thầy
├─ location: [105.88, 21.05]
└─ end_time: 11:30

        ↓ (24h gap)

Day 2 First Stop: Hotel
├─ location: [105.82, 21.02]
└─ Distance: ~8 km
└─ Cost: 8 × 3,000 = 24,000 VND


SUMMARY:
┌──────────────────────────────────────────┐
│ TRANSPORTATION BREAKDOWN                 │
├──────────────────────────────────────────┤
│ Day 1:                                   │
│  - Stop 1→2: 8km × 3,000 = 24,000 VND   │
│  - Stop 2→3: 15km × 3,000 = 45,000 VND  │
│  Subtotal: 69,000 VND                    │
│                                          │
│ Day 2:                                   │
│  - Stop 1→2: 10km × 3,000 = 30,000 VND  │
│  Subtotal: 30,000 VND                    │
│                                          │
│ Day 1→2 (between): 8km × 3,000 = 24,000 │
│                                          │
│ TOTAL: 123,000 VND                       │
└──────────────────────────────────────────┘
```

---

## 6️⃣ Group Split Breakdown

```
SCENARIO: 4-person journey, total 3,800,000 VND

EQUAL SPLIT (Simple):
┌─────────────────────────────────────────┐
│ Người dùng  │ Chi phí        │ % Chia   │
├─────────────────────────────────────────┤
│ User 1     │ 950,000 VND    │ 25%      │
│ User 2     │ 950,000 VND    │ 25%      │
│ User 3     │ 950,000 VND    │ 25%      │
│ User 4     │ 950,000 VND    │ 25%      │
└─────────────────────────────────────────┘


CUSTOM SPLIT (Advanced - User 3 doesn't attend Day 1):
┌───────────────────────────────────────────────────┐
│ COST CATEGORY     │ TOTAL      │ WHO PAYS          │
├───────────────────────────────────────────────────┤
│ Accommodation     │1,700,000 VND│ User 1,2,3,4     │
│ Dining Day 1      │  320,000 VND│ User 1,2,4 only  │
│ Dining Day 2-3    │  500,000 VND│ User 1,2,3,4     │
│ Activities        │  800,000 VND│ User 1,2,3,4     │
│ Transportation    │  480,000 VND│ User 1,2,3,4     │
└───────────────────────────────────────────────────┘

CALCULATION:
User 1: 1,700/4 + 320/3 + 500/4 + 800/4 + 480/4 = 1,048,000 VND
User 2: 1,700/4 + 320/3 + 500/4 + 800/4 + 480/4 = 1,048,000 VND
User 3: 1,700/4 +   0   + 500/4 + 800/4 + 480/4 =   878,000 VND
User 4: 1,700/4 + 320/3 + 500/4 + 800/4 + 480/4 = 1,048,000 VND
                                          TOTAL = 3,800,000 VND ✓
```

---

## 7️⃣ Confidence Level Calculation

```
CONFIDENCE_LEVEL = (booked_items / total_items) × 100

EXAMPLE JOURNEY:
┌────────────────────┬─────────┬──────────┬────────┐
│ CATEGORY           │ BOOKED  │ ESTIMATED│ STATUS │
├────────────────────┼─────────┼──────────┼────────┤
│ Accommodation      │ 1       │ 0        │ ✓      │
│ Day 1 Breakfast    │ 0       │ 1        │ ✗      │
│ Day 1 Lunch        │ 1       │ 0        │ ✓      │
│ Day 1 Dinner       │ 0       │ 1        │ ✗      │
│ Day 2 Breakfast    │ 0       │ 1        │ ✗      │
│ Day 2 Lunch        │ 0       │ 1        │ ✗      │
│ Day 2 Dinner       │ 1       │ 0        │ ✓      │
│ Activity 1         │ 0       │ 1        │ ✗      │
│ Activity 2         │ 0       │ 1        │ ✗      │
│ Transportation Day1│ 0       │ 1        │ ✗      │
│ Transportation Day2│ 0       │ 1        │ ✗      │
└────────────────────┴─────────┴──────────┴────────┘

Booked = 4 items
Total = 11 items
Confidence = 4/11 × 100 = 36% → "LOW"

INTERPRETATION:
🟢 Exact (90%+)  : Trust the estimate fully
🟡 High (70-90%) : Pretty reliable
🟠 Medium (40-70%): Take with caution
🔴 Low (<40%)    : Many uncertainties, ask user for more details
```

---

## 8️⃣ Database Query Optimization

```
❌ NAIVE APPROACH (N+1 PROBLEM):

for each stop in journey {
  place = await placeRepo.findOne(stop.place_id)  // N queries
  unit = await unitRepo.findOne(place.place_id)   // N queries
  availability = await availRepo.find(date range) // N queries
}
Total: O(N × 3) queries


✅ OPTIMIZED APPROACH (Batch):

// STEP 1: Extract all unique IDs
const placeIds = new Set();
for (const day of journey.days) {
  for (const stop of day.stops) {
    placeIds.add(stop.place_id);
  }
}

// STEP 2: Single batch queries
const places = await placeRepo.find({
  _id: { $in: Array.from(placeIds) }
});  // 1 query

const units = await unitRepo.find({
  place_id: { $in: Array.from(placeIds) }
});  // 1 query

const availability = await availRepo.find({
  unit_id: { $in: units.map(u => u._id) },
  date: { $gte: journey.start_date, $lte: journey.end_date }
});  // 1 query

// STEP 3: Create maps for O(1) lookup
const placeMap = new Map(places.map(p => [p._id, p]));
const unitMap = new Map(units.map(u => [u.place_id, u]));
const availMap = new Map(availability.map(a => [a.unit_id + a.date, a]));

// STEP 4: Use maps in loops
for (const day of journey.days) {
  for (const stop of day.stops) {
    const place = placeMap.get(stop.place_id); // O(1)
    const unit = unitMap.get(place._id);       // O(1)
    const avail = availMap.get(unit._id + date); // O(1)
  }
}

Total: 3 queries + O(N) processing
```

---

## 9️⃣ Error Handling Flow

```
estimateJourneyBudget(journeyId, memberCount)
    │
    ├─ Journey not found?
    │  └─ THROW: "Journey not found"
    │
    ├─ Journey has no stops?
    │  └─ RETURN: { grand_total: 0, confidence: "exact" }
    │
    ├─ Place not found in DB?
    │  └─ SKIP: Don't include in calculation, log warning
    │
    ├─ Unit.base_price is negative?
    │  └─ USE: 0 (fallback)
    │
    ├─ memberCount < 1?
    │  └─ THROW: "Member count must be >= 1"
    │
    ├─ Division by zero in split?
    │  └─ USE: 0 (cost per person)
    │
    └─ Database query timeout?
       └─ THROW: "Unable to fetch prices, try again"
```

---

## 🔟 Performance Metrics

```
EXPECTED PERFORMANCE:

Single Journey (3 days, 10 stops):
├─ Fetch Journey: ~10ms
├─ Batch Places Query: ~50ms
├─ Batch Units Query: ~30ms
├─ Batch Availability Query: ~40ms
├─ Calculation (5 loops): ~20ms
└─ TOTAL: ~150ms ✓

Large Journey (30 days, 50 stops):
├─ Fetch Journey: ~20ms
├─ Batch Queries: ~150ms
├─ Calculation: ~100ms
└─ TOTAL: ~270ms ✓

Real-time Updates:
- Recalculate when user adds/removes stop: ~150ms
- Show loading indicator to user during calculation
```

---

## 1️⃣1️⃣ Integration Points Summary

```
┌─────────────────────────────────────────────────────────────┐
│                    COST ESTIMATION SERVICE                  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  INPUT: Journey Entity                                     │
│  ├─ days[] × stops[] × place_id, estimated_cost            │
│  └─ time (start_time, end_time)                            │
│                                                             │
│  DEPENDENCIES:                                              │
│  ├─ Places Repo: Get place.category for cost defaults      │
│  ├─ Units Repo: Get base_price for accommodation           │
│  ├─ Availability Repo: Get price_override for dynamics     │
│  └─ Group.members: For cost_per_person calculation         │
│                                                             │
│  OUTPUT: CostEstimationBreakdown                           │
│  ├─ accommodation { unit_id, nights, nightly_rate, ... }   │
│  ├─ dining { breakfast, lunch, dinner costs }              │
│  ├─ activities { estimated_cost per activity }             │
│  ├─ transportation { mode, distance, cost per km }          │
│  └─ summary { totals, per-person, confidence }             │
│                                                             │
│  USAGE PATTERNS:                                            │
│  ├─ Show budget breakdown in Journey detail page           │
│  ├─ Update cost when user edits journey                    │
│  ├─ Compare budgets between different itineraries          │
│  └─ Settlement tracker for group expenses                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```
