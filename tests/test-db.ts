export function assertTestDatabase(): URL {
  const raw = process.env.DATABASE_URL;

  if (!raw) {
    throw new Error("DATABASE_URL is not set. Tests must load .env.test.");
  }

  const url = new URL(raw);
  const name = decodeURIComponent(url.pathname.replace(/^\//, ""));

  if (!name.endsWith("_test")) {
    throw new Error(
      `Refusing to run tests: database "${name}" does not end with "_test". Check .env.test.`,
    );
  }

  return url;
}
