const directusUrl = (process.env.DIRECTUS_INTERNAL_URL || "http://directus:8055").replace(/\/$/, "");
const adminEmail = process.env.DIRECTUS_ADMIN_EMAIL || "bootstrap@waslah.ai";
const adminPassword = process.env.DIRECTUS_ADMIN_PASSWORD || "change-me-now";
const customerRoleId = process.env.WASLAH_CUSTOMER_ROLE_ID || "8c62f1c4-258c-4d77-92f2-33f87db31765";

let accessToken = "";

const uuid = (hidden = true) => ({
  type: "uuid",
  meta: { hidden, readonly: hidden, interface: "input", special: ["uuid"] },
  schema: { is_primary_key: hidden, is_nullable: false },
});

const nullableUuid = () => ({
  type: "uuid",
  meta: { hidden: false, readonly: false, interface: "input", special: ["uuid"] },
  schema: { is_primary_key: false, is_nullable: true },
});

const string = ({ required = false, unique = false, length = 255, hidden = false, defaultValue = null } = {}) => ({
  type: "string",
  meta: { interface: "input", required, hidden },
  schema: { is_nullable: !required, is_unique: unique, max_length: length, default_value: defaultValue },
});

const text = ({ required = false, hidden = false } = {}) => ({
  type: "text",
  meta: { interface: "input-multiline", required, hidden },
  schema: { is_nullable: !required },
});

const integer = ({ required = false, defaultValue = null } = {}) => ({
  type: "integer",
  meta: { interface: "input", required },
  schema: { is_nullable: !required, default_value: defaultValue },
});

const json = ({ hidden = false } = {}) => ({
  type: "json",
  meta: { interface: "input-code", options: { language: "json" }, hidden },
  schema: { is_nullable: true },
});

const timestamp = (special) => ({
  type: "timestamp",
  meta: { interface: "datetime", readonly: Boolean(special), special: special ? [special] : null },
  schema: { is_nullable: true },
});

const boolean = (defaultValue = false) => ({
  type: "boolean",
  meta: { interface: "boolean" },
  schema: { is_nullable: false, default_value: defaultValue },
});

