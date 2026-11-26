"use client";
import { hardNavigate } from "@/lib/navigate";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { AudioLines, ChevronDown, Copyright, Heart, Info, Keyboard, Library, LogOut, MessageSquare, MoreHorizontal, Scale, Settings, ShieldCheck, Smartphone, User, Users } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useUser } from "@/hooks/useUser";
import { useDialogs } from "@/store/dialogs";
import { toast } from "sonner";
import { SearchBox } from "@/components/SearchBox";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { MessageBell } from "@/components/messages/MessageBell";

type User = {
  id: string;
  name?: string | null;
  username?: string | null;
  email?: string | null;
  image?: string | null;
  role?: "USER" | "ADMIN";
};

interface NavbarProps {
  initialUser: User | null;
}

export function Navbar({ initialUser }: NavbarProps) {
  const { user, signOut } = useUser();

  // Use initial user data for first render, then use store data after hydration
  const displayUser = user || initialUser;
  const role = displayUser?.role;

  const handleSignOut = async () => {
    await signOut();
    toast.success("Signed out successfully");
    // Server components (navbar, pages) must see the signed-out state.
    hardNavigate("/");
  };

  return (
    <nav className="flex items-center justify-between border-b border-zinc-800/90 bg-black p-3 text-white">
      {/* Left section - Logo and navigation */}
      <div className="flex items-center space-x-6">
        <Link href="/" className="flex items-center" aria-label="Music Stream home">
          <div className="mr-2 h-8 w-8">
            <svg viewBox="0 0 24 24" fill="white">
              <path d="M4.75 18.25a.75.75 0 0 1-.75-.75V7.5a.75.75 0 0 1 1.5 0v10a.75.75 0 0 1-.75.75ZM7.25 17a.75.75 0 0 1-.75-.75V8.75a.75.75 0 0 1 1.5 0v7.5a.75.75 0 0 1-.75.75ZM9.75 17a.75.75 0 0 1-.75-.75v-7.5a.75.75 0 0 1 1.5 0v7.5a.75.75 0 0 1-.75.75ZM12.25 17a.75.75 0 0 1-.75-.75v-7.5a.75.75 0 0 1 1.5 0v7.5a.75.75 0 0 1-.75.75ZM14.75 17a.75.75 0 0 1-.75-.75V8.75a.75.75 0 0 1 1.5 0v7.5a.75.75 0 0 1-.75.75ZM17.25 17a.75.75 0 0 1-.75-.75V8.75a.75.75 0 0 1 1.5 0v7.5a.75.75 0 0 1-.75.75ZM19.75 18.25a.75.75 0 0 1-.75-.75V7.5a.75.75 0 0 1 1.5 0v10a.75.75 0 0 1-.75.75Z" />
            </svg>
          </div>
        </Link>
        <div className="flex items-center space-x-6">
          <Link
            href="/"
            className="hidden font-medium transition-colors hover:text-orange-500 md:block"
          >
            Home
          </Link>
          <Link
            href="/discover"
            className="hidden font-medium transition-colors hover:text-orange-500 md:block"
          >
            Discover
          </Link>
          <Link href="/charts" className="hidden font-medium transition-colors hover:text-orange-500 md:block">
            Charts
          </Link>
          {displayUser && (
            <Link href="/feed" className="hidden font-medium transition-colors hover:text-orange-500 md:block">
              Feed
            </Link>
          )}
          {displayUser && (
            <Link href="/you/library" className="hidden font-medium transition-colors hover:text-orange-500 md:block">
              Library
            </Link>
          )}
        </div>
      </div>

      {/* Center section - Search */}
      <div className="mx-6 hidden max-w-md flex-1 md:flex">
        <SearchBox />
      </div>

      {/* Right section - Actions */}
      <div className="flex items-center space-x-4">
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
            <NotificationBell />
            <MessageBell />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="gap-0.5 rounded-full p-1 hover:bg-zinc-800 data-[state=open]:bg-zinc-800" aria-label="Account menu">
                  <Avatar className="h-8 w-8 ring-2 ring-transparent transition group-hover:ring-orange-500">
                    <AvatarImage src={displayUser.image || ""} />
                    <AvatarFallback>
                      {displayUser.name?.charAt(0) || "U"}
                    </AvatarFallback>
                  </Avatar>
                  <ChevronDown className="ml-1 h-4 w-4 text-zinc-400" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <div className="flex items-center gap-3 px-2.5 pt-1.5 pb-2.5">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={displayUser.image || ""} />
                    <AvatarFallback>{displayUser.name?.charAt(0) || "U"}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">{displayUser.name ?? "Your account"}</p>
                    {displayUser.username ? <p className="truncate text-xs text-zinc-400">@{displayUser.username}</p> : null}
                  </div>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild><Link href={displayUser.username ? `/${displayUser.username}` : "/profile"}><User /> Profile</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link href="/you/likes"><Heart /> Likes</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link href="/you/following"><Users /> Following</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link href="/you/library"><Library /> Library</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link href="/messages"><MessageSquare /> Messages</Link></DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild><Link href="/studio/tracks"><AudioLines /> Studio</Link></DropdownMenuItem>
                {role === "ADMIN" && (
                  <DropdownMenuItem asChild><Link href="/admin"><ShieldCheck /> Admin</Link></DropdownMenuItem>
                )}
                <DropdownMenuItem asChild><Link href="/settings/profile"><Settings /> Settings</Link></DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => void handleSignOut()}><LogOut /> Sign out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

          </>
        ) : (
          <div className="flex gap-2">
            <Button asChild variant="ghost" className="text-sm hover:text-orange-500">
              <Link href="/signin">Sign in</Link>
            </Button>
            <Button asChild className="bg-orange-700 text-sm text-white hover:bg-orange-800">
              <Link href="/signup">Sign up</Link>
            </Button>
          </div>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="rounded-full p-2 hover:bg-zinc-800 data-[state=open]:bg-zinc-800"
              aria-label="More"
            >
              <MoreHorizontal className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Music Stream</DropdownMenuLabel>
            <DropdownMenuItem><Info /> About us</DropdownMenuItem>
            <DropdownMenuItem><Scale /> Legal</DropdownMenuItem>
            <DropdownMenuItem><Copyright /> Copyright</DropdownMenuItem>
            <DropdownMenuItem><Smartphone /> Mobile app</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => useDialogs.getState().setShortcutsOpen(true)}><Keyboard /> Keyboard shortcuts</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </nav>
  );
}
