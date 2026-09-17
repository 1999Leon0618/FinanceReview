import handler from "vinext/server/fetch-handler";
import { appAccessDecision, ensureCurrentAppUser } from "./lib/app-users";
import { authenticateDataOwner } from "./lib/cloudflare-access";
import { runWithDataOwner } from "./lib/data-owner";
import { runWithD1Database, type D1DatabaseBinding } from "./lib/db";
import { runWithResearchSecret } from "./lib/research-secret-context";
import { generateScheduledReports } from "./lib/research-weekly";

type WorkerEnvironment = {
  DB: D1DatabaseBinding;
  POLICY_AUD?: string;
  TEAM_DOMAIN?: string;
  RESEARCH_KEY_ENCRYPTION_KEY?: string;
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
    const response = (await runWithDataOwner(owner, () =>
      runWithResearchSecret(environment.RESEARCH_KEY_ENCRYPTION_KEY, () =>
        runWithD1Database(environment.DB, async () => {
          const user = await ensureCurrentAppUser();
          const url = new URL(request.url);
          const decision = appAccessDecision(
            user,
            url.pathname,
            request.headers.get("accept")?.includes("text/html") ?? false,
          );
          if (decision.action === "redirect")
            return Response.redirect(new URL(decision.location, url), 302);
          if (decision.action === "deny")
            return Response.json(
              { error: decision.message, accessStatus: user.status },
              { status: decision.status },
            );
          return handler.fetch(request, environment, context);
        }),
      ),
    )) as Response;
    const secured = new Response(response.body, response);
    secured.headers.set("Cache-Control", "private, no-store");
    return secured;
  },
  async scheduled(
    _controller: unknown,
    environment: WorkerEnvironment,
  ): Promise<void> {
    await runWithResearchSecret(environment.RESEARCH_KEY_ENCRYPTION_KEY, () =>
      runWithD1Database(environment.DB, async () => {
        const result = await generateScheduledReports();
        if (result.failed > 0)
          console.error(
            `每週研究報告：${result.failed}/${result.total} 位使用者生成失敗`,
          );
      }),
    );
  },
};

export default worker;
