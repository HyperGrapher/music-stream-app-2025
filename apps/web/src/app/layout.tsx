import "@/styles/globals.css";
import { type Metadata, type Viewport } from "next";
import { Geist } from "next/font/google";
import { Toaster } from "@/components/ui/sonner"
import { TRPCReactProvider } from "@/trpc/react";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { AuthProvider } from "@/components/AuthProvider";
import { ServerNavbar } from "./_components/ServerNavbar";

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#0A0A0A',
};

export const metadata: Metadata = {
  title: "Streaming app",
  description: "Streaming app",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Get session server-side
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  const user = session?.user || null;

  return (
    <html lang="en" className={`${geist.variable}`}>
      <head>
        <script src="https://unpkg.com/react-scan@latest/dist/auto.global.js" />
      </head>
      <body className="dark">
        <TRPCReactProvider>
          <AuthProvider initialUser={user} />
          <ServerNavbar />
          {children}
        </TRPCReactProvider>
        <Toaster
          position="top-right"
          toastOptions={{
            unstyled: true,
            classNames: {
              toast: 'flex items-center gap-3 p-4 rounded-lg text-sm bg-zinc-900/90 border border-zinc-800 shadow-lg backdrop-blur-sm',
              title: 'font-medium text-zinc-100',
              description: 'text-zinc-400 mt-1',
              actionButton: 'px-3 py-1.5 rounded-md bg-cyan-700 hover:bg-cyan-600 text-white font-medium transition-colors',
              cancelButton: 'px-3 py-1.5 rounded-md bg-zinc-700 hover:bg-zinc-600 text-white font-medium transition-colors',
              closeButton: 'text-zinc-400 hover:text-zinc-200 transition-colors',
              success: 'border-l-4 border-l-green-500 pl-3',
              error: 'border-l-4 border-l-red-500 pl-3',
              warning: 'border-l-4 border-l-amber-500 pl-3',
              info: 'border-l-4 border-l-blue-500 pl-3',
              loading: 'border-l-4 border-l-cyan-500 pl-3',
            },
            duration: 5000,
          }}
        />
      </body>
    </html>
  );
}
