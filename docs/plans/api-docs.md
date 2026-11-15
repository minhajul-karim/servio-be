# API documentation plan

Status: implemented (2026-11-15), all 3 steps verified; uncommitted on `feat/api-docs`

Goal: the frontend team can read the auth API, try it live, and generate TypeScript types, from one source that can't drift from the code.

Branch: `feat/api-docs` (created from `main` after PR #1 merged, 2026-11-15).

## How people try it before we deploy

The docs page has a "Try it" button that sends real requests to whatever server the page points at. Until we deploy, that's a local backend:

1. Run `docker compose up -d` and `pnpm dev`.
2. Open `http://localhost:5000/docs` and send requests from there.

A frontend dev can do the same on their own machine. Postman users can import `http://localhost:5000/openapi.json`. Once we deploy, we add the deployed URL to the spec's `servers` list, and the same page works against it.

Note: login needs the OTP email, so trying login locally needs working `GMAIL_*` values in `.env`, or reading the code from the DB.

---

## Decision 1: where does the spec come from?

|                          | A. Generated from the existing zod schemas     | B. Hand-written `openapi.yaml` | C. Postman collection only |
| ------------------------ | ---------------------------------------------- | ------------------------------ | -------------------------- |
| Can drift from the code  | Hard to: change the schema and the docs change | Easily                         | Easily                     |
| FE can generate TS types | Yes                                            | Yes                            | No                         |
| Effort                   | Medium, one-time                               | Low, then ongoing              | Low, then ongoing          |

**Pick A.** Request bodies are already zod schemas in `auth.schema.ts`, so the docs reuse the validation rules. B and C are second copies that go stale.

## Decision 2: which library turns zod into OpenAPI?

|                       | A. `zod-openapi` (v6, zod ^4)                                  | B. `@asteasolutions/zod-to-openapi` (v9, zod ^4)      | C. zod's built-in `z.toJSONSchema()` + hand-written paths      |
| --------------------- | -------------------------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------- |
| How                   | One plain object describing the paths, with zod schemas inside | A "registry": call `registerPath(...)` for each route | Convert schemas yourself and write the OpenAPI wrapper by hand |
| Extra code on schemas | `.meta({ description, example })` (native zod 4)               | `extendZodWithOpenApi(z)` patch + `.openapi(...)`     | None                                                           |
| Effort                | Low                                                            | Low–medium                                            | Medium, more boilerplate                                       |

**Pick A.** It uses zod 4's own `.meta()` with no patching, and the spec is a single readable object. B's global patch is more magic, and C means hand-writing everything except the bodies.

## Decision 3: which docs page?

|                   | A. Scalar (`@scalar/express-api-reference`) | B. Swagger UI (`swagger-ui-express`) | C. Redoc         |
| ----------------- | ------------------------------------------- | ------------------------------------ | ---------------- |
| Try requests live | Yes                                         | Yes                                  | No (read-only)   |
| Look              | Modern, readable, shows code samples        | Classic, familiar                    | Clean, read-only |
| Setup             | One middleware                              | One middleware                       | One middleware   |

**Pick A.** It costs the same to set up as Swagger UI, and it's easier to read: it has search and copy-ready fetch/curl/axios samples. Swagger UI is better known, but the real standard is the OpenAPI file, and both pages show that same file, so switching later takes minutes. C can't send requests.

## Decision 4: where is `/docs` available?

|                        | A. All environments, production included                               | B. Non-production only (+ separate demo server) | C. Behind an `API_DOCS_ENABLED` env flag |
| ---------------------- | ---------------------------------------------------------------------- | ----------------------------------------------- | ---------------------------------------- |
| Recruiters / portfolio | Open `<prod>/docs` and try it live                                     | Need an extra demo deploy                       | Works once turned on                     |
| Secrecy                | None lost: the repo is public, so routes are already visible on GitHub | Hides what's already public                     | Same as A when on                        |
| Effort                 | Smallest                                                               | Extra deployment                                | Extra env var nobody turns off           |

**Pick A.** The user wants to show recruiters live, interactive docs. Hiding routes of a public repo protects nothing, and the existing rate limits cover abuse from "Try it". B costs a second deployment, and C adds a flag with no use.

## Decision 6: how does a visitor try the logged-in routes?

Login sends a one-time code by email, so trying `/me` needs a real inbox.

|                     | A. Sign up with your own email                     | B. Shared demo account with a fixed code | C. No login, routes described only |
| ------------------- | -------------------------------------------------- | ---------------------------------------- | ---------------------------------- |
| New code            | None, plus a "how to try it" note on the docs page | An OTP bypass                            | None                               |
| Risk                | None                                               | Anyone can log in as the demo user       | None                               |
| Shows the real flow | Yes                                                | Partly                                   | No                                 |

**Pick A.** The real register → verify → OTP flow is the impressive part, and it costs only a short note. B puts a backdoor in the auth code, and C hides the best part.

## Decision 7: how does CI catch an undocumented route?

|              | A. Test reads the real routes from the Express router                                    | B. Test has a hand-written route list | C. No test, the reviewer checks |
| ------------ | ---------------------------------------------------------------------------------------- | ------------------------------------- | ------------------------------- |
| Can go stale | No, the list comes from the app                                                          | Yes, someone forgets to update it     | Yes, relies on memory           |
| Effort       | Small: walk `authRoutes.stack` (each layer's `route.path` + methods), prefix `/api/auth` | Small                                 | None                            |

**Pick A.** The list comes straight from the code. B is a second copy that drifts, which is the problem this test exists to solve, and C relies on someone remembering.

## Decision 8: where does the docs code live as modules grow?

|                      | A. Per-module `<module>.openapi.ts` + one combining file | B. One big `src/docs/openapi.ts` | C. Inside each `*.routes.ts` |
| -------------------- | -------------------------------------------------------- | -------------------------------- | ---------------------------- |
| Size as modules grow | Each file stays small                                    | One file keeps growing           | Routes files get noisy       |
| Fits existing layout | Yes, like `tests/<module>/`                              | No                               | Mixes routing and docs       |

**Pick A.** A module's docs sit next to its code, and `src/docs/openapi.ts` only combines them. B becomes a long file everyone edits, and C buries the routing.

---

## What gets documented

- All 12 auth routes: request body or query, success response, and every error status the route can return (`400`, `401`, `403`, `409`, `413`, `429`, `503`) with the `{ message, code?, retryAfterSeconds?, details? }` shape. Each documented `code` (e.g. `EMAIL_NOT_VERIFIED`, `OTP_LOCKED`, `EMAIL_SEND_FAILED`) is listed on the route that returns it.
- A `bearerAuth` security scheme on `/change-password` and `/me`, so the docs page's "Authorize" button accepts an access token.
- Reusable components: `User` (the public fields), `Tokens`, `Error`.
- `servers`: `http://localhost:5000` for now.
- A short "How to try it" note in the spec's `info.description`, shown at the top of `/docs`: 1) register with your real email, 2) click the verification link, 3) log in and enter the emailed code, 4) paste the access token into "Authorize".

## Frontend impact

- The docs page becomes the source for **per-endpoint facts**: fields, limits, status codes and error `code`s.
- `docs/frontend-handoff.md` keeps only **screen-level advice** (loading states, what to show on which error) and links to `/docs` for details.
- Step 2 moves the endpoint facts out of the handoff file once the docs page covers them.

## Steps (implementer, one per run)

1. **Setup:**
   - Add `zod-openapi` and `@scalar/express-api-reference`.
   - Create `src/docs/openapi.ts`, which builds the spec and combines per-module path objects. It starts with one route (`/health`).
   - Helmet's default Content-Security-Policy blocks Scalar's script, so relax CSP for `/docs` only. Every other route keeps the strict default.
   - Serve `/openapi.json` and `/docs` in every environment.
   - Verify: open `/docs` locally, and "Try it" works on `/health`.
2. **Document the auth routes:**
   - Add response schemas (`User`, `Tokens`, `Error`).
   - Add a `.meta()` description and example on each request schema.
   - Add all 12 paths in `src/modules/auth/auth.openapi.ts`, and merge them in `src/docs/openapi.ts`.
   - Remove the per-endpoint facts from `docs/frontend-handoff.md` and link to `/docs` instead. Screen advice stays.
   - Verify: every route appears in `/docs`, and "Authorize" plus `/me` works with a real token.
3. **Guard test:**
   - A test that the spec is valid OpenAPI.
   - A test that reads every route from the `authRoutes` router stack (path + method, prefixed with `/api/auth`) and checks each one is in the spec, so a new route without docs fails CI. No hand-kept list.

## Decisions log

| #   | Decision                  | Chosen                                                                                                                                                                                           |
| --- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Spec source               | Generated from zod schemas (not hand-written YAML, not Postman-only)                                                                                                                             |
| 2   | Library                   | `zod-openapi` (not `@asteasolutions/zod-to-openapi`, not hand-rolled)                                                                                                                            |
| 3   | Docs UI                   | Scalar (not Swagger UI, not Redoc)                                                                                                                                                               |
| 4   | Availability              | `/docs` and `/openapi.json` in every environment, production included (repo is public; portfolio demo for recruiters)                                                                            |
| 4b  | Docs page vs handoff file | Docs page = per-endpoint facts (generated). Handoff file = screen advice only, links to `/docs` (not duplicated, not merged into OpenAPI descriptions)                                           |
| 5   | PR                        | Separate `feat/api-docs` PR after #1 merges                                                                                                                                                      |
| 6   | Trying logged-in routes   | Visitors sign up with their own email; "How to try it" note on `/docs` (not a shared demo account with an OTP bypass, not describe-only)                                                         |
| 7   | Undocumented-route guard  | Test reads routes from the Express router stack (not a hand-kept list, not review-only)                                                                                                          |
| 8   | Docs code layout          | Per-module `<module>.openapi.ts`, combined in `src/docs/openapi.ts` (not one big file, not inside routes files)                                                                                  |
| 9   | Scalar developer toolbar  | Shown everywhere (`showDeveloperTools: "always"`), since it's a demo project. Share upload stays blocked by CSP `connect-src 'self'` (not opening CSP to Scalar servers, not hiding the toolbar) |
