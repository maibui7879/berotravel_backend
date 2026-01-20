import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production').default('development'),
  PORT: Joi.number().default(3000),
  MONGO_URI: Joi.string().required(),
  DB_NAME: Joi.string().required().default('berotravel'),
  GEMINI_API_KEY: Joi.string().required(),
  JWT_SECRET: Joi.string().required(),
});