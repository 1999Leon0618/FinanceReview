import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';

export default async function setup() {
  const directory = path.join(process.cwd(), '.test-data');
  await rm(directory, { recursive: true, force: true });
  await mkdir(directory, { recursive: true });
}
