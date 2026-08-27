export default async function teardown() {
  // Next.js 關閉前仍持有 SQLite WAL；下次 globalSetup 會在服務啟動前安全清除。
}
