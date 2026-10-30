import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Private Bookmarks",
  description: "Local-only bookmark manager. Your links never leave your browser.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#0d0f12",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
