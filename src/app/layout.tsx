import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "THB Search Studio",
  description: "Internal search growth and content tool (local)",
};

const NAV = [["/", "Home"], ["/opportunities", "Opportunities"], ["/studio", "Content Studio"], ["/inventory", "Inventory"], ["/evidence", "Evidence"], ["/sellers", "Seller briefs"], ["/brand", "Brand facts"], ["/audit", "Blog audit"]];

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <nav className="flex gap-4 border-b px-6 py-3 text-sm">
          {NAV.map(([href, label]) => <Link key={href} href={href} className="underline-offset-2 hover:underline">{label}</Link>)}
        </nav>
        <div className="p-6">{children}</div>
      </body>
    </html>
  );
}
