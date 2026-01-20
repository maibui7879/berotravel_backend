# 🚀 Cost Estimation Implementation Guide

## Quick Start

### 1. Add Service to Journey Module

```typescript
// src/modules/journey/journey.module.ts

import { CostEstimationService } from './services/cost-estimation.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Journey,
      Place,
      InventoryUnit,
      Availability  // ADD THIS
    ]),
    GroupsModule,
    UsersModule,
    BookingsModule  // ADD THIS for accessing Units/Availability
  ],
  controllers: [JourneysController],
  providers: [JourneysService, CostEstimationService],  // ADD SERVICE
  exports: [JourneysService, CostEstimationService]
})
export class JourneysModule {}
```

### 2. Inject Service in Controller

```typescript
// src/modules/journey/journey.controller.ts

import { CostEstimationService } from './services/cost-estimation.service';

@Controller('journeys')
export class JourneysController {
  constructor(
    private readonly journeysService: JourneysService,
    private readonly costEstimationService: CostEstimationService  // ADD
  ) {}

  @Get(':id/budget')
  @Public()
  @ApiOperation({ summary: 'Ước tính chi phí chuyến đi' })
  async getBudget(
    @Param('id') journeyId: string,
    @Query('members') memberCount: number = 1
  ) {
    return await this.costEstimationService.estimateJourneyBudget(
      journeyId,
      true,
      memberCount
    );
  }

  // Optional: Advanced budget with custom options
  @Post(':id/budget/calculate')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Tính chi phí chi tiết với options' })
  async calculateDetailedBudget(
    @Param('id') journeyId: string,
    @Body() options: {
      memberCount: number;
      includeAccommodation?: boolean;
      includeDining?: boolean;
      includeActivities?: boolean;
      includeTransportation?: boolean;
    }
  ) {
    return await this.costEstimationService.estimateJourneyBudget(
      journeyId,
      options.includeAccommodation ?? true,
      options.memberCount
    );
  }
}
```

### 3. Call from Journey Service

```typescript
// src/modules/journey/journey.service.ts

async findOneWithBudget(id: string, memberCount: number = 1): Promise<JourneyWithBudget> {
  const journey = await this.findOne(id);
  const budget = await this.costEstimationService.estimateJourneyBudget(
    id,
    true,
    memberCount
  );
  
  return {
    ...journey,
    budget
  };
}
```

---

## 📋 Testing the Implementation

### Unit Tests

```typescript
// src/modules/journey/services/cost-estimation.service.spec.ts

import { Test } from '@nestjs/testing';
import { CostEstimationService } from './cost-estimation.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Journey, Place, InventoryUnit, Availability } from '../entities';

describe('CostEstimationService', () => {
  let service: CostEstimationService;
  let journeyRepo, placeRepo, unitRepo, availRepo;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        CostEstimationService,
        {
          provide: getRepositoryToken(Journey),
          useValue: { findOne: jest.fn() }
        },
        {
          provide: getRepositoryToken(Place),
          useValue: { find: jest.fn() }
        },
        {
          provide: getRepositoryToken(InventoryUnit),
          useValue: { find: jest.fn() }
        },
        {
          provide: getRepositoryToken(Availability),
          useValue: { find: jest.fn() }
        }
      ]
    }).compile();

    service = module.get(CostEstimationService);
    journeyRepo = module.get(getRepositoryToken(Journey));
    placeRepo = module.get(getRepositoryToken(Place));
    unitRepo = module.get(getRepositoryToken(InventoryUnit));
    availRepo = module.get(getRepositoryToken(Availability));
  });

  it('should calculate accommodation cost', async () => {
    const mockJourney = {
      _id: new ObjectId(),
      days: [{
        stops: [{
          place_id: 'place1',
          estimated_cost: 100000,
          start_time: '08:00',
          end_time: '09:00'
        }]
      }],
      start_date: new Date('2026-01-20'),
      end_date: new Date('2026-01-22')
    };

    journeyRepo.findOne.mockResolvedValue(mockJourney);
    placeRepo.find.mockResolvedValue([]);
    unitRepo.find.mockResolvedValue([{
      _id: new ObjectId(),
      place_id: 'place1',
      base_price: 500000,
      name: 'Hotel ABC'
    }]);
    availRepo.find.mockResolvedValue([]);

    const result = await service.estimateJourneyBudget('journeyId', true, 1);

    expect(result.summary.total_accommodation).toBeGreaterThan(0);
    expect(result.summary.grand_total).toBeGreaterThan(0);
  });

  it('should handle empty journey', async () => {
    const mockJourney = {
      _id: new ObjectId(),
      days: [],
      start_date: new Date(),
      end_date: new Date()
    };

    journeyRepo.findOne.mockResolvedValue(mockJourney);

    const result = await service.estimateJourneyBudget('journeyId', true, 1);

    expect(result.summary.grand_total).toBe(0);
  });

  it('should calculate group split correctly', async () => {
    // Mock journey with total 3,800,000
    const result = await service.estimateJourneyBudget('journeyId', true, 4);

    expect(result.groupSplit.member_count).toBe(4);
    expect(result.groupSplit.cost_per_person).toBe(
      result.groupSplit.total_cost / 4
    );
  });
});
```

