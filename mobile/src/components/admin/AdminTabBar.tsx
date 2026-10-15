import React from 'react';
import GlassTabBar from '../GlassTabBar';

export type AdminTab = 'dashboard' | 'menu' | 'notifications';

const TABS = [
  { key: 'dashboard', label: 'Dashboard', icon: 'home' as const },
  { key: 'menu', label: 'Menu', icon: 'apps' as const },
  { key: 'notifications', label: 'Notifications', icon: 'notification' as const },
];

interface Props {
  active: AdminTab;
  onSelect: (tab: AdminTab) => void;
}

// The admin portal's persistent bottom nav (design: 3-tab) — the dashboard,
// the full menu and notifications. Every other admin screen is a pushed route
// with its own back button.
export default function AdminTabBar({ active, onSelect }: Props) {
  return <GlassTabBar variant="admin" items={TABS} activeKey={active} onSelect={(key) => onSelect(key as AdminTab)} />;
}
