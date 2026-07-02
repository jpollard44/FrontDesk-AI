import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FrontDesk AI — 24/7 AI receptionist for local businesses",
  description:
    "A white-labeled AI chat assistant that answers customer questions around the clock and captures after-hours leads. $150/month, live in a day.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
