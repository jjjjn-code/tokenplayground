import type { Metadata } from "next";
import { Header } from "./_components/Header";
import { StoreProvider } from "./_lib/store";
import "./globals.css";

export const metadata: Metadata = {
  title: "Token tool",
  description: "UAL design tokens: one source of truth.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <body>
        <StoreProvider>
          <Header />
          {children}
        </StoreProvider>
      </body>
    </html>
  );
}
