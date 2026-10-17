import { AuthUser } from '../api/auth';
import { ADMIN_MENU } from './adminMenu';

// An admin account can be limited to chosen modules. The ids are the web
// portal's sidebar page ids, the same ones the server enforces
// (server/modules/admin-access.cjs). null = a full admin.
export type ModuleSet = Set<string> | null;

// A stored value (JSON text, a list or nothing) -> a set, or null for "everything".
export function parseModuleList(raw: string | string[] | null | undefined): ModuleSet {
  if (raw === null || raw === undefined || raw === '') return null;
  try {
    const v = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(v) ? new Set(v.map(String)) : null;
  } catch {
    // An unreadable limit must not turn into full access.
    return new Set();
  }
}

export function parseAdminModules(user: Pick<AuthUser, 'role' | 'admin_modules'> | null | undefined): ModuleSet {
  if (!user || user.role !== 'admin') return null;
  return parseModuleList(user.admin_modules);
}

// Screens that are not menu entries but still belong to a module.
const EXTRA: Record<string, string[]> = {
  RegisterRequest: ['inquiries'],
  DeviceDetail: ['device-tracking'],
  EmployeePanel: ['employee-panel'],
};

const BY_ROUTE = new Map<string, string[]>();
ADMIN_MENU.flatMap((g) => g.items).forEach((i) => {
  if (i.route && i.module) BY_ROUTE.set(i.route, ([] as string[]).concat(i.module));
});
Object.entries(EXTRA).forEach(([route, mods]) => BY_ROUTE.set(route, mods));

// Whether a limited admin may open this screen. Screens with no module
// (Home, Menu, Notifications, My Profile) are open to every admin.
export function canOpenRoute(modules: ModuleSet, route: string): boolean {
  if (!modules) return true;
  const need = BY_ROUTE.get(route);
  return !need || need.some((m) => modules.has(m));
}

export function canUseModule(modules: ModuleSet, ...ids: string[]): boolean {
  return !modules || ids.some((id) => modules.has(id));
}