### E2E Tests

```typescript
// test/cost-estimation.e2e-spec.ts

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Cost Estimation E2E', () => {
  let app: INestApplication;
  let journeyId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    // Create test journey
    const journeyRes = await request(app.getHttpServer())
      .post('/journeys')
      .set('Authorization', 'Bearer test-token')
      .send({
        name: 'Test Journey',
        start_date: '2026-01-20',
        end_date: '2026-01-22'
      });

    journeyId = journeyRes.body._id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('should estimate journey budget', async () => {
    const res = await request(app.getHttpServer())
      .get(`/journeys/${journeyId}/budget`)
      .query({ members: 4 });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('summary');
    expect(res.body.summary).toHaveProperty('grand_total');
    expect(res.body.summary).toHaveProperty('cost_per_person');
    expect(res.body.groupSplit.member_count).toBe(4);
  });

  it('should update budget when adding stop', async () => {
    const initialBudget = await request(app.getHttpServer())
      .get(`/journeys/${journeyId}/budget`)
      .query({ members: 1 });

    await request(app.getHttpServer())
      .patch(`/journeys/${journeyId}/add-stop`)
      .set('Authorization', 'Bearer test-token')
      .send({
        day_index: 0,
        place_id: 'place123',
        start_time: '08:00',
        end_time: '09:00',
        estimated_cost: 150000
      });

    const updatedBudget = await request(app.getHttpServer())
      .get(`/journeys/${journeyId}/budget`)
      .query({ members: 1 });

    expect(updatedBudget.body.summary.total_activities).toBeGreaterThan(
      initialBudget.body.summary.total_activities
    );
  });
});
```

---

## 🔧 Configuration & Customization

### Add to Environment Variables

```bash
# .env

# Cost Rates (VND)
TRANSPORT_COST_DRIVING=3000
TRANSPORT_COST_PUBLIC=1000

# Default Meal Costs (VND)
DEFAULT_BREAKFAST_COST=100000
DEFAULT_LUNCH_COST=150000
DEFAULT_DINNER_COST=200000

# Currency
COST_ESTIMATION_CURRENCY=VND
```

### Make Rates Configurable

```typescript
// src/configs/cost.config.ts

export const costRatesConfig = () => ({
  transportation: {
    DRIVING: parseInt(process.env.TRANSPORT_COST_DRIVING) || 3000,
    PUBLIC_TRANSPORT: parseInt(process.env.TRANSPORT_COST_PUBLIC) || 1000,
    WALKING: 0
  },
  dining: {
    RESTAURANT: {
      breakfast: parseInt(process.env.DEFAULT_BREAKFAST_COST) || 100000,
      lunch: parseInt(process.env.DEFAULT_LUNCH_COST) || 150000,
      dinner: parseInt(process.env.DEFAULT_DINNER_COST) || 200000
    }
  }
});

// Then in service:
import { ConfigService } from '@nestjs/config';

export class CostEstimationService {
  private costRates;

  constructor(
    private readonly configService: ConfigService,
    // ... other deps
  ) {
    this.costRates = this.configService.get('costRates');
  }
}
```

---

## 📊 API Response Examples

### GET `/journeys/:id/budget?members=4`

