import { getDataOwner } from "./data-owner";
import { getDatabase, withTransaction, type FinanceDatabase } from "./db";

export type AppUserStatus = "pending" | "approved" | "rejected";
export type AppUserRole = "user" | "admin";

export type AppUser = {
  ownerKey: string;
  email: string;
  status: AppUserStatus;
  role: AppUserRole;
  requestedAt: string;
  reviewedAt: string | null;
  reviewedByOwnerKey: string | null;
  lastSeenAt: string;
};

type UserRow = {
  owner_key: string;
  email: string;
  status: AppUserStatus;
  role: AppUserRole;
  requested_at: string;
  reviewed_at: string | null;
  reviewed_by_owner_key: string | null;
  last_seen_at: string;
};

function userFromRow(row: UserRow): AppUser {
  return {
    ownerKey: row.owner_key,
    email: row.email,
    status: row.status,
    role: row.role,
    requestedAt: row.requested_at,
    reviewedAt: row.reviewed_at,
    reviewedByOwnerKey: row.reviewed_by_owner_key,
    lastSeenAt: row.last_seen_at,
  };
}

async function hasOwnedFinanceData(db: FinanceDatabase, ownerKey: string) {
  const row = (await db
    .prepare(
      `SELECT
        EXISTS(SELECT 1 FROM snapshots WHERE owner_key = ? LIMIT 1) OR
        EXISTS(SELECT 1 FROM accounts WHERE owner_key = ? LIMIT 1) OR
        EXISTS(SELECT 1 FROM loans WHERE owner_key = ? LIMIT 1) OR
        EXISTS(SELECT 1 FROM credit_card_accounts WHERE owner_key = ? LIMIT 1)
        AS has_data`,
    )
    .get(ownerKey, ownerKey, ownerKey, ownerKey)) as
    { has_data?: number } | undefined;
  return Number(row?.has_data ?? 0) === 1;
}

export async function ensureCurrentAppUser(
  database?: FinanceDatabase,
): Promise<AppUser> {
  const db = database ?? (await getDatabase());
  const owner = getDataOwner();
  const now = new Date().toISOString();
  const existing = (await db
    .prepare(
      `SELECT owner_key, email, status, role, requested_at, reviewed_at,
        reviewed_by_owner_key, last_seen_at
      FROM app_users WHERE owner_key = ?`,
    )
    .get(owner.key)) as UserRow | undefined;

  if (existing) {
    await db
      .prepare(
        `UPDATE app_users SET email = ?, last_seen_at = ?, updated_at = ?
        WHERE owner_key = ?`,
      )
      .run(owner.email, now, now, owner.key);
    return userFromRow({
      ...existing,
      email: owner.email,
      last_seen_at: now,
    });
  }

  const ownsFinanceData = await hasOwnedFinanceData(db, owner.key);
  const admin = (await db
    .prepare("SELECT owner_key FROM app_users WHERE role = 'admin' LIMIT 1")
    .get()) as { owner_key?: string } | undefined;
  const isDevelopmentIdentity =
    owner.key === "legacy" || owner.email.endsWith("@localhost.invalid");
  const role: AppUserRole = !admin || isDevelopmentIdentity ? "admin" : "user";
  const status: AppUserStatus =
    role === "admin" || ownsFinanceData ? "approved" : "pending";

  await db
    .prepare(
      `INSERT INTO app_users(
        owner_key, email, status, role, requested_at, reviewed_at,
        reviewed_by_owner_key, last_seen_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      owner.key,
      owner.email,
      status,
      role,
      now,
      status === "approved" ? now : null,
      role === "admin" ? owner.key : null,
      now,
      now,
      now,
    );

  return {
    ownerKey: owner.key,
    email: owner.email,
    status,
    role,
    requestedAt: now,
    reviewedAt: status === "approved" ? now : null,
    reviewedByOwnerKey: role === "admin" ? owner.key : null,
    lastSeenAt: now,
  };
}

export function isApprovedAppUser(user: AppUser) {
  return user.status === "approved";
}

export async function requireAdmin(database?: FinanceDatabase) {
  const user = await ensureCurrentAppUser(database);
  if (user.status !== "approved" || user.role !== "admin")
    throw new Error("僅管理員可以管理使用者");
  return user;
}

export async function listAppUsers(): Promise<AppUser[]> {
  const db = await getDatabase();
  await requireAdmin(db);
  const rows = (await db
    .prepare(
      `SELECT owner_key, email, status, role, requested_at, reviewed_at,
        reviewed_by_owner_key, last_seen_at
      FROM app_users
      ORDER BY
        CASE status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END,
        requested_at DESC`,
    )
    .all()) as UserRow[];
  return rows.map(userFromRow);
}

export async function reviewAppUser(
  ownerKey: string,
  status: Extract<AppUserStatus, "approved" | "rejected">,
): Promise<AppUser> {
  return withTransaction(async (db) => {
    const reviewer = await requireAdmin(db);
    if (ownerKey === reviewer.ownerKey)
      throw new Error("不能變更目前管理員自己的存取狀態");
    const target = (await db
      .prepare(
        `SELECT owner_key, email, status, role, requested_at, reviewed_at,
          reviewed_by_owner_key, last_seen_at
        FROM app_users WHERE owner_key = ?`,
      )
      .get(ownerKey)) as UserRow | undefined;
    if (!target) throw new Error("找不到要審核的使用者");
    if (target.role === "admin") throw new Error("不能審核其他管理員");

    const now = new Date().toISOString();
    await db
      .prepare(
        `UPDATE app_users SET status = ?, reviewed_at = ?,
          reviewed_by_owner_key = ?, updated_at = ?
        WHERE owner_key = ?`,
      )
      .run(status, now, reviewer.ownerKey, now, ownerKey);
    return userFromRow({
      ...target,
      status,
      reviewed_at: now,
      reviewed_by_owner_key: reviewer.ownerKey,
    });
  });
}

export type AccessDecision =
  | { action: "allow" }
  | { action: "redirect"; location: string }
  | { action: "deny"; status: 403; message: string };

export function appAccessDecision(
  user: AppUser,
  pathname: string,
  acceptsHtml: boolean,
): AccessDecision {
  const alwaysAllowed =
    pathname === "/pending" ||
    pathname === "/demo" ||
    pathname === "/api/access/me" ||
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.svg" ||
    pathname === "/og.png";
  if (alwaysAllowed) return { action: "allow" };

  const adminOnly =
    pathname === "/admin/users" || pathname.startsWith("/api/admin/users");
  if (adminOnly && (user.role !== "admin" || user.status !== "approved"))
    return acceptsHtml
      ? { action: "redirect", location: "/pending" }
      : { action: "deny", status: 403, message: "僅管理員可以管理使用者" };

  if (isApprovedAppUser(user)) return { action: "allow" };
  return acceptsHtml
    ? { action: "redirect", location: "/pending" }
    : {
        action: "deny",
        status: 403,
        message:
          user.status === "rejected"
            ? "此帳號的使用申請未獲核准"
            : "帳號正在等待管理員審核",
      };
}
