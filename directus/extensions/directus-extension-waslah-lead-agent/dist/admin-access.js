// Only call with a server-loaded Directus identity, never a request-body flag.
export function hasSuperiorAccess(identity) {
  return identity?.status === 'active' && identity?.admin_access === true;
}

export function applyAdminPolicyScope(builder, userId, role) {
  builder.where('access.user', userId);
  // A null role must never match another user's directly assigned admin policy.
  if (role) builder.orWhere('access.role', role);
  return builder;
}

export function effectiveFeatureEnabled(globalEnabled, override, identity) {
  if (hasSuperiorAccess(identity)) return true;
  return override ? Boolean(override.enabled) : Boolean(globalEnabled);
}

export function platformAdminUrl(publicUrl) {
  try {
    const url = new URL(publicUrl);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    url.pathname = `${url.pathname.replace(/\/$/, '')}/admin/`;
    url.search = ''; url.hash = '';
    return url.href;
  } catch { return null; }
}
