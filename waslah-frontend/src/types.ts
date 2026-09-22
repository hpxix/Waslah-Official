export type LeadStatus = "new" | "qualified" | "researching" | "proposal" | "contacted" | "won" | "lost";

export type Lead = {
  id: string;
  name: string;
  title: string;
  company: string;
  email: string;
  phone?: string;
  location: string;
  source: string;
  status: LeadStatus;
  fitScore: number;
  revenueEstimate: number;
  employees: number;
  industry: string;
  companySlug: string;
  lastSeenUpdateAt: string;
  tags: string[];
};

export type CompanyResearch = {
  leadId: string;
  companySlug: string;
  strengths: string[];
  weaknesses: string[];
  opportunities: string[];
  technologyStack: string[];
  decisionMakers: string[];
  recentUpdates: string[];
  sources: string[];
  updatedAt: string;
};

export type ProductProfile = {
  id: string;
  name: string;
  description: string;
  audience: string;
  differentiators: string[];
  painPoints: string[];
};

export type EmailTemplate = {
  id: string;
  name: string;
  subject: string;
  body: string;
  category: string;
  isPremium: boolean;
  performanceScore: number;
};

export type Proposal = {
  id: string;
  leadId: string;
  title: string;
  status: "draft" | "review" | "sent";
  generatedCopy: string;
  value: number;
};

export type IntakeState = {
  confidence: number;
  summary: string;
  missing: string[];
  apifyActor: string;
  apifyInput: Record<string, unknown>;
};
