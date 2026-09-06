import { mkdir } from "node:fs/promises";
import path from "node:path";

export default async function setup() {
  const directory = path.join(process.cwd(), ".test-data");
  await mkdir(directory, { recursive: true });
}
