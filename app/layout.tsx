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
    default: "持仓镜｜全球顶级投资机构13F持仓追踪",
    template: "%s｜持仓镜",
  },
  description: "用中文看懂全球顶级资本的最新持仓、投资方法与风险。",
  openGraph: {
    title: "持仓镜｜看懂全球顶级资本的每一次下注",
    description: "八家代表性投资机构，完整13F持仓与中文策略解读。",
    type: "website",
    locale: "zh_CN",
  },
  twitter: {
    card: "summary_large_image",
    title: "持仓镜｜看懂全球顶级资本的每一次下注",
    description: "八家代表性投资机构，完整13F持仓与中文策略解读。",
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
