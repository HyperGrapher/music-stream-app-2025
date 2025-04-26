import { z } from "zod";
import jwt from "jsonwebtoken";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { r2Client } from "@/lib/r2";
import { db } from "@/server/db";
import { env } from "@/env";
import {
    createTRPCRouter,
    protectedProcedure,
} from "@/server/api/trpc";

export const uploadRouter = createTRPCRouter({
 
    create: protectedProcedure
        .input(z.object({ track: z.string() }))
        .mutation(({ ctx, input }) => {
           const userId = ctx.session.user.id




            return {  };
        }),
});
