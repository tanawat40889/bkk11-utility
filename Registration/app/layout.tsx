import "./globals.css";
import { Noto_Sans_Thai, Prompt } from "next/font/google";

const noto = Noto_Sans_Thai({ subsets: ["thai", "latin"], variable: "--font-noto", display: "swap" });
const prompt = Prompt({ subsets: ["thai", "latin"], weight: ["500", "600", "700"], variable: "--font-prompt", display: "swap" });

export const metadata = { title: "BKK11 เช็คชื่อ" };
export const viewport = { width: "device-width", initialScale: 1, themeColor: "#faf5ec" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={`${noto.variable} ${prompt.variable}`}>
      <body>{children}</body>
    </html>
  );
}
