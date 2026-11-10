import { fail } from './errors.js';
export const permissions = {
  OWNER: ['dashboard', 'pos', 'orders', 'kitchen', 'menu', 'customers', 'payments', 'reports', 'chat', 'notifications', 'archives', 'staff', 'audit', 'settings'],
  CASHIER: ['dashboard', 'pos', 'orders', 'customers', 'payments', 'reports', 'chat', 'notifications'],
  KITCHEN: ['kitchen', 'chat', 'notifications'],
};
export function authorize(user, permission) {
  if (!user || !permissions[user.role]?.includes(permission)) fail(403, 'FORBIDDEN', 'You do not have permission for this operation.');
}
export const allowedOrderStatuses = {
  OWNER: ['CONFIRMED', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED'],
  CASHIER: ['CONFIRMED', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED'],
  KITCHEN: ['PREPARING', 'READY'],
};
export function authorizeOrderStatus(user, status) {
  if (!allowedOrderStatuses[user?.role]?.includes(status)) fail(403, 'FORBIDDEN', 'Your role cannot perform this order action.');
}
export const permit = permission => (req, res, next) => { try { authorize(req.user, permission); next(); } catch (error) { next(error); } };
export const safeUser = user => ({ id: user.id, name: user.name, email: user.email, role: user.role, active: user.active, archivedAt: user.archivedAt, createdAt: user.createdAt, permissions: permissions[user.role] });
