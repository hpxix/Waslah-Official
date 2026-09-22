export type LeadStatus = "new" | "qualified" | "researching" | "proposal" | "contacted" | "won" | "lost";

export type Lead = {
  id: string;
  name: string;
  title: string;
  company: string;
  email: string;
  phone?: string;
  companyImageUrl?: string;
  personImageUrl?: string;
  website?: string;
  linkedinUrl?: string;
  qualificationReason?: string;
  revealed?: boolean;
  researchStatus?: "researching" | "completed" | "failed";
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
  sections?: Array<{ key: string; title: string; content: string }>;
  markdown?: string;
  errorMessage?: string;
  retryAllowed?: boolean;
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
  status?: "researching" | "completed" | "failed";
  companyOverview?: string;
  companyDescription?: string;
  website?: string;
  logoUrl?: string;
  personPhotoUrl?: string;
  marketPosition?: string;
  performanceSummary?: string;
  productsServices?: string[];
  sizeAndLocations?: string;
  leadership?: Array<{ name: string; title: string; linkedinUrl?: string }>;
  recentNews?: Array<{ title: string; summary: string; date?: string; url?: string }>;
  risks?: string[];
  hiringAndGrowthSignals?: string[];
  fundingAndRevenue?: string;
  competitors?: string[];
  pitchStrategy?: {
    executiveSummary?: string;
    painPoints?: string[];
    valuePropositions?: string[];
    openingMessage?: string;
    discoveryQuestions?: string[];
    objectionsAndResponses?: Array<{ objection: string; response: string }>;
    nextBestAction?: string;
  };
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
  channel?: "b2b" | "b2c";
  originalPrompt?: string;
  b2cPlanning?: B2CPlanning;
};

export type B2CStrategy = {
  tagId: string;
  tagName: string;
  strategyType:
    | "DIRECT_INTENT"
    | "ADJACENT_INTENT"
    | "BEHAVIORAL_PROXY"
    | "DEVICE_PROXY"
    | "OWNERSHIP_PROXY";
  weight: number;
  positiveKeywords: string[];
  negativeKeywords: string[];
  cities: string[];
  reason: string;
  pathId?: string;
  advertiserRole?: string;
};

export type B2CLeadPath = {
  id: string;
  tagId: string;
  tagName: string;
  name: string;
  strategyType: B2CStrategy["strategyType"];
  advertiserRole: string;
  reason: string;
  requiredSignals: string[];
  excludedSignals: string[];
  confidence: number;
  question: string;
  selected: boolean;
};

export type B2CPlanning = {
  intent: {
    productName: string;
    productDescription: string;
    price: number | null;
    currency: string | null;
    market: { country: string; cities: string[] };
    buyerType: "B2C";
    idealCustomerProfiles: Array<{
      name: string;
      description: string;
      weight: number;
    }>;
    behavioralSignals: Array<{
      signal: string;
      reason: string;
      weight: number;
    }>;
    negativeSignals: Array<{ signal: string; reason: string }>;
    retrievalHypotheses: Array<{
      label: string;
      description: string;
      expectedIntentStrength: number;
    }>;
  };
  acquisitionPlan: {
    product: string;
    targetProfiles: string[];
    dealIntent?: "buy" | "sell";
    leadPaths?: B2CLeadPath[];
    selectedPathIds?: string[];
    pathSelectionRequired?: boolean;
    strategies: B2CStrategy[];
    qualification: {
      minimumLeadScore: number;
      minimumIdentityConfidence: number;
      minimumPurchasePropensity: number;
    };
  };
  taxonomyMatches: Array<{
    tagId: string;
    tagName: string;
    relevanceScore: number;
    matchedSignal: string;
    reason: string;
  }>;
};
