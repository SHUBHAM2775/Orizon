import type { Metadata } from "next";
import { Fraunces, Geist, IBM_Plex_Mono } from "next/font/google";
import { AuthProvider } from "@/lib/mock-auth";
import { StoreProvider } from "@/lib/mock-store";
import "./globals.css";

/*
 * Fonts — three roles per docs/design-system.md:
 *   - Geist Sans       → body / UI (grotesk, condensed)
 *   - Fraunces         → display / headings / the decision stamp (slab serif)
 *   - IBM Plex Mono    → data / numeric (tabular figures)
 *
 * Each font is exported as a CSS variable; globals.css wires those variables
 * into Tailwind's --font-sans / --font-mono / --font-display tokens.
 */
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  display: "swap",
  // Variable font — let the browser pick weights per usage.
  axes: ["opsz", "SOFT"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Orizon — Credit Underwriting",
  description:
    "Internal credit underwriting & configurable BRE for NBFCs. Rule-driven, explainable decisions on a case file.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${fraunces.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
          <AuthProvider>
            <StoreProvider>{children}</StoreProvider>
          </AuthProvider>
        </body>
    </html>
  );
}
