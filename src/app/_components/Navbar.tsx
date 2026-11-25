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
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
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
  const { user, signIn, signUp, signOut } = useUser();
  const [isAuthLoading, setIsAuthLoading] = useState(false);

  // Use initial user data for first render, then use store data after hydration
  const displayUser = user || initialUser;

  const handleSignIn = async () => {
    setIsAuthLoading(true);
    try {
      await signIn.google({
        onError: (error) => {
          toast.error(error.message);
        },
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
        },
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
    <nav className="flex items-center justify-between border-b border-zinc-800/90 bg-black p-3 text-white">
      {/* Left section - Logo and navigation */}
      <div className="flex items-center space-x-6">
        <Link href="/" className="flex items-center">
          <div className="mr-2 h-8 w-8">
            <svg viewBox="0 0 24 24" fill="white">
              <path d="M4.75 18.25a.75.75 0 0 1-.75-.75V7.5a.75.75 0 0 1 1.5 0v10a.75.75 0 0 1-.75.75ZM7.25 17a.75.75 0 0 1-.75-.75V8.75a.75.75 0 0 1 1.5 0v7.5a.75.75 0 0 1-.75.75ZM9.75 17a.75.75 0 0 1-.75-.75v-7.5a.75.75 0 0 1 1.5 0v7.5a.75.75 0 0 1-.75.75ZM12.25 17a.75.75 0 0 1-.75-.75v-7.5a.75.75 0 0 1 1.5 0v7.5a.75.75 0 0 1-.75.75ZM14.75 17a.75.75 0 0 1-.75-.75V8.75a.75.75 0 0 1 1.5 0v7.5a.75.75 0 0 1-.75.75ZM17.25 17a.75.75 0 0 1-.75-.75V8.75a.75.75 0 0 1 1.5 0v7.5a.75.75 0 0 1-.75.75ZM19.75 18.25a.75.75 0 0 1-.75-.75V7.5a.75.75 0 0 1 1.5 0v10a.75.75 0 0 1-.75.75Z" />
            </svg>
          </div>
        </Link>
        <div className="hidden items-center space-x-6 md:flex">
          <Link
            href="/"
            className="font-medium transition-colors hover:text-orange-500"
          >
            Home
          </Link>
          <Link
            href="/feed"
            className="font-medium transition-colors hover:text-orange-500"
          >
            Feed
          </Link>
          <Link
            href="/library"
            className="font-medium transition-colors hover:text-orange-500"
          >
            Library
          </Link>
        </div>
      </div>

      {/* Center section - Search */}
      <div className="mx-6 hidden max-w-md flex-1 md:flex">
        <div className="relative w-full">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 transform text-gray-400" />
          <Input
            placeholder="Search"
            className="w-full rounded-md border-none bg-gray-800 py-2 pr-4 pl-10 text-white focus:ring-1 focus:ring-orange-500"
          />
        </div>
      </div>

      {/* Right section - Actions */}
      <div className="flex items-center space-x-4">
        <Button
          variant="outline"
          className="hidden border-orange-500 text-orange-500 transition-colors hover:bg-orange-500 hover:text-white md:flex"
        >
          Upgrade now
        </Button>

        <Link
          href="/for-artists"
          className="hidden text-sm text-gray-300 transition-colors hover:text-white md:block"
        >
          For Artists
        </Link>

        <Button
          asChild
          variant="ghost"
          className="hidden items-center gap-1 transition-colors hover:text-orange-500 sm:flex"
        >
          <Link
            href="/upload"
            className="font-medium transition-colors hover:text-orange-500"
          >
            Upload
          </Link>
        </Button>

        {displayUser ? (
          <>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="p-1 hover:bg-gray-800">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={displayUser.image || ""} />
                    <AvatarFallback>
                      {displayUser.name?.charAt(0) || "U"}
                    </AvatarFallback>
                  </Avatar>
                  <ChevronDown className="ml-1 h-4 w-4 text-gray-400" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="border-gray-800 bg-gray-900 text-white"
              >
                <DropdownMenuItem asChild className="hover:bg-gray-800">
                  <Link href="/profile">Profile</Link>
                </DropdownMenuItem>
                <DropdownMenuItem className="hover:bg-gray-800">
                  Settings
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="hover:bg-gray-800"
                  onClick={handleSignOut}
                >
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              variant="ghost"
              className="rounded-full p-2 hover:bg-gray-800"
            >
              <Bell className="h-5 w-5" />
            </Button>

            <Button
              variant="ghost"
              className="rounded-full p-2 hover:bg-gray-800"
            >
              <Mail className="h-5 w-5" />
            </Button>
          </>
        ) : (
          <div className="flex gap-2">
            <Button
              variant="ghost"
              className="text-sm hover:text-orange-500"
              onClick={handleSignIn}
              disabled={isAuthLoading}
            >
              Sign in
            </Button>
            <Button
              className="bg-orange-500 text-sm hover:bg-orange-600"
              onClick={handleSignUp}
              disabled={isAuthLoading}
            >
              Sign up
            </Button>
          </div>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="rounded-full p-2 hover:bg-gray-800"
            >
              <MoreHorizontal className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="border-gray-800 bg-gray-900 text-white"
          >
            <DropdownMenuItem className="hover:bg-gray-800">
              About us
            </DropdownMenuItem>
            <DropdownMenuItem className="hover:bg-gray-800">
              Legal
            </DropdownMenuItem>
            <DropdownMenuItem className="hover:bg-gray-800">
              Copyright
            </DropdownMenuItem>
            <DropdownMenuItem className="hover:bg-gray-800">
              Mobile app
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </nav>
  );
}
