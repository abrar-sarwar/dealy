/** DI token for the jose JWKS key resolver (remote in prod, local in tests). */
export const JWKS_RESOLVER = Symbol('JWKS_RESOLVER');

/** Reflector metadata keys. */
export const IS_PUBLIC_KEY = 'dealy:isPublic';
export const ROLES_KEY = 'dealy:roles';
