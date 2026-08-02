import type { Metadata } from "next";
import { headers } from "next/headers";
import { Newsreader, Noto_Sans_SC, Noto_Serif_SC } from "next/font/google";
import "./globals.css";

const sans = Noto_Sans_SC({
  variable: "--font-sans-cn",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "900"],
});

const serif = Noto_Serif_SC({
  variable: "--font-serif-cn",
  subsets: ["latin"],
  weight: ["600", "700", "900"],
});

const editorial = Newsreader({
  variable: "--font-editorial",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export async function generateMetadata(): Promise<Metadata> {
  const incoming = await headers();
  const host = incoming.get("x-forwarded-host") ?? incoming.get("host") ?? "localhost:3000";
  const protocol = incoming.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return {
  metadataBase: new URL(`${protocol}://${host}`),
  title: {
    default: "13F数据库｜美国机构投资者持仓",
    template: "%s｜13F数据库",
  },
  description: "美国机构投资者13F披露持仓、组合集中度、基金经理资料与更新提醒。",
  openGraph: {
    title: "13F数据库｜美国机构投资者持仓",
    description: "8家代表性投资机构的完整13F持仓、组合数据与中文资料。",
    type: "website",
    locale: "zh_CN",
  },
  twitter: {
    card: "summary_large_image",
    title: "13F数据库｜美国机构投资者持仓",
    description: "8家代表性投资机构的完整13F持仓、组合数据与中文资料。",
  },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body className={`${sans.variable} ${serif.variable} ${editorial.variable}`}>{children}</body>
    </html>
  );
}
