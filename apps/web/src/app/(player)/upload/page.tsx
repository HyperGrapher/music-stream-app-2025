
import FileUpload from "@/components/upload";
import { Suspense } from 'react';


const UploadPage = () => {
    return (
        <div>
            <div className="flex-1 flex flex-col pb-[-61px] overflow-hidden pt-0 relative">
                <div className="h-[1px] bg-red-500 w-full absolute bottom-0 left-0 z-50"></div>
                <div className="min-w-max">
                    <Suspense fallback={<div className="w-full" />}>
                        <h1 className="text-2xl font-bold text-center">Upload</h1>
                        <div className="flex flex-col gap-4 justify-center items-center mt-8">
                            <FileUpload />
                        </div>
                    </Suspense>
                </div>

            </div>
        </div>
    )
}

export default UploadPage