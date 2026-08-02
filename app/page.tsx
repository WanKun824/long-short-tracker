import type { Metadata } from "next";
import { PortfolioExplorer } from "./components/PortfolioExplorer";

export const metadata: Metadata = {
  title: "13F数据库｜美国机构投资者持仓",
  description: "面向中文用户的美国机构投资者13F数据库，提供完整披露持仓、持仓权重、组合集中度、基金经理资料与申报更新提醒。",
};

export default function Home() {
  return <PortfolioExplorer />;
}
