/**
 * RBAC middleware: ensures req.user has at least one of the specified allowed roles.
 * @param  {...string} allowedRoles 
 */
export const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized: Authentication required' });
    }

    const userRole = (req.user.role || '').toUpperCase();
    const normalizedAllowed = allowedRoles.map(r => r.toUpperCase());

    if (!normalizedAllowed.includes(userRole)) {
      return res.status(403).json({
        error: `Forbidden: Access requires one of [${normalizedAllowed.join(', ')}] role(s)`,
      });
    }

    next();
  };
};

export default {
  requireRole,
};
