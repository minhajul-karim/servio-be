/**
 * TODO: implement the not-found (404) handler.
 *
 * Purpose: catches any request that didn't match any registered route, and
 * responds with a clean 404 JSON body instead of Express's default HTML
 * error page.
 *
 * Mounting position matters: this must be registered in app.ts AFTER every
 * real route, but BEFORE error-handler.ts. If it were mounted earlier, it
 * would swallow requests meant for routes defined after it.
 *
 * Behavior to implement: a plain Express middleware (req, res) — no need
 * to call next() — that responds with status 404 and a small JSON message,
 * e.g. { message: "Not found" }. Doesn't need to be a 4-arg middleware like
 * error-handler.ts; this one isn't handling an error, just an unmatched route.
 */
