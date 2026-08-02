import holdingsJson from "./holdings.json";

export type Holding = {
  ticker: string;
  issuer: string;
  class: string;
  cusip: string;
  valueK: number;
  weight: number;
  shares: number | null;
  principal: number | null;
  option: "PUT" | "CALL" | null;
};

export type FundProfile = {
  id: keyof typeof holdingsJson;
  nameZh: string;
  nameEn: string;
  managerZh: string;
  managerEn: string;
  managerRole: string;
  managerTag: string;
  managerBio: string;
  image: string | null;
  imageSource: string | null;
  location: string;
  category: string;
  style: string;
  risk: "较低" | "中等" | "较高" | "高" | "极高";
  period: string;
  filingDate: string;
  valueBn: number;
  holdingCount: number;
  top5: number;
  accent: string;
  oneLiner: string;
  description: string;
  playbook: string[];
  read13f: string;
  status: "最新申报" | "已知重大变化" | "申报已终止";
  statusNote: string;
  profileSource: string;
  filingSource: string;
  cik: string;
};

export const funds: FundProfile[] = [
  {
    id: "situational-awareness",
    nameZh: "Situational Awareness LP",
    nameEn: "AGI主题投资机构",
    managerZh: "Leopold Aschenbrenner",
    managerEn: "",
    managerRole: "创始人兼首席投资官",
    managerTag: "部分中文媒体称“AI股神”",
    managerBio: "德国出生的AI研究者与投资人，曾任职于OpenAI Superalignment团队。2024年发布长篇研究《Situational Awareness: The Decade Ahead》，随后创立同名AGI主题投资机构。部分中文媒体称他为“AI股神”，这只是媒体标签，并非正式称号。",
    image: "/people/leopold.jpg",
    imageSource: "https://tn.com.ar/tecno/novedades/2026/06/09/quien-es-leopold-aschenbrenner-el-exopenai-que-amaso-us20-mil-millones-con-apenas-24-anos-de-edad/",
    location: "美国 · 旧金山",
    category: "AI主题",
    style: "主题宏观",
    risk: "极高",
    period: "2026 Q1",
    filingDate: "2026-05-18",
    valueBn: 13.68,
    holdingCount: 42,
    top5: 48.7,
    accent: "#35d6b0",
    oneLiner: "用宏观、技术和公司研究，集中押注AI带来的产业重构。",
    description: "2024年成立的AGI主题投资机构。它把AI视为一次横跨算力、存储、数据中心、电力和资本开支的产业重构，并以股票、期权和私人投资表达这一判断。2026年7月公开股票组合被报道已出售，因此当前13F只能作为历史切片。",
    playbook: ["AI产业链主题配置", "多空与期权对冲", "高集中度与高杠杆"],
    read13f: "PUT仓位按标的名义市值披露，不能直接当作基金实际投入金额。",
    status: "已知重大变化",
    statusNote: "2026年7月底有报道称其公开股票组合已出售给Citadel，本页Q1数据仅作历史快照。",
    profileSource: "https://situationalawarenesslp.com/",
    filingSource: "https://13f.info/13f/000204572426000008-situational-awareness-lp-q1-2026",
    cik: "0002045724",
  },
  {
    id: "berkshire-hathaway",
    nameZh: "伯克希尔·哈撒韦",
    nameEn: "Berkshire Hathaway Inc.",
    managerZh: "沃伦·巴菲特",
    managerEn: "Warren Buffett",
    managerRole: "董事长 · 投资体系奠基人",
    managerTag: "现代价值投资代表人物",
    managerBio: "伯克希尔·哈撒韦董事长，也是现代价值投资最具代表性的人物之一。他与Charlie Munger共同形成了“以合理价格买入优秀企业、长期持有”的资本配置体系，并利用保险浮存金建立长期复利优势。",
    image: "/people/warren.jpg",
    imageSource: "https://commons.wikimedia.org/wiki/File:Warren_Buffett_at_the_2015_SelectUSA_Investment_Summit_(cropped).jpg",
    location: "美国 · 奥马哈",
    category: "长期复利",
    style: "质量价值",
    risk: "较低",
    period: "2026 Q1",
    filingDate: "2026-05-15",
    valueBn: 263.1,
    holdingCount: 29,
    top5: 67.1,
    accent: "#d5b35c",
    oneLiner: "以永久资本持有具备护城河、现金流和优秀管理层的企业。",
    description: "伯克希尔并不是传统基金，而是上市控股公司。保险浮存金和经营现金流为其提供长期资本，13F只是整个集团资产的一部分。",
    playbook: ["优质企业长期持有", "保险浮存金驱动复利", "价格低于内在价值时集中买入"],
    read13f: "13F不包含全资保险、铁路、能源和制造业务，也不能代表伯克希尔全部资产。",
    status: "最新申报",
    statusNote: "Greg Abel现任CEO并承担最终资本配置责任，Buffett继续担任董事长。",
    profileSource: "https://berkshirehathaway.com/2025ar/2025ar.pdf",
    filingSource: "https://13f.info/13f/000119312526226661-berkshire-hathaway-inc-q1-2026",
    cik: "0001067983",
  },
  {
    id: "scion",
    nameZh: "Scion Asset Management",
    nameEn: "赛恩资产管理（通行译名）",
    managerZh: "迈克尔·伯里",
    managerEn: "Michael Burry",
    managerRole: "创始人",
    managerTag: "《大空头》核心真实人物",
    managerBio: "医生出身的逆向投资者。Michael Burry在次贷危机前逐笔研究抵押贷款证券并建立做空仓位，成为Michael Lewis非虚构作品《The Big Short》（《大空头》）的核心真实人物之一；电影中由Christian Bale饰演。",
    image: "/people/michael.png",
    imageSource: "https://www.michael-burry.com/michael-burry/",
    location: "美国 · 加州",
    category: "逆向价值",
    style: "事件驱动",
    risk: "高",
    period: "2025 Q3",
    filingDate: "2025-11-03",
    valueBn: 1.38,
    holdingCount: 8,
    top5: 96.8,
    accent: "#ff7b68",
    oneLiner: "寻找极端错价，也敢用期权逆势押注泡沫破裂。",
    description: "Scion是Michael Burry进行逆向投资的主要平台。他会从财报和底层资产中寻找市场忽略的错价，也会在系统性风险突出时使用高度集中的做空或期权仓位；这种组合尤其不能只看13F表面方向。",
    playbook: ["深度逆向价值", "特殊情形与催化剂", "宏观风险期权"],
    read13f: "期权名义市值会显著夸大组合表面规模，且看不到执行价、期限和对冲腿。",
    status: "申报已终止",
    statusNote: "Scion于2025-11-10终止SEC投资顾问注册，之后公众无法继续通过13F跟踪。",
    profileSource: "https://adviserinfo.sec.gov/firm/summary/167772",
    filingSource: "https://13f.info/13f/000164933925000007-scion-asset-management-llc-q3-2025",
    cik: "0001649339",
  },
  {
    id: "duquesne",
    nameZh: "Duquesne Family Office",
    nameEn: "杜肯家族办公室（通行译名）",
    managerZh: "斯坦利·德鲁肯米勒",
    managerEn: "Stanley Druckenmiller",
    managerRole: "创始人",
    managerTag: "全球宏观投资代表人物",
    managerBio: "全球宏观投资代表人物，曾为George Soros管理Quantum Fund，并因1992年英镑交易闻名。其方法不是长期守住一个静态组合，而是在宏观方向、流动性和公司基本面形成共振时集中下注，并在判断失效时迅速收缩风险。",
    image: "/people/stanley.jpg",
    imageSource: "https://www.forbes.com/profile/stanley-druckenmiller/",
    location: "美国 · 纽约",
    category: "全球宏观",
    style: "宏观交易",
    risk: "高",
    period: "2026 Q1",
    filingDate: "2026-05-15",
    valueBn: 3.38,
    holdingCount: 70,
    top5: 38.2,
    accent: "#77a7ff",
    oneLiner: "宏观方向判断与个股研究结合，判断对时放大仓位，错时迅速撤退。",
    description: "由传奇宏观投资者Stanley Druckenmiller管理的家族办公室。组合跨越医疗、科技、商品、国家ETF和指数期权，持仓调整通常比传统价值基金更快。",
    playbook: ["全球宏观择时", "强势主题重仓", "快速止损与灵活轮动"],
    read13f: "外汇、利率、商品和空头往往不会出现在13F里，股票表只是其宏观组合的一角。",
    status: "最新申报",
    statusNote: "当前公开组合以医疗创新、半导体和新兴市场表达为主。",
    profileSource: "https://www.fool.com/investing/how-to-invest/famous-investors/duquesne-family-office/",
    filingSource: "https://13f.info/13f/000153641126000004-duquesne-family-office-llc-q1-2026",
    cik: "0001536411",
  },
  {
    id: "atreides",
    nameZh: "Atreides Management",
    nameEn: "科技成长型投资机构",
    managerZh: "Gavin Baker",
    managerEn: "",
    managerRole: "管理合伙人兼首席投资官",
    managerTag: "前Fidelity科技基金经理",
    managerBio: "科技投资人，1999年至2017年任职Fidelity，曾长期管理Fidelity OTC Portfolio，并参与其风险投资业务。2019年创立Atreides，将公开市场研究与未上市科技投资放在同一套产业框架中。",
    image: "/people/gavin.jpg",
    imageSource: "https://atreidesmgmt.com/team/gavin-baker/",
    location: "美国 · 波士顿",
    category: "科技成长",
    style: "公私募跨界",
    risk: "较高",
    period: "2026 Q1",
    filingDate: "2026-05-18",
    valueBn: 5.0,
    holdingCount: 54,
    top5: 39.4,
    accent: "#9d8cff",
    oneLiner: "覆盖科技与消费赛道，在上市和未上市市场寻找长期成长。",
    description: "Gavin Baker曾长期管理Fidelity科技基金并参与风险投资。Atreides延续了这种跨市场能力，同时投资公众公司与未上市成长企业。",
    playbook: ["科技与消费成长", "上市／未上市跨界", "指数期权控制Beta"],
    read13f: "13F看不到它的私募项目，QQQ PUT也可能只是对冲而非单纯看空科技。",
    status: "最新申报",
    statusNote: "公开组合集中在半导体、光通信、软件和互联网平台。",
    profileSource: "https://atreidesmgmt.com/",
    filingSource: "https://13f.info/13f/000177781326000006-atreides-management-lp-q1-2026",
    cik: "0001777813",
  },
  {
    id: "tci",
    nameZh: "TCI Fund Management",
    nameEn: "The Children's Investment Fund",
    managerZh: "Christopher Hohn",
    managerEn: "",
    managerRole: "创始人兼投资组合经理",
    managerTag: "集中式行动主义投资人",
    managerBio: "英国投资人，2003年创立TCI。以少数全球优质企业的高集中持有和建设性股东行动著称；当治理、资本开支或管理层激励损害长期价值时，他会公开推动公司改变。",
    image: null,
    imageSource: null,
    location: "英国 · 伦敦",
    category: "行动主义",
    style: "集中质量",
    risk: "中等",
    period: "2026 Q1",
    filingDate: "2026-05-15",
    valueBn: 45.17,
    holdingCount: 10,
    top5: 85.3,
    accent: "#5cc1df",
    oneLiner: "以私募股权式深研集中持有全球优质企业，必要时主动推动改革。",
    description: "英国大型对冲基金，寻找具备持续竞争优势、可预测现金流，但因治理或复杂因素而被低估的公司，并通过建设性沟通或行动主义推动价值兑现。",
    playbook: ["全球优质企业", "高集中度长期持有", "建设性股东行动主义"],
    read13f: "GOOG与GOOGL属于Alphabet不同股份类别，分析集中度时应合并观察。",
    status: "最新申报",
    statusNote: "前四项GE Aerospace、Visa、穆迪和标普全球占据组合大部分权重。",
    profileSource: "https://www.tcifund.com/",
    filingSource: "https://13f.info/13f/000164725126000004-tci-fund-management-ltd-q1-2026",
    cik: "0001647251",
  },
  {
    id: "baupost",
    nameZh: "The Baupost Group",
    nameEn: "Baupost Group",
    managerZh: "Seth Klarman",
    managerEn: "塞思·卡拉曼（通行译名）",
    managerRole: "CEO兼投资组合经理",
    managerTag: "《Margin of Safety》作者",
    managerBio: "价值投资人及《Margin of Safety》（《安全边际》）作者。自Baupost早期开始掌舵，强调先控制永久性亏损，再寻找价格明显低于内在价值的资产；没有合适机会时可以长期持有现金。",
    image: null,
    imageSource: null,
    location: "美国 · 波士顿",
    category: "价值多策略",
    style: "安全边际",
    risk: "中等",
    period: "2026 Q1",
    filingDate: "2026-05-14",
    valueBn: 5.12,
    holdingCount: 22,
    top5: 46.7,
    accent: "#d7a96a",
    oneLiner: "以安全边际为锚，跨股票、信贷、私募和地产寻找非对称机会。",
    description: "长期价值型多策略机构，由《安全边际》作者Seth Klarman掌舵。找不到足够便宜的机会时，它宁愿持有现金，也不为保持满仓而降低标准。",
    playbook: ["安全边际与逆向价值", "困境信贷和特殊情形", "重视现金与下行保护"],
    read13f: "股票只是其多资产组合的一部分，债券、私募投资、房地产和现金不会完整显示。",
    status: "最新申报",
    statusNote: "公开股票组合偏向可识别催化剂、资产价值和现金流改善。",
    profileSource: "https://www.baupost.com/investment_philosophy",
    filingSource: "https://13f.info/13f/000106176826000007-baupost-group-llc-ma-q1-2026",
    cik: "0001061768",
  },
  {
    id: "pershing-square",
    nameZh: "Pershing Square Capital Management",
    nameEn: "潘兴广场资本（通行译名）",
    managerZh: "比尔·阿克曼",
    managerEn: "Bill Ackman",
    managerRole: "创始人兼CEO",
    managerTag: "行动主义投资人",
    managerBio: "美国行动主义投资人，2004年创立Pershing Square。通常只持有少数大型公司，公开阐述投资论点，并通过董事会、资本配置和治理沟通推动价值实现；也曾使用宏观对冲保护组合。",
    image: "/people/bill.jpg",
    imageSource: "https://www.pershingsquareinc.com/team/bill-ackman/",
    location: "美国 · 纽约",
    category: "集中质量",
    style: "建设性行动主义",
    risk: "中等",
    period: "2026 Q1",
    filingDate: "2026-05-15",
    valueBn: 13.71,
    holdingCount: 11,
    top5: 78.2,
    accent: "#ec846f",
    oneLiner: "只持有少数大型优质企业，并借助股东影响力推动价值实现。",
    description: "以高度集中的大型优质企业组合著称，强调业务简单、现金流可预测、壁垒高和估值合理；在宏观风险突出时也会购买非对称对冲。",
    playbook: ["少数大型优质企业", "长期永久资本", "建设性介入与非对称对冲"],
    read13f: "GOOG与GOOGL应合并理解，此外其宏观对冲往往不会完整出现在13F中。",
    status: "最新申报",
    statusNote: "前七项约占整个公开股票组合98%，集中度非常高。",
    profileSource: "https://pershingsquareinc.com/about-us/",
    filingSource: "https://13f.info/13f/000117266126002336-pershing-square-capital-management-l-p-q1-2026",
    cik: "0001336528",
  },
];

export const holdings = holdingsJson as Record<FundProfile["id"], Holding[]>;

export const totalValueBn = funds.reduce((sum, fund) => sum + fund.valueBn, 0);
export const totalHoldingRows = funds.reduce((sum, fund) => sum + fund.holdingCount, 0);
