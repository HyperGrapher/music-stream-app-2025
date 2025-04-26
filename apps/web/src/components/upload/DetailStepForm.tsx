"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { singleTrackSchema, multipleTrackSchema, type SingleTrackFormData, type MultipleTrackFormData } from "./schema";
import { SingleTrackForm } from "./SingleTrackForm";
import { MultipleTrackForm } from "./MultipleTrackForm";

interface DetailStepFormProps {
    files: File[];
    onBack: () => void;
    uploading: boolean;
    setUploading: (value: boolean) => void;
    error: string;
    setError: (value: string) => void;
}

export function DetailStepForm({ 
    files, 
    onBack, 
    uploading,
    setUploading,
    error,
    setError
}: DetailStepFormProps) {
    const isSingleTrack = files.length === 1;
    
    // Use the appropriate form schema based on file count
    const singleTrackForm = useForm<SingleTrackFormData>({
        resolver: zodResolver(singleTrackSchema),
        defaultValues: {
            title: files[0]?.name.replace(/\.[^/.]+$/, "") ?? "", // Remove file extension
            privacy: "public",
            genre: "", // Add required field with empty string
        },
    });

    const multipleTrackForm = useForm<MultipleTrackFormData>({
        resolver: zodResolver(multipleTrackSchema),
        defaultValues: {
            title: "",
            privacy: "public",
            albumType: "ALBUM",
            genre: "", // Add required field with empty string
        },
    });

    // Define type-specific handlers to avoid casting
    const handleSingleTrackSubmit = async (data: SingleTrackFormData) => {
        await handleFormSubmit(data);
    };
    
    const handleMultipleTrackSubmit = async (data: MultipleTrackFormData) => {
        await handleFormSubmit(data);
    };
    
    const handleFormSubmit = async (data: SingleTrackFormData | MultipleTrackFormData) => {
        setUploading(true);
        setError("");

        try {
            // This is just a placeholder. Actual upload logic will be implemented later
            console.log("Form data:", data);
            console.log("Files to upload:", files);
            
            // Here you would upload files and form data to the server
            // const formData = new FormData();
            // formData.append("data", JSON.stringify(data));
            // files.forEach(file => formData.append("files", file));
            // const response = await fetch("/api/upload", { method: "POST", body: formData });
            
            // For now, just simulate a delay
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            alert("Upload simulated successfully!");
        } catch (err: unknown) {
            setError((err as Error).message || "Upload failed");
        } finally {
            setUploading(false);
        }
    };

    return (
        <Card className="p-6">
            <div className="flex items-center mb-6">
                <Button 
                    variant="outline" 
                    onClick={onBack}
                    disabled={uploading}
                    className="mr-4"
                >
                    Back
                </Button>
                <h2 className="text-2xl font-bold">
                    {isSingleTrack ? "Track Details" : "Album Details"}
                </h2>
            </div>
            
            <div className="mb-4">
                <p className="text-muted-foreground">
                    {isSingleTrack 
                        ? "Fill in the details for your track." 
                        : `Fill in the details for your album with ${files.length} tracks.`}
                </p>
            </div>

            {error && <p className="text-destructive mb-4">{error}</p>}

            {isSingleTrack ? (
                <Form {...singleTrackForm}>
                    <form onSubmit={singleTrackForm.handleSubmit(handleSingleTrackSubmit)} className="space-y-6">
                        <SingleTrackForm form={singleTrackForm} />
                        
                        <Button 
                            type="submit" 
                            disabled={uploading}
                            className="w-full"
                        >
                            {uploading ? "Uploading..." : "Upload Track"}
                        </Button>
                    </form>
                </Form>
            ) : (
                <Form {...multipleTrackForm}>
                    <form onSubmit={multipleTrackForm.handleSubmit(handleMultipleTrackSubmit)} className="space-y-6">
                        <MultipleTrackForm form={multipleTrackForm} />
                        
                        <Button 
                            type="submit" 
                            disabled={uploading}
                            className="w-full"
                        >
                            {uploading ? "Uploading..." : "Upload Album"}
                        </Button>
                    </form>
                </Form>
            )}
        </Card>
    );
} 