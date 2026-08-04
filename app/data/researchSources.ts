import type { FundProfile } from "./funds";

export type ResearchSourceProfile = {
  fundId: FundProfile["id"];
  searchTerms: string[];
  officialSources: Array<{ name: string; url: string }>;
  officialXHandle?: string;
};

export const trustedMedia = [
  { domain: "reuters.com", name: "Reuters" },
  { domain: "bloomberg.com", name: "Bloomberg" },
  { domain: "ft.com", name: "Financial Times" },
  { domain: "wsj.com", name: "The Wall Street Journal" },
  { domain: "nytimes.com", name: "The New York Times" },
  { domain: "cnbc.com", name: "CNBC" },
  { domain: "barrons.com", name: "Barron's" },
  { domain: "economist.com", name: "The Economist" },
  { domain: "institutionalinvestor.com", name: "Institutional Investor" },
  { domain: "pionline.com", name: "Pensions & Investments" },
] as const;

export const trustedMediaFeeds = [
  { domain: "nytimes.com", name: "The New York Times", url: "https://rss.nytimes.com/services/xml/rss/nyt/Business.xml" },
  { domain: "wsj.com", name: "The Wall Street Journal", url: "https://feeds.a.dj.com/rss/RSSMarketsMain.xml" },
  { domain: "cnbc.com", name: "CNBC", url: "https://www.cnbc.com/id/100003114/device/rss/rss.html" },
  { domain: "ft.com", name: "Financial Times", url: "https://www.ft.com/?format=rss" },
  { domain: "economist.com", name: "The Economist", url: "https://www.economist.com/finance-and-economics/rss.xml" },
] as const;

export const researchSources: ResearchSourceProfile[] = [
  {
    fundId: "situational-awareness",
    searchTerms: ["Leopold Aschenbrenner", "Situational Awareness LP"],
    officialSources: [
      { name: "Situational Awareness LP", url: "https://situationalawarenesslp.com/" },
      { name: "Situational Awareness", url: "https://situational-awareness.ai/" },
    ],
    officialXHandle: "leopoldasch",
  },
  {
    fundId: "berkshire-hathaway",
    searchTerms: ["Berkshire Hathaway", "Warren Buffett", "Greg Abel"],
    officialSources: [{ name: "Berkshire Hathaway", url: "https://www.berkshirehathaway.com/" }],
  },
  {
    fundId: "scion",
    searchTerms: ["Michael Burry", "Scion Asset Management"],
    officialSources: [{ name: "SEC IAPD", url: "https://adviserinfo.sec.gov/firm/summary/167772" }],
  },
  {
    fundId: "duquesne",
    searchTerms: ["Stanley Druckenmiller", "Duquesne Family Office"],
    officialSources: [{ name: "SEC EDGAR", url: "https://www.sec.gov/edgar/browse/?CIK=1536411" }],
  },
  {
    fundId: "atreides",
    searchTerms: ["Gavin Baker", "Atreides Management"],
    officialSources: [{ name: "Atreides Management", url: "https://atreidesmgmt.com/" }],
    officialXHandle: "GavinSBaker",
  },
  {
    fundId: "tci",
    searchTerms: ["Christopher Hohn", "TCI Fund Management"],
    officialSources: [{ name: "TCI Fund Management", url: "https://www.tcifund.com/" }],
  },
  {
    fundId: "baupost",
    searchTerms: ["Seth Klarman", "Baupost Group"],
    officialSources: [{ name: "The Baupost Group", url: "https://www.baupost.com/" }],
  },
  {
    fundId: "pershing-square",
    searchTerms: ["Bill Ackman", "Pershing Square Capital Management"],
    officialSources: [{ name: "Pershing Square", url: "https://pershingsquareinc.com/" }],
    officialXHandle: "BillAckman",
  },
];
