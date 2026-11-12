import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Token tool",
  description: "UAL design tokens: one source of truth.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <body>{children}</body>
    </html>
  );
}
