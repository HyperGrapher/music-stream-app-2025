"use client";
import { useState } from "react";
import { FileStepForm } from "./FileStepForm";
import { DetailStepForm } from "./DetailStepForm";

export default function FileUpload() {
    const [files, setFiles] = useState<File[]>([]);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState("");
    const [currentStep, setCurrentStep] = useState(1);

    const handleFilesSelected = (selectedFiles: File[]) => {
        setFiles(selectedFiles);
        setCurrentStep(2);
    };

    const handleBack = () => {
        setCurrentStep(1);
    };

    return (
        <div className="w-full max-w-2xl mx-auto pb-20">
            {currentStep === 1 ? (
                <FileStepForm onFilesSelected={handleFilesSelected} />
            ) : (
                <DetailStepForm 
                    files={files} 
                    onBack={handleBack}
                    uploading={uploading}
                    setUploading={setUploading}
                    error={error}
                    setError={setError}
                />
            )}
        </div>
    );
}