const collections = [
  {
    name: "organizations",
    icon: "domain",
    note: "Customer workspaces and tenant boundary.",
    fields: {
      id: uuid(),
      name: string({ required: true }),
      slug: string({ required: true, unique: true }),
      owner_user: uuid(false),
      status: string({ required: true }),
      monthly_user_limit: integer({ required: true, defaultValue: 25 }),
      created_at: timestamp("date-created"),
      updated_at: timestamp("date-updated"),
    },
  },
  {
    name: "organization_members",
    icon: "group",
    note: "Users attached to a workspace.",
    fields: {
      id: uuid(),
      membership_key: string({ required: true, unique: true }),
      organization_id: uuid(false),
      user_id: uuid(false),
      role: string({ required: true }),
      status: string({ required: true }),
      created_at: timestamp("date-created"),
    },
  },
  {
    name: "customer_profiles",
    icon: "badge",
    note: "Application profile and phone verification state.",
    fields: {
      id: uuid(),
      user_id: { ...uuid(false), schema: { is_nullable: false, is_unique: true } },
      organization_id: uuid(false),
      phone_e164: string({ required: true, unique: true, length: 20 }),
      phone_verified_at: timestamp(),
      avatar_seed: string({ required: true, length: 80 }),
      locale: string({ required: true, length: 10 }),
      marketing_consent: boolean(false),
      privacy_consent_at: timestamp(),
      permissions_consent_at: timestamp(),
      consent_version: string({ required: true, length: 32, defaultValue: "unaccepted" }),
      created_at: timestamp("date-created"),
      updated_at: timestamp("date-updated"),
    },
  },
  {
    name: "wallets",
    icon: "account_balance_wallet",
    note: "One balance per workspace, stored in halalas.",
    fields: {
      id: uuid(),
      organization_id: { ...uuid(false), schema: { is_nullable: false, is_unique: true } },
      currency: string({ required: true, length: 3 }),
      balance_halalas: integer({ required: true, defaultValue: 0 }),
      created_at: timestamp("date-created"),
      updated_at: timestamp("date-updated"),
    },
  },
  {
    name: "wallet_transactions",
    icon: "receipt_long",
    note: "Immutable credit ledger. Never edit or delete entries.",
    fields: {
      id: uuid(),
      organization_id: uuid(false),
      wallet_id: uuid(false),
      type: string({ required: true, length: 40 }),
      amount_halalas: integer({ required: true }),
      idempotency_key: string({ required: true, unique: true }),
      reference_type: string({ length: 60 }),
      reference_id: string({ length: 255 }),
      metadata: json({ hidden: true }),
      created_at: timestamp("date-created"),
    },
  },
  {
    name: "credit_grants",
    icon: "add_card",
    note: "Admin credit grants. Enter a customer email and credits; 10 credits equal 1 SAR and one lead reveal.",
    fields: {
      id: uuid(),
      user_email: string({ required: true }),
      user_id: uuid(false),
      organization_id: uuid(false),
      credits: integer({ required: true }),
      amount_halalas: integer({ required: true, defaultValue: 0 }),
      reason: text({ required: true }),
      status: string({ required: true, length: 30, defaultValue: "pending" }),
      error_message: text({ hidden: true }),
      granted_by: uuid(false),
      transaction_id: uuid(false),
      processed_at: timestamp(),
      created_at: timestamp("date-created"),
      updated_at: timestamp("date-updated"),
    },
  },
  {
    name: "phone_verifications",
    icon: "sms",
    note: "Short-lived OTP attempts. Codes are never stored in plaintext.",
    fields: {
      id: uuid(),
      user_id: uuid(false),
      phone_e164: string({ required: true, length: 20 }),
      provider: string({ required: true, length: 30 }),
      provider_reference: string({ length: 255 }),
      code_hash: string({ length: 128, hidden: true }),
      status: string({ required: true, length: 30 }),
      attempts: integer({ required: true, defaultValue: 0 }),
      expires_at: timestamp(),
      verified_at: timestamp(),
      created_at: timestamp("date-created"),
    },
  },
  {
    name: "lead_requests",
    icon: "manage_search",
    note: "A client's requested lead segment and sourcing job.",
    fields: {
      id: uuid(),
      organization_id: uuid(false),
      created_by: uuid(false),
      query: text({ required: true }),
      criteria: json(),
      target_count: integer({ required: true, defaultValue: 20 }),
      status: string({ required: true, length: 40 }),
      provider: string({ length: 40 }),
      provider_job_id: string({ length: 255 }),
      idempotency_key: string({ required: true, unique: true }),
      result_count: integer({ required: true, defaultValue: 0 }),
      error_message: text({ hidden: true }),
      created_at: timestamp("date-created"),
      updated_at: timestamp("date-updated"),
    },
  },
  {
    name: "lead_research_reports",
    icon: "travel_explore",
    note: "Saved B2B intelligence and Relevance research jobs. Job metadata is stored privately within the report.",
    fields: {
      id: uuid(),
      report_key: string({ required: true, unique: true, length: 500 }),
      organization_id: uuid(false),
      lead_id: uuid(false),
      requested_by: uuid(false),
      status: string({ required: true, length: 30, defaultValue: "queued" }),
      product_summary: text(),
      report: json(),
      citations: json(),
      model: string({ length: 80 }),
      error_message: text({ hidden: true }),
      created_at: timestamp("date-created"),
      updated_at: timestamp("date-updated"),
    },
  },
  {
    name: "b2c_campaigns",
    icon: "person_search",
    note: "B2C marketplace acquisition plans and execution state.",
    fields: {
      id: uuid(),
      organization_id: uuid(false),
      user_id: uuid(false),
      request_id: uuid(false),
      name: string({ required: true }),
      original_prompt: text({ required: true }),
      intent: json(),
      acquisition_plan: json(),
      sourcing_explanation: text(),
      target_lead_count: integer({ required: true, defaultValue: 20 }),
      status: string({ required: true, length: 30 }),
      stats: json(),
      error_message: text({ hidden: true }),
      created_at: timestamp("date-created"),
      updated_at: timestamp("date-updated"),
    },
  },
  {
    name: "b2c_candidates",
    icon: "filter_alt",
    note: "Haraj posts evaluated before contact resolution.",
    fields: {
      id: uuid(),
      candidate_key: string({ required: true, unique: true, length: 500, hidden: true }),
      organization_id: uuid(false),
      campaign_id: uuid(false),
      post_id: integer({ required: true }),
      author_id: integer(),
      author_username: string(),
      title: text({ required: true }),
      body_text: text(),
      city: string(),
      tags: json(),
      post_date: integer(),
      update_date: integer(),
      strategy: json(),
      qualification: json(),
      status: string({ required: true, length: 30 }),
      raw_payload: json({ hidden: true }),
      created_at: timestamp("date-created"),
      updated_at: timestamp("date-updated"),
    },
  },
  {
    name: "b2c_leads",
    icon: "group_add",
    note: "Campaign-scoped seller profiles deduplicated by phone, author ID, then username.",
    fields: {
      id: uuid(),
      lead_key: string({ required: true, unique: true, length: 500, hidden: true }),
      organization_id: uuid(false),
      campaign_id: uuid(false),
      inventory_id: uuid(false),
      source_internal: string({ required: true, length: 40, defaultValue: "haraj" }),
      author_id: integer(),
      author_username: string(),
      phone: string({ length: 30, hidden: true }),
      city: string(),
      score: integer({ required: true, defaultValue: 0 }),
      tier: string({ required: true, length: 20 }),
      identity_confidence: integer({ required: true, defaultValue: 0 }),
      purchase_propensity: integer({ required: true, defaultValue: 0 }),
      marketplace_role: string({ required: true, length: 40 }),
      explanation: text(),
      evidence: json(),
      status: string({ required: true, length: 30, defaultValue: "DELIVERED" }),
      created_at: timestamp("date-created"),
      updated_at: timestamp("date-updated"),
    },
  },
  {
    name: "b2c_lead_outcomes",
    icon: "conversion_path",
    note: "Conversion feedback for improving B2C acquisition recipes.",
    fields: {
      id: uuid(),
      outcome_key: string({ required: true, unique: true, length: 500 }),
      organization_id: uuid(false),
      campaign_id: uuid(false),
      lead_id: uuid(false),
      status: string({ required: true, length: 30 }),
      revenue_halalas: integer(),
      rejection_reason: text(),
      created_at: timestamp("date-created"),
      updated_at: timestamp("date-updated"),
    },
  },
  {
    name: "lead_inventory",
    icon: "contacts",
    note: "Canonical, deduplicated Waslah lead inventory. PII is server-gated.",
    fields: {
      id: uuid(),
      fingerprint: string({ required: true, unique: true, length: 64, hidden: true }),
      name: string(),
      title: string(),
      company: string({ required: true }),
      company_normalized: string({ required: true }),
      email: string({ hidden: true }),
      phone: string({ length: 30, hidden: true }),
      person_image_url: string({ length: 500 }),
      company_image_url: string({ length: 500 }),
      website: string(),
      linkedin_url: string({ length: 500 }),
      company_linkedin_url: string({ length: 500 }),
      location: string(),
      industry: string(),
      seniority: string({ length: 80 }),
      company_size: integer(),
      annual_revenue: string({ length: 100 }),
      review_score: string({ length: 20 }),
      review_count: integer(),
      source: string({ required: true, length: 80 }),
      source_reference: string({ length: 255 }),
      fit_score: integer({ required: true, defaultValue: 0 }),
      qualification_status: string({ required: true, length: 40 }),
      enrichment_status: string({ required: true, length: 40, defaultValue: "raw" }),
      enrichment_score: integer({ required: true, defaultValue: 0 }),
      enrichment_summary: text(),
      enrichment_signals: json(),
      raw_payload: json({ hidden: true }),
      last_enriched_at: timestamp(),
      created_at: timestamp("date-created"),
      updated_at: timestamp("date-updated"),
    },
  },
  {
    name: "lead_request_results",
    icon: "dataset_linked",
    note: "Ranked leads returned for one workspace request.",
    fields: {
      id: uuid(),
      result_key: string({ required: true, unique: true }),
      organization_id: uuid(false),
      organization_name: string(),
      request_id: uuid(false),
      request_query: text(),
      user_id: uuid(false),
      user_email: string(),
      lead_id: uuid(false),
      rank: integer({ required: true }),
      preview: json(),
      status: string({ required: true, length: 40 }),
      created_at: timestamp("date-created"),
    },
  },
  {
    name: "lead_access_grants",
    icon: "key",
    note: "Workspace entitlement to view a lead's contact details.",
    fields: {
      id: uuid(),
      grant_key: string({ required: true, unique: true }),
      organization_id: uuid(false),
      lead_id: uuid(false),
      transaction_id: uuid(false),
      grant_reason: string({ required: true, length: 40 }),
      granted_at: timestamp("date-created"),
    },
  },
  {
    name: "call_attempts",
    icon: "phone_in_talk",
    note: "Each outbound qualification attempt and its final artifact.",
    fields: {
      id: uuid(),
      organization_id: uuid(false),
      request_id: uuid(false),
      lead_id: uuid(false),
      provider: string({ required: true, length: 40 }),
      provider_call_id: string({ unique: true }),
      attempt_number: integer({ required: true, defaultValue: 1 }),
      status: string({ required: true, length: 50 }),
      outcome: string({ length: 80 }),
      phone: string({ length: 30, hidden: true }),
      cost_halalas: integer({ required: true, defaultValue: 0 }),
      provider_cost_micros: integer({ required: true, defaultValue: 0 }),
      provider_cost_currency: string({ required: true, length: 3, defaultValue: "USD" }),
      started_at: timestamp(),
      ended_at: timestamp(),
      recording_url: string({ hidden: true }),
      transcript: text({ hidden: true }),
      summary: text(),
      raw_payload: json({ hidden: true }),
      created_at: timestamp("date-created"),
      updated_at: timestamp("date-updated"),
    },
  },
  {
    name: "call_events",
    icon: "event_note",
    note: "Append-only Vapi webhook audit events.",
    fields: {
      id: uuid(),
      organization_id: uuid(false),
      call_attempt_id: uuid(false),
      provider_event_id: string({ required: true, unique: true }),
      event_type: string({ required: true, length: 80 }),
      payload: json({ hidden: true }),
      received_at: timestamp("date-created"),
    },
  },
  {
    name: "qualifications",
    icon: "fact_check",
    note: "Structured outcome extracted from an AI qualification call.",
    fields: {
      id: uuid(),
      qualification_key: string({ required: true, unique: true }),
      organization_id: uuid(false),
      lead_id: uuid(false),
      call_attempt_id: uuid(false),
      status: string({ required: true, length: 40 }),
      score: integer({ required: true, defaultValue: 0 }),
      answers: json(),
      summary: text(),
      next_action: string(),
      qualified_at: timestamp(),
      created_at: timestamp("date-created"),
      updated_at: timestamp("date-updated"),
    },
  },
  {
    name: "integration_events",
    icon: "outbox",
    note: "Idempotent outbox for n8n and provider jobs.",
    fields: {
      id: uuid(),
      organization_id: uuid(false),
      event_type: string({ required: true, length: 80 }),
      status: string({ required: true, length: 40 }),
      idempotency_key: string({ required: true, unique: true }),
      payload: json({ hidden: true }),
      attempts: integer({ required: true, defaultValue: 0 }),
      available_at: timestamp(),
      processed_at: timestamp(),
      last_error: text({ hidden: true }),
      created_at: timestamp("date-created"),
      updated_at: timestamp("date-updated"),
    },
  },
  {
    name: "chat_logs",
    icon: "forum",
    note: "Workspace-attributed lead-agent conversation turns for administrator review.",
    fields: {
      id: uuid(),
      organization_id: nullableUuid(),
      user_id: uuid(false),
      user_email: string(),
      conversation_id: string({ length: 120 }),
      lead_type: string({ length: 20 }),
      deal_intent: string({ length: 20 }),
      understood_data: json(),
      outcome: text(),
      mode: string({ required: true, length: 30 }),
      language: string({ required: true, length: 10 }),
      message: text({ required: true }),
      response: text(),
      transcript: json({ hidden: true }),
      status: string({ required: true, length: 30 }),
      error_message: text({ hidden: true }),
      created_at: timestamp("date-created"),
    },
  },
  {
    name: "business_profiles",
    icon: "fingerprint",
    note: "Tenant-owned business intelligence used by Wasla AI across lead, content, audience, and outreach workflows.",
    fields: {
      id: uuid(),
      organization_id: { ...uuid(false), schema: { is_nullable: false, is_unique: true } },
      company_name: string({ required: true, length: 160 }),
      website: string({ length: 500 }),
      industry: string({ length: 160 }),
      description: text(),
      value_proposition: text(),
      products_services: json(),
      brand_voice: text(),
      brand_values: json(),
      target_markets: json(),
      goals: json(),
      tone_rules: json(),
      colors: json(),
      logo_url: string({ length: 500 }),
      completion_score: integer({ required: true, defaultValue: 0 }),
      created_at: timestamp("date-created"),
      updated_at: timestamp("date-updated"),
    },
  },
  {
    name: "business_documents",
    icon: "description",
    note: "Tenant-owned portfolio files and the exact business facts Wasla could or could not understand from them.",
    fields: {
      id: uuid(),
      organization_id: uuid(false),
      created_by: uuid(false),
      file_id: nullableUuid(),
      file_name: string({ required: true, length: 255 }),
      mime_type: string({ required: true, length: 160 }),
      size_bytes: integer({ required: true, defaultValue: 0 }),
      content_hash: string({ required: true, length: 64 }),
      status: string({ required: true, length: 30, defaultValue: "processing" }),
      summary: text(),
      extracted_data: json(),
      readable_sections: json(),
      unreadable_sections: json(),
      error_message: text(),
      created_at: timestamp("date-created"),
      updated_at: timestamp("date-updated"),
    },
  },
  {
    name: "audience_segments",
    icon: "groups_3",
    note: "Living customer segments, pains, triggers, jobs-to-be-done, channel fit, and Saudi market context.",
    fields: {
      id: uuid(),
      organization_id: uuid(false),
      created_by: uuid(false),
      name: string({ required: true, length: 160 }),
      type: string({ required: true, length: 20, defaultValue: "B2B" }),
      description: text(),
      pains: json(),
      triggers: json(),
      jobs_to_be_done: json(),
      channels: json(),
      geography: json(),
      estimated_size: integer({ defaultValue: 0 }),
      status: string({ required: true, length: 32, defaultValue: "active" }),
      created_at: timestamp("date-created"),
      updated_at: timestamp("date-updated"),
    },
  },
  {
    name: "growth_campaigns",
    icon: "campaign",
    note: "Cross-channel growth campaigns joining one commercial objective to an audience, content plan, and measurable outcome.",
    fields: {
      id: uuid(),
      organization_id: uuid(false),
      created_by: uuid(false),
      name: string({ required: true, length: 180 }),
      objective: text({ required: true }),
      audience_segment_id: nullableUuid(),
      status: string({ required: true, length: 32, defaultValue: "draft" }),
      channels: json(),
      strategy: json(),
      metrics: json(),
      start_at: timestamp(),
      end_at: timestamp(),
      created_at: timestamp("date-created"),
      updated_at: timestamp("date-updated"),
    },
  },
  {
    name: "content_items",
    icon: "auto_awesome_motion",
    note: "AI-assisted content drafts and approval-controlled Postiz publishing records.",
    fields: {
      id: uuid(),
      organization_id: uuid(false),
      campaign_id: nullableUuid(),
      connection_id: nullableUuid(),
      created_by: uuid(false),
      title: string({ required: true, length: 220 }),
      channel: string({ required: true, length: 40 }),
      format: string({ required: true, length: 40, defaultValue: "post" }),
      copy: text({ required: true }),
      rationale: text(),
      visual_direction: text(),
      media: json(),
      status: string({ required: true, length: 32, defaultValue: "draft" }),
      approval_status: string({ required: true, length: 32, defaultValue: "pending" }),
      scheduled_for: timestamp(),
      postiz_post_id: string({ length: 255 }),
      published_at: timestamp(),
      error_message: text({ hidden: true }),
      created_at: timestamp("date-created"),
      updated_at: timestamp("date-updated"),
    },
  },
  {
    name: "customer_journeys",
    icon: "conversion_path",
    note: "Animated revenue-funnel state for every lead or customer, including next action and attributed value.",
    fields: {
      id: uuid(),
      organization_id: uuid(false),
      lead_id: nullableUuid(),
      segment_id: nullableUuid(),
      display_name: string({ required: true, length: 180 }),
      stage: string({ required: true, length: 40, defaultValue: "engaged" }),
      stage_order: integer({ required: true, defaultValue: 1 }),
      source: string({ length: 80 }),
      engagement_score: integer({ required: true, defaultValue: 0 }),
      next_action: text(),
      owner_name: string({ length: 160 }),
      value_halalas: integer({ required: true, defaultValue: 0 }),
      last_activity_at: timestamp(),
      metadata: json(),
      created_at: timestamp("date-created"),
      updated_at: timestamp("date-updated"),
    },
  },
  {
    name: "social_connections",
    icon: "hub",
    note: "Encrypted, tenant-scoped social and messaging channel connections. Secrets are never returned to browser clients.",
    fields: {
      id: uuid(),
      organization_id: uuid(false),
      created_by: uuid(false),
      provider: string({ required: true, length: 32 }),
      display_name: string({ required: true, length: 120 }),
      external_account_id: string({ length: 255 }),
      status: string({ required: true, length: 32, defaultValue: "configured" }),
      is_preferred: boolean(false),
      auth_mode: string({ required: true, length: 32, defaultValue: "credentials" }),
      credentials_encrypted: text({ required: true, hidden: true }),
      credential_hints: json({ hidden: true }),
      configuration: json(),
      capabilities: json(),
      autonomy_level: string({ required: true, length: 40, defaultValue: "draft_only" }),
      approval_policy: string({ required: true, length: 40, defaultValue: "always" }),
      webhook_status: string({ required: true, length: 40, defaultValue: "not_configured" }),
      last_verified_at: timestamp(),
      last_connected_at: timestamp(),
      last_error: text({ hidden: true }),
      created_at: timestamp("date-created"),
      updated_at: timestamp("date-updated"),
    },
  },
  {
    name: "social_events",
    icon: "history",
    note: "Workspace audit trail for channel configuration, validation, routing, and disconnection events.",
    fields: {
      id: uuid(),
      organization_id: uuid(false),
      connection_id: nullableUuid(),
      actor_user_id: uuid(false),
      provider: string({ required: true, length: 32 }),
      event_type: string({ required: true, length: 60 }),
      status: string({ required: true, length: 32 }),
      summary: text({ required: true }),
      metadata: json({ hidden: true }),
      created_at: timestamp("date-created"),
    },
  },
  {
    name: "feature_flags",
    icon: "toggle_on",
    note: "Global product capabilities. Account overrides are evaluated on every protected request.",
    fields: {
      id: uuid(),
      feature_key: string({ required: true, unique: true, length: 80 }),
      name: string({ required: true, length: 160 }),
      description: text(),
      enabled_global: boolean(true),
      configuration: json(),
      updated_by: nullableUuid(),
      created_at: timestamp("date-created"),
      updated_at: timestamp("date-updated"),
    },
  },
  {
    name: "account_feature_overrides",
    icon: "rule_settings",
    note: "Per-account capability overrides. A user override wins over its global flag.",
    fields: {
      id: uuid(),
      override_key: string({ required: true, unique: true, length: 255 }),
      feature_key: string({ required: true, length: 80 }),
      organization_id: nullableUuid(),
      user_id: uuid(false),
      enabled: boolean(true),
      configuration: json(),
      updated_by: nullableUuid(),
      created_at: timestamp("date-created"),
      updated_at: timestamp("date-updated"),
    },
  },
  {
    name: "sourcing_providers",
    icon: "api",
    note: "Administrator-managed sourcing routes. API tokens are encrypted and never returned to browsers.",
    fields: {
      id: uuid(),
      provider_key: string({ required: true, unique: true, length: 100 }),
      name: string({ required: true, length: 160 }),
      channel: string({ required: true, length: 20, defaultValue: "b2b" }),
      provider_type: string({ required: true, length: 40, defaultValue: "apify" }),
      actor_id: string({ required: true, length: 255 }),
      token_encrypted: text({ hidden: true }),
      token_hint: string({ length: 32, hidden: true }),
      configuration: json(),
      enabled: boolean(true),
      priority: integer({ required: true, defaultValue: 100 }),
      updated_by: nullableUuid(),
      created_at: timestamp("date-created"),
      updated_at: timestamp("date-updated"),
    },
  },
  {
    name: "ai_account_memory",
    icon: "psychology",
    note: "Structured tenant memory learned from conversations and visible to account owners and administrators.",
    fields: {
      id: uuid(),
      memory_key: string({ required: true, unique: true, length: 255 }),
      organization_id: nullableUuid(),
      user_id: uuid(false),
      user_email: string(),
      understood_data: json(),
      last_summary: text(),
      last_outcome: text(),
      last_conversation_id: string({ length: 120 }),
      source_turn_count: integer({ required: true, defaultValue: 0 }),
      confidence: integer({ required: true, defaultValue: 0 }),
      created_at: timestamp("date-created"),
      updated_at: timestamp("date-updated"),
    },
  },
  {
    name: "admin_audit_logs",
    icon: "admin_panel_settings",
    note: "Append-only audit log for feature, provider, and credit administration.",
    fields: {
      id: uuid(),
      admin_user_id: uuid(false),
      action: string({ required: true, length: 100 }),
      target_type: string({ required: true, length: 60 }),
      target_id: string({ length: 255 }),
      summary: text({ required: true }),
      metadata: json({ hidden: true }),
      created_at: timestamp("date-created"),
    },
  },
];

