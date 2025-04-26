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
import { GENRES, ALBUM_TYPES, ALBUM_PRIVACY_OPTIONS } from "./constants";
import { type MultipleTrackFormData } from "./schema";
import { ArtworkUpload } from "./ArtworkUpload";

interface MultipleTrackFormProps {
    form: UseFormReturn<MultipleTrackFormData>;
}

export function MultipleTrackForm({ form }: MultipleTrackFormProps) {
    return (
        <div className="space-y-6">
            {/* Album Title */}
            <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                    <FormItem>
                        <FormLabel>Album Title</FormLabel>
                        <FormControl>
                            <Input placeholder="Enter album title" {...field} />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                )}
            />
            
            {/* Album Link (optional) */}
            <FormField
                control={form.control}
                name="link"
                render={({ field }) => (
                    <FormItem>
                        <FormLabel>Custom Link (optional)</FormLabel>
                        <FormControl>
                            <Input placeholder="your-album-link" {...field} />
                        </FormControl>
                        <FormDescription>
                            Create a custom URL (e.g., yourdomain.com/your-album-link)
                        </FormDescription>
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
            
            {/* Album Type */}
            <FormField
                control={form.control}
                name="albumType"
                render={({ field }) => (
                    <FormItem>
                        <FormLabel>Album Type</FormLabel>
                        <Select 
                            onValueChange={field.onChange} 
                            defaultValue={field.value}
                        >
                            <FormControl>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select album type" />
                                </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                                {ALBUM_TYPES.map((type) => (
                                    <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
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
                            Add comma-separated tags to help people discover your album
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
                                placeholder="Add some details about your album..."
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