```json
{
  "accommodation": {
    "unit_id": "unit_123",
    "unit_name": "Hanoi Gold Hotel",
    "check_in": "2026-01-20T00:00:00Z",
    "check_out": "2026-01-23T00:00:00Z",
    "nights": 3,
    "nightly_rate": 533333,
    "subtotal": 1600000,
    "notes": "3 nights at Hanoi Gold Hotel"
  },
  "dining": [
    {
      "day_number": 1,
      "breakfast": {
        "place": "Phở Cổ",
        "estimated_cost": 100000
      },
      "lunch": {
        "place": "Nhà hàng A",
        "estimated_cost": 150000
      },
      "dinner": {
        "place": "Cơm tấm",
        "estimated_cost": 70000
      },
      "subtotal": 320000
    }
  ],
  "activities": [
    {
      "day_number": 1,
      "sequence": 2,
      "place_name": "Chùa Thầy",
      "place_category": "SIGHTSEEING",
      "estimated_cost": 150000,
      "priority": "flexible"
    }
  ],
  "transportation": [
    {
      "type": "within-day",
      "from_place": "place_phoe",
      "to_place": "place_temple",
      "distance_km": 8,
      "mode": "DRIVING",
      "cost_rate": 3000,
      "estimated_cost": 24000
    }
  ],
  "groupSplit": {
    "total_cost": 3800000,
    "member_count": 4,
    "cost_per_person": 950000
  },
  "summary": {
    "total_accommodation": 1600000,
    "total_dining": 960000,
    "total_activities": 800000,
    "total_transportation": 440000,
    "total_miscellaneous": 0,
    "grand_total": 3800000,
    "cost_per_person": 950000,
    "currency": "VND",
    "confidence_level": "medium"
  }
}
```

---

## 🐛 Debugging & Troubleshooting

### Enable Detailed Logging

```typescript
// In cost-estimation.service.ts

private logger = new Logger(CostEstimationService.name);

async estimateJourneyBudget(...) {
  this.logger.debug(`Estimating budget for journey: ${journeyId}`);

  const journey = await this.journeyRepo.findOne(...);
  this.logger.debug(`Found journey with ${journey.days.length} days`);

  const placeIds = ...;
  this.logger.debug(`Extracting ${placeIds.length} unique places`);

  const places = await this.placeRepo.find(...);
  this.logger.debug(`Fetched ${places.length} places from DB`);

  // ... calculations ...

  this.logger.debug(`Final breakdown: ${JSON.stringify(summary)}`);
  return result;
}
```

### Common Issues & Solutions

| Issue | Cause | Solution |
|-------|-------|----------|
| `grand_total` is 0 | No stops in journey | Add stops with estimated_cost |
| `confidence_level` is "low" | Most costs are estimated | Book accommodations/activities |
| `cost_per_person` is wrong | Wrong memberCount passed | Verify memberCount parameter |
| Database timeout | Too many places to query | Batch queries are implemented |
| Inconsistent price | price_override not applied | Check availability records in DB |

---

## 🚀 Deployment Checklist

- [ ] All tests passing (unit + e2e)
- [ ] .env file configured with cost rates
- [ ] Database has Availability records with prices
- [ ] Journey stops have place_id references
- [ ] Places have correct categories
- [ ] InventoryUnits exist for accommodations
- [ ] Load testing passed (100+ concurrent requests)
- [ ] Error handling covers edge cases
- [ ] Logging configured for production
- [ ] Documentation reviewed

---

## 📈 Future Enhancements

1. **Real-time Price Updates**
   ```typescript
   // Subscribe to booking.com API for live prices
   async getRealTimePrice(placeId: string): Promise<number> {
     return await this.externalPricingService.getLatestPrice(placeId);
   }
   ```

2. **AI-Powered Recommendations**
   ```typescript
   // ML model suggests cost-saving alternatives
   async getSuggestedAlternatives(
     placeName: string,
     maxBudget: number
   ): Promise<Place[]> {
     return this.mlService.recommendAlternatives(placeName, maxBudget);
   }
   ```

3. **Budget vs Actual Tracking**
   ```typescript
   // Compare estimated costs with real expenses
   async trackActualExpenses(journeyId: string): Promise<BudgetVsActual> {
     const budget = await this.estimateJourneyBudget(journeyId);
     const actuals = await this.expenseService.getActualExpenses(journeyId);
     return this.compareAndAnalyze(budget, actuals);
   }
   ```

4. **Multi-Currency Support**
   ```typescript
   async estimateJourneyBudget(
     journeyId: string,
     includeAccommodation: boolean,
     memberCount: number,
     targetCurrency: string = 'VND' // ADD THIS
   ) {
     const result = await this.calculate(...);
     return this.convertCurrency(result, 'VND', targetCurrency);
   }
   ```

---

## 📞 Support & Questions

For issues or questions about the cost estimation algorithm:
1. Check [COST_ESTIMATION_ALGORITHM.md](./COST_ESTIMATION_ALGORITHM.md) for detailed explanation
2. Review [COST_ESTIMATION_DIAGRAMS.md](./COST_ESTIMATION_DIAGRAMS.md) for visual examples
3. Check service tests for usage examples
4. Create an issue with detailed reproduction steps