async function request(path, options = {}) {
  const response = await fetch(`${directusUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...options.headers,
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.errors?.[0]?.message || `${response.status} ${response.statusText}`;
    throw new Error(`${options.method || "GET"} ${path}: ${message}`);
  }
  return payload.data;
}

async function login() {
  const data = await request("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: adminEmail, password: adminPassword, mode: "json" }),
  });
  accessToken = data.access_token;
}

async function ensureRole() {
  const roles = await request(`/roles?filter[id][_eq]=${customerRoleId}&limit=1`);
  if (roles.length) return;

  await request("/roles", {
    method: "POST",
    body: JSON.stringify({
      id: customerRoleId,
      name: "Waslah Customer",
      icon: "business_center",
      description: "Authenticated application users. Data access is enforced by the lead-agent API.",
    }),
  });
  console.log("Created Waslah Customer role");
}

function fieldPayload(collection, field, definition) {
  return {
    collection,
    field,
    ...definition,
    meta: { ...definition.meta, collection, field },
    schema: { ...definition.schema, name: field, table: collection },
  };
}

async function ensureCollection(spec, existingNames) {
  if (!existingNames.has(spec.name)) {
    await request("/collections", {
      method: "POST",
      body: JSON.stringify({
        collection: spec.name,
        meta: {
          collection: spec.name,
          icon: spec.icon,
          note: spec.note,
          hidden: false,
          singleton: false,
          accountability: "all",
        },
        schema: { name: spec.name },
        fields: Object.entries(spec.fields).map(([field, definition]) => fieldPayload(spec.name, field, definition)),
      }),
    });
    console.log(`Created ${spec.name}`);
    return;
  }

  const currentFields = await request(`/fields/${spec.name}`);
  const currentNames = new Set(currentFields.map((field) => field.field));
  for (const [field, definition] of Object.entries(spec.fields)) {
    if (currentNames.has(field)) continue;
    try {
      await request(`/fields/${spec.name}`, {
        method: "POST",
        body: JSON.stringify(fieldPayload(spec.name, field, definition)),
      });
      console.log(`Added ${spec.name}.${field}`);
    } catch (error) {
      if (!String(error.message).includes("already exists")) throw error;
    }
  }
}

async function main() {
  await login();
  await ensureRole();

  const currentCollections = await request("/collections");
  const existingNames = new Set(currentCollections.map((entry) => entry.collection));
  for (const spec of collections) {
    await ensureCollection(spec, existingNames);
  }

  console.log(`Waslah Directus bootstrap complete (${collections.length} collections)`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
