"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Image from "next/image";

interface FileUploaderProps {
    value: any;
    onChange: (value: any) => void;
    accept?: string;
    maxSize?: number; // in MB
}

export function FileUploader({ value, onChange, accept = "image/*", maxSize = 5 }: FileUploaderProps) {
    const [preview, setPreview] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Check file size (convert maxSize from MB to bytes)
        if (maxSize && file.size > maxSize * 1024 * 1024) {
            setError(`File size exceeds ${maxSize}MB limit`);
            return;
        }

        // Create a preview URL
        const fileUrl = URL.createObjectURL(file);
        setPreview(fileUrl);
        setError(null);
        onChange(file); // Pass the file to the form
    };

    const handleRemove = () => {
        setPreview(null);
        onChange(null);
        if (inputRef.current) {
            inputRef.current.value = "";
        }
    };

    const handleClick = () => {
        inputRef.current?.click();
    };

    return (
        <div className="space-y-2">
            <div 
                className={`border-2 border-dashed rounded-md p-4 flex flex-col items-center justify-center cursor-pointer hover:bg-muted/50 transition-colors ${
                    preview ? "border-muted" : "border-input"
                }`}
                onClick={handleClick}
            >
                {preview ? (
                    <div className="relative w-32 h-32">
                        <Image 
                            src={preview} 
                            alt="Preview" 
                            fill
                            className="object-cover rounded-md"
                        />
                    </div>
                ) : (
                    <div className="py-4 flex flex-col items-center">
                        <svg
                            className="w-8 h-8 text-muted-foreground mb-2"
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                            />
                        </svg>
                        <p className="text-sm text-muted-foreground">
                            Click to upload or drag and drop
                        </p>
                        <p className="text-xs text-muted-foreground">
                            {accept.replace("/*", " files")}
                        </p>
                    </div>
                )}
                <Input
                    ref={inputRef}
                    type="file"
                    accept={accept}
                    className="hidden"
                    onChange={handleFileChange}
                />
            </div>

            {error && <p className="text-destructive text-sm">{error}</p>}

            {preview && (
                <Button 
                    type="button" 
                    variant="outline" 
                    size="sm"
                    onClick={handleRemove}
                >
                    Remove image
                </Button>
            )}
        </div>
    );
} 