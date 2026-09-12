import React, { useCallback, useEffect, useState } from 'react';
import { Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AnimatedStatCard from '../components/AnimatedStatCard';
import MeshBackground from '../components/MeshBackground';
import GlassTabBar from '../components/GlassTabBar';
import MoreSheet from '../components/MoreSheet';
import GlowButton from '../components/GlowButton';
import GlassCard from '../components/GlassCard';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import { brand, semantic } from '../theme/tokens';
import { fetchAllUsers, fetchOpenInquiries, AdminUserRow, InquiryRow } from '../api/admin';
import { dataGet } from '../api/client';
import EmployeePanelScreen from './EmployeePanelScreen';
import LeaveAdminScreen from './LeaveAdminScreen';
import AssignmentQueueScreen from './AssignmentQueueScreen';
import ServicePricingScreen from './ServicePricingScreen';
import ContactsScreen from './ContactsScreen';
import FinanceSummaryScreen from './FinanceSummaryScreen';

interface EmployeePickRow {
  id: string;
  full_name: string;
  role?: string;
}

const TABS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'more', label: 'More' },
];

interface Props {
  onOpenNotifications: () => void;
  onOpenLiveLocations: () => void;
}

export default function AdminDashboardScreen({ onOpenNotifications, onOpenLiveLocations }: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { user, logout } = useAuth();
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [inquiries, setInquiries] = useState<InquiryRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [moreVisible, setMoreVisible] = useState(false);

  const [showLeaveAdmin, setShowLeaveAdmin] = useState(false);
  const [showAssignmentQueue, setShowAssignmentQueue] = useState(false);
  const [showServicePricing, setShowServicePricing] = useState(false);
  const [showContacts, setShowContacts] = useState(false);
  const [showFinance, setShowFinance] = useState(false);

  const [employeePickerVisible, setEmployeePickerVisible] = useState(false);
  const [employeeList, setEmployeeList] = useState<EmployeePickRow[]>([]);
  const [employeeListLoading, setEmployeeListLoading] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeePickRow | null>(null);

  const MORE_SECTIONS = [
    { label: 'Job Cards' },
    { label: 'Leave Requests', onPress: () => setShowLeaveAdmin(true) },
    { label: 'Assignment Queue', onPress: () => setShowAssignmentQueue(true) },
    { label: 'Service Pricing', onPress: () => setShowServicePricing(true) },
    { label: 'Contacts', onPress: () => setShowContacts(true) },
    { label: 'Finance', onPress: () => setShowFinance(true) },
    { label: 'Discounts' },
    { label: 'Device Tracking' },
    { label: 'Live Locations', onPress: onOpenLiveLocations },
    { label: 'Training' },
    { label: 'Media Training' },
    { label: 'Stats' },
    { label: 'Admin Notices' },
    { label: 'Collections' },
    { label: 'AI Assistant' },
    { label: 'Notifications', onPress: onOpenNotifications },
    { label: 'Dashboard Widgets' },
    { label: 'Profile' },
    {
      label: 'Employee Panel',
      onPress: async () => {
        setEmployeePickerVisible(true);
        setEmployeeListLoading(true);
        try {
          const data = await dataGet<EmployeePickRow[]>('profiles', { select: 'id,full_name,role', order: 'full_name:asc' });
          setEmployeeList(data);
        } catch {
          setEmployeeList([]);
        } finally {
          setEmployeeListLoading(false);
        }
      },
    },
  ];

  const load = useCallback(async () => {
    try {
      const [u, inq] = await Promise.all([fetchAllUsers(), fetchOpenInquiries()]);
      setUsers(u);
      setInquiries(inq);
      setError(null);
    } catch {
      setError('Could not load dashboard — pull to retry');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const employeeCount = users.filter((u) => u.role === 'employee').length;
  const openCount = inquiries.filter((i) => i.status !== 'resolved' && i.status !== 'case_closed').length;
  const unassignedCount = inquiries.filter((i) => i.assignment_status === 'none' || i.assignment_status === 'pending').length;

  if (showLeaveAdmin) return <LeaveAdminScreen onBack={() => setShowLeaveAdmin(false)} />;
  if (showAssignmentQueue) return <AssignmentQueueScreen onBack={() => setShowAssignmentQueue(false)} />;
  if (showServicePricing) return <ServicePricingScreen onBack={() => setShowServicePricing(false)} />;
  if (showContacts) return <ContactsScreen onBack={() => setShowContacts(false)} />;
  if (showFinance) return <FinanceSummaryScreen onBack={() => setShowFinance(false)} />;

  if (selectedEmployee) {
    return (
      <EmployeePanelScreen
        employeeId={selectedEmployee.id}
        employeeName={selectedEmployee.full_name}
        employeeRole={selectedEmployee.role}
        onBack={() => setSelectedEmployee(null)}
      />
    );
  }

  return (
    <View style={styles.root}>
      <MeshBackground />
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + spacing(4), paddingBottom: spacing(24), paddingHorizontal: spacing(4) }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={semantic.success} />}
      >
        <Text style={[styles.title, { color: theme.text }]}>Admin</Text>
        <Text style={[styles.caption, { color: theme.text3 }]}>{user?.full_name}</Text>

        {error ? <Text style={[styles.caption, { color: semantic.danger, marginTop: spacing(3) }]}>{error}</Text> : null}

        <View style={styles.row}>
          <AnimatedStatCard label="Employees" value={employeeCount} accentColor={semantic.success} delayMs={0} />
          <AnimatedStatCard label="Open Tickets" value={openCount} accentColor={semantic.warning} delayMs={100} />
        </View>
        <View style={[styles.row, { marginTop: spacing(3) }]}>
          <AnimatedStatCard label="Needs Assignment" value={unassignedCount} accentColor={semantic.danger} delayMs={200} />
        </View>

        <GlowButton label="Sign Out" onPress={logout} />
      </ScrollView>

      <GlassTabBar
        items={TABS}
        activeKey={moreVisible ? 'more' : 'dashboard'}
        onSelect={(key) => setMoreVisible(key === 'more')}
      />
      <MoreSheet visible={moreVisible} sections={MORE_SECTIONS} onClose={() => setMoreVisible(false)} />

      <Modal visible={employeePickerVisible} transparent animationType="slide" onRequestClose={() => setEmployeePickerVisible(false)}>
        <View style={styles.modalScrim}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setEmployeePickerVisible(false)} />
          <View style={[styles.pickerSheet, { backgroundColor: theme.panel, paddingBottom: insets.bottom + spacing(4) }]}>
            <View style={[styles.grabber, { backgroundColor: theme.line }]} />
            <Text style={[styles.pickerTitle, { color: theme.text }]}>Select Employee</Text>
            <ScrollView style={{ maxHeight: 420 }}>
              {employeeListLoading ? (
                <Text style={[styles.caption, { color: theme.text3, textAlign: 'center', marginTop: spacing(6) }]}>Loading…</Text>
              ) : employeeList.length === 0 ? (
                <Text style={[styles.caption, { color: theme.text3, textAlign: 'center', marginTop: spacing(6) }]}>No employees found</Text>
              ) : (
                employeeList.map((emp) => (
                  <Pressable
                    key={emp.id}
                    onPress={() => { setEmployeePickerVisible(false); setSelectedEmployee(emp); }}
                    style={({ pressed }) => [styles.empRow, { borderBottomColor: theme.line, opacity: pressed ? 0.6 : 1 }]}
                  >
                    <View style={[styles.empAvatar, { backgroundColor: `${brand.primary}20` }]}>
                      <Text style={[styles.empAvatarText, { color: brand.primary }]}>
                        {(emp.full_name || '?').trim().charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.empName, { color: theme.text }]}>{emp.full_name}</Text>
                      {emp.role === 'team_lead' ? <Text style={[styles.empRole, { color: semantic.warning }]}>★ Team Lead</Text> : null}
                    </View>
                  </Pressable>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  row: { flexDirection: 'row', gap: spacing(3), marginTop: spacing(5) },
  title: { ...typography.title },
  caption: { ...typography.caption },
  modalScrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  pickerSheet: { borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingHorizontal: spacing(5), paddingTop: spacing(4) },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, marginBottom: spacing(3) },
  pickerTitle: { ...typography.heading, marginBottom: spacing(3) },
  empRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(3), paddingVertical: spacing(3), borderBottomWidth: 1 },
  empAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  empAvatarText: { fontSize: 15, fontWeight: '700' },
  empName: { ...typography.body },
  empRole: { ...typography.caption, fontWeight: '600' },
});
