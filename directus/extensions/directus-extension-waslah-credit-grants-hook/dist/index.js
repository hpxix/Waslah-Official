import { randomUUID } from "node:crypto";

const HALALAS_PER_CREDIT = 10;
const MAX_GRANT_CREDITS = 1_000_000;

async function processGrant(database, grantId, accountability, logger) {
  const grant = await database("credit_grants").where({ id: grantId }).first();
  if (!grant || grant.status === "processed") return;

  const credits = Number.parseInt(grant.credits, 10);
  if (!Number.isFinite(credits) || credits < 1 || credits > MAX_GRANT_CREDITS) {
    await database("credit_grants").where({ id: grantId }).update({
      status: "failed",
      error_message: `Credits must be between 1 and ${MAX_GRANT_CREDITS}.`,
      updated_at: new Date().toISOString(),
    });
    return;
  }

  try {
    await database.transaction(async (trx) => {
      const lockedGrant = await trx("credit_grants").where({ id: grantId }).forUpdate().first();
      if (!lockedGrant || lockedGrant.status === "processed") return;

      const email = String(lockedGrant.user_email || "").trim().toLowerCase();
      const user = await trx("directus_users").select("id", "email").whereRaw("LOWER(email) = ?", [email]).first();
      if (!user) throw new Error("No Directus user exists with this email address.");

      const profile = await trx("customer_profiles").where({ user_id: user.id }).first();
      if (!profile) throw new Error("This user has no Waslah customer profile.");
      const wallet = await trx("wallets").where({ organization_id: profile.organization_id }).forUpdate().first();
      if (!wallet) throw new Error("This user's workspace has no wallet.");

      const idempotencyKey = `admin-credit-grant:${grantId}`;
      const existingTransaction = await trx("wallet_transactions").where({ idempotency_key: idempotencyKey }).first();
      const amountHalalas = credits * HALALAS_PER_CREDIT;
      const now = new Date().toISOString();
      let transactionId = existingTransaction?.id;

      if (!existingTransaction) {
        transactionId = randomUUID();
        await trx("wallet_transactions").insert({
          id: transactionId,
          organization_id: profile.organization_id,
          wallet_id: wallet.id,
          type: "admin_credit_grant",
          amount_halalas: amountHalalas,
          idempotency_key: idempotencyKey,
          reference_type: "credit_grants",
          reference_id: grantId,
          metadata: JSON.stringify({ credits, reason: lockedGrant.reason, granted_by: accountability?.user || null }),
          created_at: now,
        });
        await trx("wallets").where({ id: wallet.id }).update({
          balance_halalas: Number(wallet.balance_halalas) + amountHalalas,
          updated_at: now,
        });
      }

      await trx("credit_grants").where({ id: grantId }).update({
        user_id: user.id,
        organization_id: profile.organization_id,
        amount_halalas: amountHalalas,
        status: "processed",
        error_message: null,
        granted_by: accountability?.user || lockedGrant.granted_by || null,
        transaction_id: transactionId,
        processed_at: now,
        updated_at: now,
      });
    });
  } catch (error) {
    logger.error(error);
    await database("credit_grants").where({ id: grantId }).update({
      status: "failed",
      error_message: String(error?.message || error).slice(0, 2000),
      updated_at: new Date().toISOString(),
    });
  }
}

export default ({ action }, { database, logger }) => {
  action("items.create", async (meta) => {
    if (meta.collection !== "credit_grants" || !meta.key) return;
    await processGrant(database, meta.key, meta.accountability, logger);
  });
};
