/**
 * TODO: implement the requireRole middleware factory.
 *
 * Purpose: restricts a route to specific User.userType values (e.g. only
 * COMPANY_OWNER or STAFF can create a menu item). Generic and reusable
 * across every module — the list of allowed roles is the only thing that
 * changes per route.
 *
 * Suggested signature:
 *   requireRole(...allowed: UserType[]) => (req, res, next) => void
 * (import the UserType enum from the generated Prisma client)
 *
 * Behavior to implement:
 * - read req.user (set by requireAuth — this middleware assumes requireAuth
 *   already ran on this route; req.user will be undefined otherwise)
 * - if req.user is missing, or req.user.userType is not in `allowed`,
 *   call next(new AppError(403, "Forbidden"))
 * - otherwise call next()
 *
 * IMPORTANT ordering requirement: this must always be mounted AFTER
 * requireAuth on a route, e.g.:
 *   router.post("/menu-items", requireAuth, requireRole("COMPANY_OWNER", "STAFF"), ...)
 * requireRole has nothing to check without requireAuth having run first.
 */
