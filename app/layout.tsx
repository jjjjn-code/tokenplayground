import type { Metadata } from "next";
import { Suspense } from "react";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppSidebar } from "./_components/AppSidebar";
import { Gate } from "./_components/Gate";
import { StoreProvider } from "./_lib/store";
import "./globals.css";

export const metadata: Metadata = {
  title: "Token Library",
  description: "UAL design tokens: one source of truth.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <body className="font-sans">
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
          <TooltipProvider delayDuration={300}>
            <StoreProvider>
              <div className="flex h-dvh overflow-hidden">
                <Suspense>
                  <AppSidebar />
                </Suspense>
                <div className="flex min-w-0 flex-1 flex-col">
                  <Gate>{children}</Gate>
                </div>
              </div>
              <Toaster position="bottom-center" />
            </StoreProvider>
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
