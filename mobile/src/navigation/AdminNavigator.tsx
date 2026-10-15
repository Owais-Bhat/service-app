import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AdminHomeScreen from '../screens/admin/AdminHomeScreen';
import AdminMenuScreen from '../screens/admin/AdminMenuScreen';
import EmployeesScreen from '../screens/admin/EmployeesScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import LiveLocationsScreen from '../screens/LiveLocationsScreen';
import AdminServiceRequestsScreen from '../screens/AdminServiceRequestsScreen';
import AdminInstallationsScreen from '../screens/AdminInstallationsScreen';
import LeaveAdminScreen from '../screens/LeaveAdminScreen';
import AssignmentQueueScreen from '../screens/AssignmentQueueScreen';
import ServicePricingScreen from '../screens/ServicePricingScreen';
import ContactsScreen from '../screens/ContactsScreen';
import BusinessFinanceScreen from '../screens/admin/BusinessFinanceScreen';
import EmployeePanelScreen from '../screens/EmployeePanelScreen';
import DeviceDetailScreen from '../screens/DeviceDetailScreen';
import AttendanceLogsScreen from '../screens/admin/AttendanceLogsScreen';
import EodSummariesScreen from '../screens/admin/EodSummariesScreen';
import JobCardsAdminScreen from '../screens/admin/JobCardsAdminScreen';
import DeviceTrackingAdminScreen from '../screens/admin/DeviceTrackingAdminScreen';
import ResponseTimesScreen from '../screens/admin/ResponseTimesScreen';
import ServiceLogScreen from '../screens/admin/ServiceLogScreen';
import BonusReviewsAdminScreen from '../screens/admin/BonusReviewsAdminScreen';
import PaymentsScreen from '../screens/admin/PaymentsScreen';
import BillsScreen from '../screens/admin/BillsScreen';
import CashCollectionsScreen from '../screens/admin/CashCollectionsScreen';
import SalaryScreen from '../screens/admin/SalaryScreen';
import GigPayoutsScreen from '../screens/admin/GigPayoutsScreen';
import CouponsScreen from '../screens/admin/CouponsScreen';
import DiscountDetailsScreen from '../screens/admin/DiscountDetailsScreen';
import UsersScreen from '../screens/admin/UsersScreen';
import ComplaintsAdminScreen from '../screens/admin/ComplaintsAdminScreen';
import QueriesScreen from '../screens/admin/QueriesScreen';
import NoticesAdminScreen from '../screens/admin/NoticesAdminScreen';
import AdsAdminScreen from '../screens/admin/AdsAdminScreen';
import PartiesScreen from '../screens/admin/PartiesScreen';
import AmcScreen from '../screens/admin/AmcScreen';
import SalesScreen from '../screens/admin/SalesScreen';
import PurchasesScreen from '../screens/admin/PurchasesScreen';
import StockScreen from '../screens/admin/StockScreen';
import ItemsScreen from '../screens/admin/ItemsScreen';
import LedgerScreen from '../screens/admin/LedgerScreen';
import FinReportsScreen from '../screens/admin/FinReportsScreen';
import SettingsAdminScreen from '../screens/admin/SettingsAdminScreen';
import TrainingAdminScreen from '../screens/admin/TrainingAdminScreen';
import PerformanceScreen from '../screens/admin/PerformanceScreen';
import JobCostingScreen from '../screens/admin/JobCostingScreen';
import SitesDevicesScreen from '../screens/admin/SitesDevicesScreen';
import PastRecordsScreen from '../screens/admin/PastRecordsScreen';
import CampaignsScreen from '../screens/admin/CampaignsScreen';
import CollectionsScreen from '../screens/admin/CollectionsScreen';
import BusinessSettingsScreen from '../screens/admin/BusinessSettingsScreen';
import AccountScreen from '../screens/AccountScreen';
import TutorialsAdminScreen from '../screens/admin/TutorialsAdminScreen';
import AiReportScreen from '../screens/admin/AiReportScreen';
import MigrationScreen from '../screens/admin/MigrationScreen';
import AttendanceReportScreen from '../screens/admin/AttendanceReportScreen';
import JobMaterialsScreen from '../screens/JobMaterialsScreen';
import ClientFeedbackScreen from '../screens/admin/ClientFeedbackScreen';
import RequestReportsScreen from '../screens/admin/RequestReportsScreen';
import DailyReportScreen from '../screens/admin/DailyReportScreen';
import AiAssistantScreen from '../screens/AiAssistantScreen';
import CalendarScreen from '../screens/CalendarScreen';
import StatsAdminScreen from '../screens/admin/StatsAdminScreen';
import AutoAssignmentScreen from '../screens/admin/AutoAssignmentScreen';
import AssignmentTrackerScreen from '../screens/admin/AssignmentTrackerScreen';
import DeviceTypesScreen from '../screens/admin/DeviceTypesScreen';
import AdminRegisterRequestScreen from '../screens/admin/AdminRegisterRequestScreen';

type BackScreen = React.ComponentType<{ onBack: () => void }>;

