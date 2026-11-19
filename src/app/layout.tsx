import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import { themeInitScript } from "@/components/theme/theme";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const mono = JetBrains_Mono({ variable: "--font-jetbrains-mono", subsets: ["latin"] });
const display = Space_Grotesk({ variable: "--font-space-grotesk", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Unstakd", template: "%s · Unstakd" },
  description: "Push a repo, get a live app.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${mono.variable} ${display.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
