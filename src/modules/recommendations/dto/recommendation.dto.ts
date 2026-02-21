import { IsNumber, IsString, IsOptional, IsArray, Min, Max } from 'class-validator';

export class GetRecommendedPlacesDto {
  @IsNumber()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number = 10;

  @IsNumber()
  @Min(0)
  @IsOptional()
  skip?: number = 0;

  @IsString()
  @IsOptional()
  category?: string;

  @IsArray()
  @IsOptional()
  tags?: string[];

  @IsNumber()
  @IsOptional()
  maxDistance?: number; // in kilometers

  @IsNumber()
  @IsOptional()
  latitude?: number;

  @IsNumber()
  @IsOptional()
  longitude?: number;
}

export class GoalBasedRecommendationDto {
  @IsString()
  days: number;

  @IsNumber()
  @IsOptional()
  budget?: number; // in currency

  @IsString()
  @IsOptional()
  travelStyle?: 'budget' | 'comfort' | 'luxury';

  @IsString()
  @IsOptional()
  pace?: 'relaxed' | 'moderate' | 'fast';
}

export class RecommendedPlaceDto {
  _id: string;
  name: string;
  description: string;
  category: string[];
  tags: string[];
  image_url?: string;
  average_rating?: number;
  review_count?: number;
  matching_score: number; // 0-100, why this place was recommended
  matching_tags: string[]; // which user tags matched
  estimated_cost?: number;
  distance?: number;
}

export class AutoItineraryDto {
  days: number;
  budget?: number;
  travelStyle?: 'budget' | 'comfort' | 'luxury';
  pace?: 'relaxed' | 'moderate' | 'fast';
  startDate?: Date;
}

export class AutoItineraryResponseDto {
  journey_id?: string;
  days: Array<{
    day_number: number;
    stops: Array<{
      place_id: string;
      name: string;
      category: string[];
      estimated_duration: number; // minutes
      estimated_cost: number;
      suggested_time: string; // HH:MM format
    }>;
    total_cost: number;
    travel_time: number; // minutes
  }>;
  total_budget: number;
  estimated_distance: number;
}
