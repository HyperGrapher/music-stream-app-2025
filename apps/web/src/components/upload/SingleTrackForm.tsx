 "use client";

import type { UseFormReturn } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { 
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage
} from "@/components/ui/form";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    RadioGroup,
    RadioGroupItem
} from "@/components/ui/radio-group";
import { GENRES } from "./constants";
import { type SingleTrackFormData } from "./schema";
import { ArtworkUpload } from "./ArtworkUpload";

interface SingleTrackFormProps {
    form: UseFormReturn<SingleTrackFormData>;
}

export function SingleTrackForm({ form }: SingleTrackFormProps) {
    return (
        <div className="space-y-6">
            {/* Track Title */}
            <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                    <FormItem>
                        <FormLabel>Track Title</FormLabel>
                        <FormControl>
                            <Input placeholder="Enter track title" {...field} />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                )}
            />
            
            {/* Artwork Image */}
            <FormField
                control={form.control}
                name="artwork"
                render={({ field }) => (
                    <FormItem>
                        <FormControl>
                            <ArtworkUpload 
                                onArtworkUploaded={field.onChange}
                                existingArtworkUrl={field.value}
                            />
                        </FormControl>
                        <FormDescription>
                            Upload a square image (recommended: 1000x1000px)
                        </FormDescription>
                        <FormMessage />
                    </FormItem>
                )}
            />
            
            {/* Genre */}
            <FormField
                control={form.control}
                name="genre"
                render={({ field }) => (
                    <FormItem>
                        <FormLabel>Genre</FormLabel>
                        <Select 
                            onValueChange={field.onChange} 
                            defaultValue={field.value}
                        >
                            <FormControl>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select a genre" />
                                </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                                {GENRES.map((genre) => (
                                    <SelectItem key={genre.value} value={genre.value}>{genre.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <FormMessage />
                    </FormItem>
                )}
            />
            
            {/* Tags */}
            <FormField
                control={form.control}
                name="tags"
                render={({ field }) => (
                    <FormItem>
                        <FormLabel>Tags (optional)</FormLabel>
                        <FormControl>
                            <Input placeholder="electronic, ambient, chill" {...field} />
                        </FormControl>
                        <FormDescription>
                            Add comma-separated tags to help people discover your track
                        </FormDescription>
                        <FormMessage />
                    </FormItem>
                )}
            />
            
            {/* Description */}
            <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                    <FormItem>
                        <FormLabel>Description (optional)</FormLabel>
                        <FormControl>
                            <Textarea 
                                placeholder="Add some details about your track..."
                                className="min-h-[100px]"
                                {...field} 
                            />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                )}
            />
            
            {/* Privacy */}
            <FormField
                control={form.control}
                name="privacy"
                render={({ field }) => (
                    <FormItem className="space-y-3">
                        <FormLabel>Privacy</FormLabel>
                        <FormControl>
                            <RadioGroup
                                onValueChange={field.onChange}
                                defaultValue={field.value}
                                className="flex flex-col space-y-1"
                            >
                                <FormItem className="flex items-center space-x-3 space-y-0">
                                    <FormControl>
                                        <RadioGroupItem value="public" />
                                    </FormControl>
                                    <FormLabel className="font-normal">
                                        Public
                                    </FormLabel>
                                </FormItem>
                                <FormItem className="flex items-center space-x-3 space-y-0">
                                    <FormControl>
                                        <RadioGroupItem value="private" />
                                    </FormControl>
                                    <FormLabel className="font-normal">
                                        Private
                                    </FormLabel>
                                </FormItem>
                            </RadioGroup>
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                )}
            />
        </div>
    );
}
