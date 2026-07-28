/**
 * Which tenant a reasoning write belongs to.
 *
 * The security model says tenancy is a read filter, not a convention. That is
 * only true if there is exactly one place that decides what a caller's tenant
 * is, and it refuses rather than guesses. This is that place.
 *
 * Two shapes are allowed:
 *
 *   - A named project the caller is a member of. Membership is checked against
 *     `memberships` on every call; being able to name a project id is not
 *     evidence of anything.
 *   - The caller's PERSONAL tenant, `user:<id>`, when no project is named. The
 *     prefix is deliberate: a personal tenant can never collide with a project
 *     id, so a caller cannot reach another tenant's rows by passing their own
 *     user id as a project.
 *
 * Phase 1 attaches the reasoning workspace to a shared project properly. Until
 * then the personal tenant is the honest default — it is isolation without
 * pretending collaboration exists yet.
 */

/** Sentinel prefix so a personal tenant can never be confused with a project id. */
export const PERSONAL_PREFIX = 'user:';

export function personalTenant(userId) {
  return `${PERSONAL_PREFIX}${userId}`;
}

/**
 * Resolve the tenant for a request, or explain the refusal.
 *
 * Returns `{ ok: true, projectId }` or `{ ok: false, status, code, message }`.
 * Never returns a tenant the caller has not proven access to.
 */
export function resolveTenant(db, user, requestedProjectId = null) {
  if (!user?.id) {
    return { ok: false, status: 401, code: 'unauthorized', message: 'Reasoning writes require an identified user.' };
  }
  if (requestedProjectId === null || requestedProjectId === undefined || requestedProjectId === '') {
    return { ok: true, projectId: personalTenant(user.id) };
  }

  const requested = String(requestedProjectId);
  if (requested.startsWith(PERSONAL_PREFIX)) {
    // Someone else's personal tenant is never addressable, and your own is
    // reached by omitting the field — accepting it here would be a second path
    // to the same rows, and second paths are where isolation bugs live.
    return {
      ok: false, status: 403, code: 'forbidden',
      message: 'A personal tenant cannot be addressed by name. Omit projectId to use your own.',
    };
  }

  const member = db.prepare('SELECT role FROM memberships WHERE project_id = ? AND user_id = ?')
    .get(requested, String(user.id));
  if (!member) {
    // Deliberately the same answer whether the project does not exist or the
    // caller is simply not in it: distinguishing them leaks the project list.
    return { ok: false, status: 403, code: 'forbidden', message: 'No access to that project.' };
  }
  return { ok: true, projectId: requested, role: member.role };
}
