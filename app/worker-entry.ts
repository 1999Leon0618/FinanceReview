import handler from "vinext/server/fetch-handler";
import { runWithD1Database, type D1DatabaseBinding } from "./lib/db";

type WorkerEnvironment = {
  DB: D1DatabaseBinding;
};

type WorkerContext = {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
};

const worker = {
  fetch(
    request: Request,
    environment: WorkerEnvironment,
    context: WorkerContext,
  ): Promise<Response> {
    return runWithD1Database(environment.DB, () =>
      handler.fetch(request, environment, context),
    );
  },
};

export default worker;
