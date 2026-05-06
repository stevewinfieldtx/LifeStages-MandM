import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "The Meaningful Message",
  description:
    "Turn a Sunday sermon into a 10-minute digital discipleship message. Fully automated."
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
