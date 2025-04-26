// app/api/upload/route.js
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { r2Client } from "@/lib/r2";
import { NextResponse, NextRequest } from "next/server";
import { db } from "@/server/db";
import { env } from "@/env";


export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const file = formData.get("file");

        if (!file || typeof file === "string") {
            return NextResponse.json({ error: "No valid file provided" }, { status: 400 });
        }

        // Now TypeScript knows this is a File or Blob, both of which have arrayBuffer()
        const buffer = Buffer.from(await file.arrayBuffer());
        const filename = `${Date.now()}-${file instanceof File ? file.name : 'unknown'}`;

        await r2Client.send(
            new PutObjectCommand({
                Bucket: env.R2_BUCKET_NAME!,
                Key: filename,
                Body: buffer,
                ContentType: file instanceof File ? file.type : 'application/octet-stream',
            })
        );


        const fileUrl = `https://${env.R2_BUCKET_NAME}.r2.cloudflarestorage.com/${filename}`;

        console.log("🔋 File uploaded successfully:", fileUrl);


        // Save the file URL to the database
        // await db.track.create({
        //     data: {
        //         audioUrl: fileUrl,
        //         userId: "user-id", // Replace with actual user ID from your auth system
        //         // Add other fields as necessary
        //     },
        //     });

        return NextResponse.json({ success: true, fileUrl });
    } catch (error) {
        console.error("Upload error:", error);
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}

export const config = {
    api: {
        bodyParser: false,
    },
};