// Every admin page that only needs a way back. Adding a page = one import and
// one line here, plus its route name in adminMenu.ts. The menu reads this
// registry to decide which rows are live and which still say "Soon".
export const ADMIN_SCREENS: Record<string, BackScreen> = {
  Notifications: NotificationsScreen,
  LiveLocations: LiveLocationsScreen,
  ServiceRequests: AdminServiceRequestsScreen,
  Installations: AdminInstallationsScreen,
  LeaveRequests: LeaveAdminScreen,
  AssignmentQueue: AssignmentQueueScreen,
  ServicePricing: ServicePricingScreen,
  Contacts: ContactsScreen,
  Finance: BusinessFinanceScreen,
  Attendance: AttendanceLogsScreen,
  EodSummaries: EodSummariesScreen,
  JobCards: JobCardsAdminScreen,
  ResponseTimes: ResponseTimesScreen,
  ServiceLog: ServiceLogScreen,
  BonusReviewsAdmin: BonusReviewsAdminScreen,
  Payments: PaymentsScreen,
  Bills: BillsScreen,
  CashCollections: CashCollectionsScreen,
  Salary: SalaryScreen,
  GigPayouts: GigPayoutsScreen,
  Coupons: CouponsScreen,
  DiscountDetails: DiscountDetailsScreen,
  Users: UsersScreen,
  Complaints: ComplaintsAdminScreen,
  Queries: QueriesScreen,
  Notices: NoticesAdminScreen,
  Ads: AdsAdminScreen,
  Parties: PartiesScreen,
  Amc: AmcScreen,
  Sales: SalesScreen,
  Purchases: PurchasesScreen,
  Stock: StockScreen,
  Items: ItemsScreen,
  Ledger: LedgerScreen,
  FinReports: FinReportsScreen,
  Settings: SettingsAdminScreen,
  TrainingAdmin: TrainingAdminScreen,
  Performance: PerformanceScreen,
  JobCosting: JobCostingScreen,
  SitesDevices: SitesDevicesScreen,
  PastRecords: PastRecordsScreen,
  Campaigns: CampaignsScreen,
  Collections: CollectionsScreen,
  BusinessSettings: BusinessSettingsScreen,
  Profile: AccountScreen,
  TutorialsAdmin: TutorialsAdminScreen,
  AiReport: AiReportScreen,
  Migration: MigrationScreen,
  AttendanceReport: AttendanceReportScreen,
  JobMaterials: JobMaterialsScreen,
  ClientFeedback: ClientFeedbackScreen,
  RequestReports: RequestReportsScreen,
  DailyReport: DailyReportScreen,
  AiAssistant: AiAssistantScreen,
  Calendar: CalendarScreen,
  Stats: StatsAdminScreen,
  AutoAssignment: AutoAssignmentScreen,
  AssignmentTracker: AssignmentTrackerScreen,
  DeviceTypes: DeviceTypesScreen,
  RegisterRequest: AdminRegisterRequestScreen,
};

type AdminStackParams = {
  Home: undefined;
  Menu: undefined;
  Employees: undefined;
  DeviceDetail: { inquiryId: string };
  EmployeePanel: { employeeId: string; employeeName: string; employeeRole?: string };
} & Record<string, undefined>;

const Stack = createNativeStackNavigator<AdminStackParams>();

function makeRoute(Component: BackScreen) {
  return function AdminRoute({ navigation }: any) {
    return <Component onBack={() => navigation.goBack()} />;
  };
}

function ServiceRequestsRoute({ navigation }: any) {
  return <AdminServiceRequestsScreen onBack={() => navigation.goBack()} onRegister={() => navigation.navigate('RegisterRequest')} />;
}

const ROUTES: Record<string, React.ComponentType<any>> = Object.fromEntries(
  Object.entries(ADMIN_SCREENS).map(([name, C]) => [name, name === 'ServiceRequests' ? ServiceRequestsRoute : makeRoute(C)]),
);
const AVAILABLE = new Set<string>([...Object.keys(ADMIN_SCREENS), 'Employees', 'DeviceTracking']);

function HomeRoute({ navigation }: any) {
  return (
    <AdminHomeScreen
      onTab={(tab) => navigation.navigate(tab === 'menu' ? 'Menu' : tab === 'notifications' ? 'Notifications' : 'Home')}
      onOpen={(route) => navigation.navigate(route)}
      onOpenNotifications={() => navigation.navigate('Notifications')}
    />
  );
}

function MenuRoute({ navigation }: any) {
  return (
    <AdminMenuScreen
      available={AVAILABLE}
      onOpen={(route) => navigation.navigate(route)}
      onTab={(tab) => navigation.navigate(tab === 'menu' ? 'Menu' : tab === 'notifications' ? 'Notifications' : 'Home')}
    />
  );
}

function EmployeesRoute({ navigation }: any) {
  return (
    <EmployeesScreen
      onBack={() => navigation.goBack()}
      onOpen={(emp) => navigation.navigate('EmployeePanel', { employeeId: emp.id, employeeName: emp.full_name, employeeRole: emp.role })}
    />
  );
}

function DeviceTrackingRoute({ navigation }: any) {
  return <DeviceTrackingAdminScreen onBack={() => navigation.goBack()} onOpenDevice={(inquiryId) => navigation.navigate('DeviceDetail', { inquiryId })} />;
}

function DeviceDetailRoute({ navigation, route }: any) {
  return <DeviceDetailScreen inquiryId={route.params.inquiryId} onBack={() => navigation.goBack()} />;
}

function EmployeePanelRoute({ navigation, route }: any) {
  const { employeeId, employeeName, employeeRole } = route.params;
  return <EmployeePanelScreen employeeId={employeeId} employeeName={employeeName} employeeRole={employeeRole} onBack={() => navigation.goBack()} />;
}

export default function AdminNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Home" component={HomeRoute} options={{ animation: 'none' }} />
      <Stack.Screen name="Menu" component={MenuRoute} options={{ animation: 'none' }} />
      <Stack.Screen name="Employees" component={EmployeesRoute} options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="DeviceTracking" component={DeviceTrackingRoute} options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="DeviceDetail" component={DeviceDetailRoute} options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="EmployeePanel" component={EmployeePanelRoute} options={{ animation: 'slide_from_right' }} />
      {Object.entries(ROUTES).map(([name, component]) => (
        <Stack.Screen key={name} name={name} component={component} options={{ animation: 'slide_from_right' }} />
      ))}
    </Stack.Navigator>
  );
}
