import handler from "vinext/server/fetch-handler";
import { authenticateDataOwner } from "./lib/cloudflare-access";
import { runWithDataOwner } from "./lib/data-owner";
import { runWithD1Database, type D1DatabaseBinding } from "./lib/db";

type WorkerEnvironment = {
  DB: D1DatabaseBinding;
  POLICY_AUD?: string;
  TEAM_DOMAIN?: string;
};

type WorkerContext = {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
  access?: {
    aud: string;
    getIdentity(): Promise<{ email?: string } | null>;
  };
};

const worker = {
  async fetch(
    request: Request,
    environment: WorkerEnvironment,
    context: WorkerContext,
  ): Promise<Response> {
    let owner;
    try {
      owner = await authenticateDataOwner(request, environment, context);
    } catch {
      return new Response("未通過 Cloudflare Access 身分驗證", { status: 403 });
    }
    return runWithDataOwner(owner, () =>
      runWithD1Database(environment.DB, () =>
        handler.fetch(request, environment, context),
      ),
    );
  },
};

export default worker;
