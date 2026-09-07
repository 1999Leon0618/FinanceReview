import { createRemoteJWKSet, jwtVerify } from "jose";
import { dataOwnerFromEmail, type DataOwner } from "./data-owner";

type AccessEnvironment = {
  POLICY_AUD?: string;
  TEAM_DOMAIN?: string;
};

type AccessContext = {
  access?: {
    aud: string;
    getIdentity(): Promise<{ email?: string } | null>;
  };
};

const keySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function remoteKeySet(teamDomain: string) {
  let keys = keySets.get(teamDomain);
  if (!keys) {
    keys = createRemoteJWKSet(
      new URL(`${teamDomain.replace(/\/$/, "")}/cdn-cgi/access/certs`),
    );
    keySets.set(teamDomain, keys);
  }
  return keys;
}

export async function authenticateDataOwner(
  request: Request,
  environment: AccessEnvironment,
  context: AccessContext,
): Promise<DataOwner> {
  const identity = await context.access?.getIdentity();
  if (identity?.email) return dataOwnerFromEmail(identity.email);

  const token = request.headers.get("cf-access-jwt-assertion");
  const teamDomain = environment.TEAM_DOMAIN?.replace(/\/$/, "");
  const audience = environment.POLICY_AUD;
  if (!token || !teamDomain || !audience)
    throw new Error("缺少 Cloudflare Access 驗證資訊");

  const { payload } = await jwtVerify(token, remoteKeySet(teamDomain), {
    issuer: teamDomain,
    audience,
  });
  if (typeof payload.email !== "string")
    throw new Error("Cloudflare Access Token 未包含登入郵箱");
  return dataOwnerFromEmail(payload.email);
}
