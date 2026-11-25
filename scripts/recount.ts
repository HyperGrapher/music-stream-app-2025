/** `pnpm db:recount`: repairs every denormalised counter from its source rows (PRD 16.4). */
import "dotenv/config";

import { recountAll } from "../src/server/modules/recount";
import { createPrismaClient } from "../src/server/prisma-client";

const db = createPrismaClient(process.env.DATABASE_URL!);
recountAll(db)
  .then(() => console.log("counters and daily statistics recomputed"))
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => void db.$disconnect());
