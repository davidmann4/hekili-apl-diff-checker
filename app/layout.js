import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: {
    default: "APL Diff Viewer",
    template: "%s | APL Diff Viewer",
  },
  description: "Compare SimulationCraft APLs with Hekili exports.",
  metadataBase: new URL("https://example.com"), // adjust when deploying
  openGraph: {
    title: "APL Diff Viewer",
    description: "Compare SimulationCraft APLs with Hekili exports.",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "APL Diff Viewer",
    description: "Compare SimulationCraft APLs with Hekili exports.",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
