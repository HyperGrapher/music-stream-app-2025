"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { singleTrackSchema, multipleTrackSchema, type SingleTrackFormData, type MultipleTrackFormData } from "./schema";
import { SingleTrackForm } from "./SingleTrackForm";
import { MultipleTrackForm } from "./MultipleTrackForm";
import { useUploadStore } from "@/store/uploadStore";
import { api } from "@/trpc/react";
import { toast } from "sonner";

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
    const uploadingFiles = useUploadStore(state => state.uploadingFiles);
    const clearFiles = useUploadStore(state => state.clearFiles);
    const getFileByName = useUploadStore(state => state.getFileByName);
    
    // Get the right mutation based on the number of files
    const createTrackMutation = api.upload.createTrack.useMutation({
        onSuccess: () => {
            toast.success("Track uploaded successfully!");
            clearFiles();
        },
        onError: (error) => {
            setError(error.message);
        }
    });
    
    const createAlbumMutation = api.upload.createAlbum.useMutation({
        onSuccess: () => {
            toast.success("Album uploaded successfully!");
            clearFiles();
        },
        onError: (error) => {
            setError(error.message);
        }
    });
    
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
        // Find the corresponding uploaded file
        const uploadedFile = getFileByName(files[0]!.name);
        
        if (!uploadedFile || !uploadedFile.tempUploadId || !uploadedFile.fileKey || uploadedFile.status !== "completed") {
            setError("Upload not completed. Please wait for the upload to finish.");
            return;
        }
        
        setUploading(true);
        setError("");

        try {
            // Submit to create the track
            await createTrackMutation.mutateAsync({
                title: data.title,
                genre: data.genre,
                privacy: data.privacy,
                description: data.description,
                tags: data.tags,
                link: data.link,
                // Use the fileKey and tempUploadId from the upload
                fileKey: uploadedFile.fileKey,
                tempUploadId: uploadedFile.tempUploadId,
                // If artwork was uploaded, include its URL
                artwork: undefined, // Would come from separate artwork upload
            });
            
        } catch (err: unknown) {
            // Error is handled in the mutation onError
        } finally {
            setUploading(false);
        }
    };
    
    const handleMultipleTrackSubmit = async (data: MultipleTrackFormData) => {
        // Check if all files are properly uploaded
        const trackInputs = files.map(file => {
            const uploadedFile = getFileByName(file.name);
            if (!uploadedFile || !uploadedFile.tempUploadId || !uploadedFile.fileKey || uploadedFile.status !== "completed") {
                return null;
            }
            return {
                title: file.name.replace(/\.[^/.]+$/, ""), // Use filename as default title
                fileKey: uploadedFile.fileKey,
                tempUploadId: uploadedFile.tempUploadId,
            };
        }).filter(Boolean);
        
        if (trackInputs.length !== files.length) {
            setError("Not all uploads are completed. Please wait for all uploads to finish.");
            return;
        }
        
        setUploading(true);
        setError("");

        try {
            // Submit to create the album with tracks
            await createAlbumMutation.mutateAsync({
                title: data.title,
                genre: data.genre,
                privacy: data.privacy,
                albumType: data.albumType,
                description: data.description,
                tags: data.tags,
                link: data.link,
                // Use the prepared track inputs
                tracks: trackInputs as any, // TypeScript limitation with the filter(Boolean)
                // If artwork was uploaded, include its URL
                artwork: undefined, // Would come from separate artwork upload
            });
            
        } catch (err: unknown) {
            // Error is handled in the mutation onError
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
                            {uploading ? "Creating Track..." : "Upload Track"}
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
                            {uploading ? "Creating Album..." : "Upload Album"}
                        </Button>
                    </form>
                </Form>
            )}
        </Card>
    );
} 