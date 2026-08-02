import type { Metadata } from "next";
import { PortfolioExplorer } from "./components/PortfolioExplorer";

export const metadata: Metadata = {
  title: "LONG / SHORT TRACKER | Institutional 13F Data",
  description: "面向中文用户的美国机构投资者13F数据平台，提供完整披露持仓、持仓权重、组合集中度、基金经理资料与申报更新提醒。",
};

export default function Home() {
  return <PortfolioExplorer />;
}
