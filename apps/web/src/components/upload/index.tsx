"use client";
import { useState } from "react";

export default function FileUpload() {
    const [file, setFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const [fileUrl, setFileUrl] = useState("");
    const [error, setError] = useState("");

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!file) return;

        setUploading(true);
        setError("");

        try {
            const formData = new FormData();
            formData.append("file", file);

            const response = await fetch("/api/upload", {
                method: "POST",
                body: formData,
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || "Upload failed");
            }

            setFileUrl(data.fileUrl);
        } catch (err: unknown) {
            setError((err as Error).message);
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className="max-w-md mx-auto p-4">
            <form onSubmit={handleSubmit}>
                <div className="mb-4">
                    <label className="block mb-2">Select files:</label>
                    <input
                        type="file"
                        onChange={(e) => {
                            if (e.target.files && e.target.files[0]) {
                                setFile(e.target.files[0]);
                            }
                        }}
                        className="border p-2 w-full"
                    />
                </div>
                <button
                    type="submit"
                    disabled={!file || uploading}
                    className="bg-blue-500 text-white px-4 py-2 rounded disabled:bg-gray-300"
                >
                    {uploading ? "Uploading..." : "Upload"}
                </button>
            </form>

            {error && <p className="text-red-500 mt-4">{error}</p>}

            {fileUrl && (
                <div className="mt-4">
                    <p>File uploaded successfully!</p>
                    <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 underline">
                        View uploaded file
                    </a>
                </div>
            )}
        </div>
    );
}