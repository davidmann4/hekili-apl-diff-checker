import { Geist, Geist_Mono, Ubuntu_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

// Use Ubuntu Mono instead of Geist Mono for clearer operator glyphs like >=
const ubuntuMono = Ubuntu_Mono({
  variable: "--font-ubuntu-mono",
  subsets: ["latin"],
  weight: ["400","700"],
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
        className={`${geistSans.variable} ${ubuntuMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
