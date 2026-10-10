import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kind Table — Auckland family dining guide",
  description: "A private Auckland dining guide for plant-forward plates, little diners and a shared family visit diary.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
