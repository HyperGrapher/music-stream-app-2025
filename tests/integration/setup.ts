/**
 * Loaded with `node --import` BEFORE any app module, so the app's validated env
 * and db client point at the test database. Integration tests only run when
 * TEST_DATABASE_URL is set explicitly, so they can never touch dev/prod data by accident.
 */
import "dotenv/config";

const url = process.env.TEST_DATABASE_URL;
if (!url) {
  console.log("TEST_DATABASE_URL is not set: skipping integration tests.");
  process.exit(0);
}

process.env.DATABASE_URL = url;
process.env.SKIP_ENV_VALIDATION = "1";
process.env.BETTER_AUTH_SECRET ??= "integration-test-secret-integration-test-secret";
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
process.env.R2_BUCKET_NAME ??= "test-bucket";
