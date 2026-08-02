import type { Metadata } from "next";
import { PortfolioExplorer } from "./components/PortfolioExplorer";

export const metadata: Metadata = {
  title: "持仓镜｜全球顶级投资机构13F持仓追踪",
  description: "面向中国投资者的机构持仓研究网站：用中文看懂伯克希尔、Scion、Duquesne、TCI、Baupost、潘兴广场等机构的13F持仓与投资方法。",
};

export default function Home() {
  return <PortfolioExplorer />;
}
