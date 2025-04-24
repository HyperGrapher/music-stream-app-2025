"use client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Bell, 
  ChevronDown, 
  Mail, 
  MoreHorizontal, 
  Search, 
  Upload
} from "lucide-react";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useUser } from "@/hooks/useUser";
import { useState } from "react";
import { toast } from "sonner";

type User = {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
};

interface NavbarProps {
  initialUser: User | null;
}

export function Navbar({ initialUser }: NavbarProps) {
    const { user, signIn, signUp, signOut, authError } = useUser();
    const [isAuthLoading, setIsAuthLoading] = useState(false);
    
    // Use initial user data for first render, then use store data after hydration
    const displayUser = user || initialUser;

    const handleSignIn = async () => {
      setIsAuthLoading(true);
      try {
        await signIn.google({
          onError: (error) => {
            toast.error(error.message);
          }
        });
      } finally {
        setIsAuthLoading(false);
      }
    };

    const handleSignUp = async () => {
      setIsAuthLoading(true);
      try {
        await signUp.google({
          onError: (error) => {
            toast.error(error.message);
          }
        });
      } finally {
        setIsAuthLoading(false);
      }
    };

    const handleSignOut = async () => {
      await signOut();
      toast.success("Signed out successfully");
    };

    return (
        <nav className="flex items-center justify-between p-3 bg-black text-white border-b border-zinc-800/90">
            {/* Left section - Logo and navigation */}
            <div className="flex items-center space-x-6">
                <Link href="/" className="flex items-center">
                    <div className="w-8 h-8 mr-2">
                        <svg viewBox="0 0 24 24" fill="white">
                            <path d="M4.75 18.25a.75.75 0 0 1-.75-.75V7.5a.75.75 0 0 1 1.5 0v10a.75.75 0 0 1-.75.75ZM7.25 17a.75.75 0 0 1-.75-.75V8.75a.75.75 0 0 1 1.5 0v7.5a.75.75 0 0 1-.75.75ZM9.75 17a.75.75 0 0 1-.75-.75v-7.5a.75.75 0 0 1 1.5 0v7.5a.75.75 0 0 1-.75.75ZM12.25 17a.75.75 0 0 1-.75-.75v-7.5a.75.75 0 0 1 1.5 0v7.5a.75.75 0 0 1-.75.75ZM14.75 17a.75.75 0 0 1-.75-.75V8.75a.75.75 0 0 1 1.5 0v7.5a.75.75 0 0 1-.75.75ZM17.25 17a.75.75 0 0 1-.75-.75V8.75a.75.75 0 0 1 1.5 0v7.5a.75.75 0 0 1-.75.75ZM19.75 18.25a.75.75 0 0 1-.75-.75V7.5a.75.75 0 0 1 1.5 0v10a.75.75 0 0 1-.75.75Z" />
                        </svg>
                    </div>
                </Link>
                <div className="hidden md:flex items-center space-x-6">
                    <Link href="/" className="font-medium hover:text-orange-500 transition-colors">Home</Link>
                    <Link href="/feed" className="font-medium hover:text-orange-500 transition-colors">Feed</Link>
                    <Link href="/library" className="font-medium hover:text-orange-500 transition-colors">Library</Link>
                </div>
            </div>

            {/* Center section - Search */}
            <div className="hidden md:flex flex-1 max-w-md mx-6">
                <div className="relative w-full">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                    <Input 
                        placeholder="Search" 
                        className="pl-10 pr-4 py-2 bg-gray-800 text-white border-none rounded-md w-full focus:ring-1 focus:ring-orange-500"
                    />
                </div>
            </div>

            {/* Right section - Actions */}
            <div className="flex items-center space-x-4">
                <Button variant="outline" className="hidden md:flex border-orange-500 text-orange-500 hover:bg-orange-500 hover:text-white transition-colors">
                    Upgrade now
                </Button>
                
                <Link href="/for-artists" className="hidden md:block text-sm text-gray-300 hover:text-white transition-colors">
                    For Artists
                </Link>
                
                <Button variant="ghost" className="hidden sm:flex items-center gap-1 hover:text-orange-500 transition-colors">
                    <Upload className="h-4 w-4" />
                    <span className="hidden md:inline">Upload</span>
                </Button>
                
                {displayUser ? (
                    <>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" className="p-1 hover:bg-gray-800">
                                    <Avatar className="h-8 w-8">
                                        <AvatarImage src={displayUser.image || ''} />
                                        <AvatarFallback>{displayUser.name?.charAt(0) || 'U'}</AvatarFallback>
                                    </Avatar>
                                    <ChevronDown className="ml-1 h-4 w-4 text-gray-400" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="bg-gray-900 text-white border-gray-800">
                                <DropdownMenuItem className="hover:bg-gray-800">Profile</DropdownMenuItem>
                                <DropdownMenuItem className="hover:bg-gray-800">Settings</DropdownMenuItem>
                                <DropdownMenuItem className="hover:bg-gray-800"
                                    onClick={handleSignOut}>
                                    Sign out
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                        
                        <Button variant="ghost" className="p-2 hover:bg-gray-800 rounded-full">
                            <Bell className="h-5 w-5" />
                        </Button>
                        
                        <Button variant="ghost" className="p-2 hover:bg-gray-800 rounded-full">
                            <Mail className="h-5 w-5" />
                        </Button>
                    </>
                ) : (
                    <div className="flex gap-2">
                        <Button variant="ghost" 
                            className="text-sm hover:text-orange-500"
                            onClick={handleSignIn}
                            disabled={isAuthLoading}>
                            Sign in
                        </Button>
                        <Button 
                            className="text-sm bg-orange-500 hover:bg-orange-600"
                            onClick={handleSignUp}
                            disabled={isAuthLoading}>
                            Sign up
                        </Button>
                    </div>
                )}
                
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="p-2 hover:bg-gray-800 rounded-full">
                            <MoreHorizontal className="h-5 w-5" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-gray-900 text-white border-gray-800">
                        <DropdownMenuItem className="hover:bg-gray-800">About us</DropdownMenuItem>
                        <DropdownMenuItem className="hover:bg-gray-800">Legal</DropdownMenuItem>
                        <DropdownMenuItem className="hover:bg-gray-800">Copyright</DropdownMenuItem>
                        <DropdownMenuItem className="hover:bg-gray-800">Mobile app</DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </nav>
    );
}

