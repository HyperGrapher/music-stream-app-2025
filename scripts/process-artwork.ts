/**
 * One-off backfill: turns artwork uploaded before processing existed into square WebP
 * renditions (96/320/640 px) and deletes the user-uploaded originals.
 *
 *   pnpm artwork:backfill            # process
 *   pnpm artwork:backfill --dry-run  # list what would be processed
 */
import { S3Client } from "@aws-sdk/client-s3";
import "dotenv/config";

import { backfillArtwork } from "../src/server/modules/media/artwork-backfill";
import { createPrismaClient } from "../src/server/prisma-client";

const db = createPrismaClient(process.env.DATABASE_URL!);
const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});

void backfillArtwork(db, r2, {
  publicBaseUrl: process.env.R2_PUBLIC_BASE_URL || undefined,
  dryRun: process.argv.includes("--dry-run"),
})
  .then(({ processed, failed }) => {
    for (const p of processed) {
      console.log(`${p.id}  ${p.from} -> ${p.to} [${p.widths.join(", ")}]${p.sourceDeleted ? " (original deleted)" : ""}`);
    }
    for (const f of failed) console.error(`FAILED ${f.id} ${f.storageKey}: ${f.error}`);
    console.log(`${processed.length} processed, ${failed.length} failed`);
    if (failed.length) process.exitCode = 1;
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => void db.$disconnect());
