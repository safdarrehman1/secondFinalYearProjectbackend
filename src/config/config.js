const dotenv = require("dotenv");
const path = require("path");
const Joi = require("joi");

dotenv.config({ path: path.join(__dirname, "../../.env") });

// Render/Atlas examples often use MONGO_URI or MONGO_URL. Normalize them so
// the rest of the app can keep using the existing MONGODB_URL config key.
process.env.MONGODB_URL =
  process.env.MONGODB_URL || process.env.MONGO_URI || process.env.MONGO_URL;

const envVarsSchema = Joi.object()
  .keys({
    NODE_ENV: Joi.string()
      .valid("production", "development", "test")
      .required(),
    PORT: Joi.number().default(3000),
    MONGODB_URL: Joi.string()
      .required()
      .description("Mongo DB url")
      .messages({
        "any.required":
          "MONGODB_URL is required. In Render, add your MongoDB Atlas connection string as MONGODB_URL, MONGO_URI, or MONGO_URL.",
        "string.empty":
          "MONGODB_URL is empty. In Render, add your MongoDB Atlas connection string as MONGODB_URL, MONGO_URI, or MONGO_URL.",
      }),
    JWT_SECRET: Joi.string()
      .required()
      .description("JWT secret key")
      .messages({
        "any.required": "JWT_SECRET is required. Add a long random secret in Render environment variables.",
        "string.empty": "JWT_SECRET is empty. Add a long random secret in Render environment variables.",
      }),
    JWT_ACCESS_EXPIRATION_MINUTES: Joi.number()
      .default(30)
      .description("minutes after which access tokens expire"),
    JWT_ACCESS_EXPIRATION_HOURS: Joi.number()
      .default(1)
      .description("hours after which access tokens expire"),
    JWT_REFRESH_EXPIRATION_DAYS: Joi.number()
      .default(30)
      .description("days after which refresh tokens expire"),
    JWT_RESET_PASSWORD_EXPIRATION_MINUTES: Joi.number()
      .default(10)
      .description("minutes after which reset password token expires"),
    JWT_VERIFY_EMAIL_EXPIRATION_MINUTES: Joi.number()
      .default(10)
      .description("minutes after which verify email token expires"),
    RESEND_API_KEY: Joi.string()
      .required()
      .description("Resend API key")
      .messages({
        "any.required": "RESEND_API_KEY is required. Add it in Render environment variables.",
        "string.empty": "RESEND_API_KEY is empty. Add it in Render environment variables.",
      }),
    EMAIL_FROM: Joi.string().allow("").optional().description(
      "the from field in the emails sent by the app",
    ),
    // Square configuration
    SQUARE_APPLICATION_ID: Joi.string().allow("").optional().description("Square application ID"),
    SQUARE_APPLICATION_SECRET: Joi.string().allow("").optional().description(
      "Square application secret",
    ),
    SQUARE_ENVIRONMENT: Joi.string()
      .valid("sandbox", "production")
      .default("sandbox")
      .description("Square environment"),
    SQUARE_REDIRECT_URI: Joi.string().allow("").optional().description("Square OAuth redirect URI"),
    // Stripe configuration
    STRIPE_PUBLISHABLE_KEY: Joi.string().allow("").optional().description("Stripe publishable key"),
    STRIPE_SECRET_KEY: Joi.string().allow("").optional().description("Stripe secret key"),
    FRONTEND_URL: Joi.string().allow("").optional().description("Frontend application URL"),
    // Groq AI configuration
    GROQ_API_KEY: Joi.string().allow("").optional().description("Groq API key"),
    GROQ_MODEL: Joi.string()
      .default("mixtral-8x7b-32768")
      .description("Groq model to use"),
    GROQ_MAX_TOKENS: Joi.number()
      .default(2048)
      .description("Maximum tokens for Groq response"),
    GROQ_TEMPERATURE: Joi.number()
      .default(0.8)
      .description("Temperature for Groq response"),
    // Admin configuration
    ADMIN_EMAIL: Joi.string()
      .email()
      .default("admin@example.com")
      .description("Admin email"),
    ADMIN_PASSWORD: Joi.string()
      .default("password123") // Ensure this meets password requirements
      .description("Admin password"),
  })
  .unknown();

const { value: envVars, error } = envVarsSchema
  .prefs({ errors: { label: "key" } })
  .validate(process.env);

// console.log("Loaded environment variables:", envVars);

if (error) {
  throw new Error(`Config validation error: ${error.message}`);
}

module.exports = {
  env: envVars.NODE_ENV,
  port: envVars.PORT,
  mongoose: {
    url: envVars.MONGODB_URL + (envVars.NODE_ENV === "test" ? "-test" : ""),
    options: {
      useCreateIndex: true,
      useNewUrlParser: true,
      useUnifiedTopology: true,
      useFindAndModify: false,
    },
  },
  jwt: {
    secret: envVars.JWT_SECRET,
    accessExpirationMinutes: envVars.JWT_ACCESS_EXPIRATION_MINUTES,
    accessExpirationHours: envVars.JWT_ACCESS_EXPIRATION_HOURS,
    refreshExpirationDays: envVars.JWT_REFRESH_EXPIRATION_DAYS,
    resetPasswordExpirationMinutes:
      envVars.JWT_RESET_PASSWORD_EXPIRATION_MINUTES,
    verifyEmailExpirationMinutes: envVars.JWT_VERIFY_EMAIL_EXPIRATION_MINUTES,
  },
  email: {
    resendApiKey: envVars.RESEND_API_KEY,
    from: envVars.EMAIL_FROM,
  },
  square: {
    applicationId: envVars.SQUARE_APPLICATION_ID,
    applicationSecret: envVars.SQUARE_APPLICATION_SECRET,
    environment: envVars.SQUARE_ENVIRONMENT,
    redirectUri: envVars.SQUARE_REDIRECT_URI,
  },
  stripe: {
    publishableKey: envVars.STRIPE_PUBLISHABLE_KEY,
    secretKey: envVars.STRIPE_SECRET_KEY,
  },
  frontend: {
    url: envVars.FRONTEND_URL,
  },
  groq: {
    apiKey: envVars.GROQ_API_KEY,
    model: envVars.GROQ_MODEL,
    maxTokens: envVars.GROQ_MAX_TOKENS,
    temperature: envVars.GROQ_TEMPERATURE,
  },
  admin: {
    email: envVars.ADMIN_EMAIL,
    password: envVars.ADMIN_PASSWORD,
  },
  wise: {
    host: process.env.WISE_API_HOST,
    token: process.env.WISE_TOKEN,
    profileId: process.env.WISE_PROFILE_ID,
    sourceCurrency: process.env.WISE_SOURCE_CURRENCY,
  },
};
