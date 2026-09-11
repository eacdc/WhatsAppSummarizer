/**
 * Placeholder credentials so importing src/config.ts doesn't throw in tests.
 * Nothing here reaches a real service — every test that touches Mongo, Maytapi
 * or the LLM uses a fake.
 */
process.env.MONGODB_URI_WA ??= 'mongodb://localhost:27017/test';
process.env.MAYTAPI_PRODUCT_ID ??= 'test-product';
process.env.MAYTAPI_PHONE_ID ??= '0';
process.env.MAYTAPI_TOKEN ??= 'test-token';
process.env.DASHBOARD_BASE_URL ??= 'http://localhost:3000';
