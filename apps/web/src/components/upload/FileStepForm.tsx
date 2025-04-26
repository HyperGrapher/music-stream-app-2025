"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

interface FileStepFormProps {
    onFilesSelected: (files: File[]) => void;
}

export function FileStepForm({ onFilesSelected }: FileStepFormProps) {
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const [error, setError] = useState("");

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const filesArray = Array.from(e.target.files);
            
            // Validate files (you can add more validation later)
            const audioFiles = filesArray.filter(file => file.type.startsWith('audio/'));
            if (audioFiles.length !== filesArray.length) {
                setError("Please upload audio files only.");
                return;
            }
            
            setSelectedFiles(audioFiles);
            setError("");
        }
    };

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (selectedFiles.length === 0) {
            setError("Please select at least one file.");
            return;
        }
        
        onFilesSelected(selectedFiles);
    };

    return (
        <Card className="p-6">
            <form onSubmit={handleSubmit}>
                <div className="space-y-4">
                    <div>
                        <h2 className="text-2xl font-bold mb-4">Upload your tracks</h2>
                        <p className="text-muted-foreground mb-6">
                            Select audio files to upload. You can upload a single track or multiple files to create an album.
                        </p>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="files">Select audio files</Label>
                        <Input
                            id="files"
                            type="file"
                            accept="audio/*"
                            multiple
                            onChange={handleFileChange}
                            className="cursor-pointer"
                        />
                        {error && <p className="text-destructive text-sm">{error}</p>}
                        
                        {selectedFiles.length > 0 && (
                            <div className="mt-4">
                                <p className="text-sm font-medium mb-2">Selected files:</p>
                                <ul className="space-y-1">
                                    {selectedFiles.map((file, index) => (
                                        <li key={index} className="text-sm">
                                            {file.name} ({(file.size / (1024 * 1024)).toFixed(2)} MB)
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>

                    <Button 
                        type="submit" 
                        disabled={selectedFiles.length === 0}
                        className="w-full mt-4"
                    >
                        Continue to Details
                    </Button>
                </div>
            </form>
        </Card>
    );
} 