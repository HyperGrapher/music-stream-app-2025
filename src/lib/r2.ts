import { S3Client } from "@aws-sdk/client-s3";
import { env } from "@/env";

export const r2Client = new S3Client({
  region: "auto",
  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  },
  // Since AWS SDK v3.729 a default of "WHEN_SUPPORTED" bakes `x-amz-checksum-crc32` of an EMPTY
  // body into presigned PUT URLs, which cannot match the file the browser later uploads. Only
  // compute checksums when an operation requires them (Cloudflare's recommendation for R2).
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});
