import React, { useEffect } from 'react';
import { NavigationContainer, DarkTheme, DefaultTheme, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as Notifications from 'expo-notifications';
import { resolveNotificationRoute } from '../notifications';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import { brand } from '../theme/tokens';
import AnimatedSplash from '../components/AnimatedSplash';
import LandingScreen from '../screens/LandingScreen';
import LoginScreen from '../screens/LoginScreen';
import ClientSubmitTicketScreen from '../screens/ClientSubmitTicketScreen';
import ClientTrackTicketScreen from '../screens/ClientTrackTicketScreen';
import EmployeeDashboardScreen from '../screens/EmployeeDashboardScreen';
import TaskDetailScreen from '../screens/TaskDetailScreen';
import AttendanceScreen from '../screens/AttendanceScreen';
import LeaveFormScreen from '../screens/LeaveFormScreen';
import JobToolsScreen from '../screens/JobToolsScreen';
import EstimatorScreen from '../screens/EstimatorScreen';
import DeviceFollowUpScreen from '../screens/DeviceFollowUpScreen';
import DeviceDetailScreen from '../screens/DeviceDetailScreen';
import EodReportScreen from '../screens/EodReportScreen';
import EarningsScreen from '../screens/EarningsScreen';
import ProfileScreen from '../screens/ProfileScreen';
import LeaderboardScreen from '../screens/LeaderboardScreen';
import BonusReviewsScreen from '../screens/BonusReviewsScreen';
import TrainingCoursesScreen from '../screens/TrainingCoursesScreen';
import CoursePlayerScreen from '../screens/CoursePlayerScreen';
import TutorialsScreen from '../screens/TutorialsScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import SettingsScreen from '../screens/SettingsScreen';
import AccountScreen from '../screens/AccountScreen';
import AiAssistantScreen from '../screens/AiAssistantScreen';
import InstallationsScreen from '../screens/InstallationsScreen';
import GigPoolScreen from '../screens/GigPoolScreen';
import ManageTasksScreen from '../screens/ManageTasksScreen';
import MyStatsScreen from '../screens/MyStatsScreen';
import ServicePricingScreen from '../screens/ServicePricingScreen';
import TeamLeadDashboardScreen from '../screens/TeamLeadDashboardScreen';
import AdminServiceRequestsScreen from '../screens/AdminServiceRequestsScreen';
import AdminNavigator from './AdminNavigator';
import CalendarScreen from '../screens/CalendarScreen';
import RegisterRequestScreen from '../screens/RegisterRequestScreen';
import JobMaterialsScreen from '../screens/JobMaterialsScreen';
import { AttendanceProvider } from '../context/AttendanceContext';
import ClockInGateModal from '../components/ClockInGateModal';

type GuestStackParams = {
  Landing: undefined;
  Login: undefined;
  SubmitTicket: undefined;
  TrackTicket: undefined;
};

type EmployeeStackParams = {
  Dashboard: undefined;
  TaskDetail: { ticketId: string };
  Attendance: undefined;
  LeaveForm: undefined;
  JobTools: undefined;
  Estimator: undefined;
  Account: undefined;
  AiAssistant: undefined;
  DeviceFollowUp: undefined;
  DeviceDetail: { inquiryId: string };
  EodReport: undefined;
  Earnings: undefined;
  Profile: undefined;
  Leaderboard: undefined;
  BonusReviews: undefined;
  TrainingCourses: undefined;
  CoursePlayer: { courseId: string };
  Tutorials: undefined;
  Notifications: undefined;
  Settings: undefined;
  Installations: undefined;
  GigPool: undefined;
  ManageTasks: undefined;
  MyStats: undefined;
  ServicePricing: undefined;
  AssignRequests: undefined;
  Calendar: undefined;
  RegisterRequest: undefined;
  JobMaterials: undefined;
};

const GuestStack = createNativeStackNavigator<GuestStackParams>();
const EmployeeStack = createNativeStackNavigator<EmployeeStackParams>();

function LandingRoute({ navigation }: any) {
  return <LandingScreen onStaffLogin={() => navigation.navigate('Login')} />;
}

function LoginRoute({ navigation }: any) {
  return <LoginScreen onBack={() => navigation.goBack()} />;
}

function SubmitTicketRoute({ navigation }: any) {
  return <ClientSubmitTicketScreen onBack={() => navigation.goBack()} />;
}

function TrackTicketRoute({ navigation }: any) {
  return <ClientTrackTicketScreen onBack={() => navigation.goBack()} />;
}

function GuestNavigator() {
  return (
    <GuestStack.Navigator screenOptions={{ headerShown: false }}>
      <GuestStack.Screen name="Landing" component={LandingRoute} />
      <GuestStack.Screen name="Login" component={LoginRoute} options={{ animation: 'slide_from_right' }} />
      <GuestStack.Screen name="SubmitTicket" component={SubmitTicketRoute} options={{ animation: 'slide_from_right' }} />
      <GuestStack.Screen name="TrackTicket" component={TrackTicketRoute} options={{ animation: 'slide_from_right' }} />
    </GuestStack.Navigator>
  );
}

function EmployeeDashboardRoute({ navigation }: any) {
  return (
    <EmployeeDashboardScreen
      onOpenTask={(ticketId) => navigation.navigate('TaskDetail', { ticketId })}
      onGoAttendance={() => navigation.navigate('Attendance')}
      onGoJobTools={() => navigation.navigate('JobTools')}
      onGoEarnings={() => navigation.navigate('Earnings')}
      onGoProfile={() => navigation.navigate('Profile')}
      onOpenNotifications={() => navigation.navigate('Notifications')}
      onOpenGigPool={() => navigation.navigate('GigPool')}
    />
  );
}

function TaskDetailRoute({ navigation, route }: any) {
  return <TaskDetailScreen ticketId={route.params.ticketId} onBack={() => navigation.goBack()} />;
}

function AttendanceRoute({ navigation }: any) {
  return (
    <AttendanceScreen
      onGoDashboard={() => navigation.navigate('Dashboard')}
      onGoJobTools={() => navigation.navigate('JobTools')}
      onGoEarnings={() => navigation.navigate('Earnings')}
      onGoProfile={() => navigation.navigate('Profile')}
      onOpenLeaveForm={() => navigation.navigate('LeaveForm')}
    />
  );
}

function LeaveFormRoute({ navigation }: any) {
  return <LeaveFormScreen onBack={() => navigation.goBack()} />;
}

function JobToolsRoute({ navigation }: any) {
  return (
    <JobToolsScreen
      onGoDashboard={() => navigation.navigate('Dashboard')}
      onGoAttendance={() => navigation.navigate('Attendance')}
      onGoEarnings={() => navigation.navigate('Earnings')}
      onGoProfile={() => navigation.navigate('Profile')}
      onOpenEstimator={() => navigation.navigate('Estimator')}
      onOpenDeviceFollowUp={() => navigation.navigate('DeviceFollowUp')}
      onOpenEodReport={() => navigation.navigate('EodReport')}
      onOpenInstallations={() => navigation.navigate('Installations')}
      onOpenGigPool={() => navigation.navigate('GigPool')}
      onOpenManageTasks={() => navigation.navigate('ManageTasks')}
      onOpenMyStats={() => navigation.navigate('MyStats')}
      onOpenServicePricing={() => navigation.navigate('ServicePricing')}
      onOpenAssignRequests={() => navigation.navigate('AssignRequests')}
      onOpenCalendar={() => navigation.navigate('Calendar')}
      onOpenAssistant={() => navigation.navigate('AiAssistant')}
      onOpenRegister={() => navigation.navigate('RegisterRequest')}
      onOpenMaterials={() => navigation.navigate('JobMaterials')}
    />
  );
}

function CalendarRoute({ navigation }: any) {
  return <CalendarScreen onBack={() => navigation.goBack()} />;
}

function RegisterRequestRoute({ navigation }: any) {
  return <RegisterRequestScreen onBack={() => navigation.goBack()} />;
}

function JobMaterialsRoute({ navigation }: any) {
  return <JobMaterialsScreen onBack={() => navigation.goBack()} />;
}

function ManageTasksRoute({ navigation }: any) {
  return <ManageTasksScreen onBack={() => navigation.goBack()} />;
}

function MyStatsRoute({ navigation }: any) {
  return <MyStatsScreen onBack={() => navigation.goBack()} />;
}

function ServicePricingRoute({ navigation }: any) {
  return <ServicePricingScreen onBack={() => navigation.goBack()} />;
}

function InstallationsRoute({ navigation }: any) {
  return <InstallationsScreen onBack={() => navigation.goBack()} />;
}

function GigPoolRoute({ navigation }: any) {
  return <GigPoolScreen onBack={() => navigation.goBack()} />;
}

function EstimatorRoute({ navigation }: any) {
  return <EstimatorScreen onBack={() => navigation.goBack()} />;
}

function DeviceFollowUpRoute({ navigation, route }: any) {
  return (
    <DeviceFollowUpScreen
      onBack={() => navigation.goBack()}
      onOpenDevice={(inquiryId) => navigation.navigate('DeviceDetail', { inquiryId })}
    />
  );
}

function DeviceDetailRoute({ navigation, route }: any) {
  return <DeviceDetailScreen inquiryId={route.params.inquiryId} onBack={() => navigation.goBack()} />;
}

function EodReportRoute({ navigation }: any) {
  return <EodReportScreen onBack={() => navigation.goBack()} />;
}

function EarningsRoute({ navigation }: any) {
  return (
    <EarningsScreen
      onGoDashboard={() => navigation.navigate('Dashboard')}
      onGoAttendance={() => navigation.navigate('Attendance')}
      onGoJobTools={() => navigation.navigate('JobTools')}
      onGoProfile={() => navigation.navigate('Profile')}
    />
  );
}

function ProfileRoute({ navigation }: any) {
  return (
    <ProfileScreen
      onGoDashboard={() => navigation.navigate('Dashboard')}
      onGoAttendance={() => navigation.navigate('Attendance')}
      onGoJobTools={() => navigation.navigate('JobTools')}
      onGoEarnings={() => navigation.navigate('Earnings')}
      onOpenLeaderboard={() => navigation.navigate('Leaderboard')}
      onOpenBonusReviews={() => navigation.navigate('BonusReviews')}
      onOpenTraining={() => navigation.navigate('TrainingCourses')}
      onOpenTutorials={() => navigation.navigate('Tutorials')}
      onOpenNotifications={() => navigation.navigate('Notifications')}
      onOpenSettings={() => navigation.navigate('Settings')}
      onOpenAccount={() => navigation.navigate('Account')}
    />
  );
}

function AiAssistantRoute({ navigation }: any) {
  return <AiAssistantScreen onBack={() => navigation.goBack()} />;
}

function AccountRoute({ navigation }: any) {
  return <AccountScreen onBack={() => navigation.goBack()} />;
}

function LeaderboardRoute({ navigation }: any) {
  return <LeaderboardScreen onBack={() => navigation.goBack()} />;
}

function BonusReviewsRoute({ navigation }: any) {
  return <BonusReviewsScreen onBack={() => navigation.goBack()} />;
}

function TrainingCoursesRoute({ navigation }: any) {
  return (
    <TrainingCoursesScreen
      onBack={() => navigation.goBack()}
      onOpenCourse={(courseId) => navigation.navigate('CoursePlayer', { courseId })}
    />
  );
}

function CoursePlayerRoute({ navigation, route }: any) {
  return <CoursePlayerScreen courseId={route.params.courseId} onBack={() => navigation.goBack()} />;
}

function TutorialsRoute({ navigation }: any) {
  return <TutorialsScreen onBack={() => navigation.goBack()} />;
}

function NotificationsRoute({ navigation }: any) {
  return <NotificationsScreen onBack={() => navigation.goBack()} />;
}

function SettingsRoute({ navigation }: any) {
  return <SettingsScreen onBack={() => navigation.goBack()} />;
}

function EmployeeNavigator() {
  return (
    <AttendanceProvider>
    <EmployeeStack.Navigator screenOptions={{ headerShown: false }}>
      <EmployeeStack.Screen name="Dashboard" component={EmployeeDashboardRoute} options={{ animation: 'none' }} />
      <EmployeeStack.Screen name="Attendance" component={AttendanceRoute} options={{ animation: 'none' }} />
      <EmployeeStack.Screen name="JobTools" component={JobToolsRoute} options={{ animation: 'none' }} />
      <EmployeeStack.Screen name="Earnings" component={EarningsRoute} options={{ animation: 'none' }} />
      <EmployeeStack.Screen name="Profile" component={ProfileRoute} options={{ animation: 'none' }} />
      <EmployeeStack.Screen name="TaskDetail" component={TaskDetailRoute} options={{ animation: 'slide_from_right' }} />
      <EmployeeStack.Screen name="LeaveForm" component={LeaveFormRoute} options={{ animation: 'slide_from_right' }} />
      <EmployeeStack.Screen name="Estimator" component={EstimatorRoute} options={{ animation: 'slide_from_right' }} />
      <EmployeeStack.Screen name="DeviceFollowUp" component={DeviceFollowUpRoute} options={{ animation: 'slide_from_right' }} />
      <EmployeeStack.Screen name="DeviceDetail" component={DeviceDetailRoute} options={{ animation: 'slide_from_right' }} />
      <EmployeeStack.Screen name="EodReport" component={EodReportRoute} options={{ animation: 'slide_from_right' }} />
      <EmployeeStack.Screen name="Installations" component={InstallationsRoute} options={{ animation: 'slide_from_right' }} />
      <EmployeeStack.Screen name="GigPool" component={GigPoolRoute} options={{ animation: 'slide_from_right' }} />
      <EmployeeStack.Screen name="ManageTasks" component={ManageTasksRoute} options={{ animation: 'slide_from_right' }} />
      <EmployeeStack.Screen name="MyStats" component={MyStatsRoute} options={{ animation: 'slide_from_right' }} />
      {/* Only reachable from Job Tools when the employee has can_assign_tickets;
          the server enforces the permission on every read/write regardless. */}
      <EmployeeStack.Screen name="AssignRequests" component={AdminServiceRequestsRoute} options={{ animation: 'slide_from_right' }} />
      <EmployeeStack.Screen name="Calendar" component={CalendarRoute} options={{ animation: 'slide_from_right' }} />
      <EmployeeStack.Screen name="RegisterRequest" component={RegisterRequestRoute} options={{ animation: 'slide_from_right' }} />
      <EmployeeStack.Screen name="JobMaterials" component={JobMaterialsRoute} options={{ animation: 'slide_from_right' }} />
      <EmployeeStack.Screen name="ServicePricing" component={ServicePricingRoute} options={{ animation: 'slide_from_right' }} />
      <EmployeeStack.Screen name="Leaderboard" component={LeaderboardRoute} options={{ animation: 'slide_from_right' }} />
      <EmployeeStack.Screen name="BonusReviews" component={BonusReviewsRoute} options={{ animation: 'slide_from_right' }} />
      <EmployeeStack.Screen name="TrainingCourses" component={TrainingCoursesRoute} options={{ animation: 'slide_from_right' }} />
      <EmployeeStack.Screen name="CoursePlayer" component={CoursePlayerRoute} options={{ animation: 'slide_from_right' }} />
      <EmployeeStack.Screen name="Tutorials" component={TutorialsRoute} options={{ animation: 'slide_from_right' }} />
      <EmployeeStack.Screen name="Notifications" component={NotificationsRoute} options={{ animation: 'slide_from_right' }} />
      <EmployeeStack.Screen name="Settings" component={SettingsRoute} options={{ animation: 'slide_from_right' }} />
      <EmployeeStack.Screen name="Account" component={AccountRoute} options={{ animation: 'slide_from_right' }} />
      <EmployeeStack.Screen name="AiAssistant" component={AiAssistantRoute} options={{ animation: 'slide_from_right' }} />
    </EmployeeStack.Navigator>
    <ClockInGateModal />
    </AttendanceProvider>
  );
}

function AdminServiceRequestsRoute({ navigation }: any) {
  return <AdminServiceRequestsScreen onBack={() => navigation.goBack()} />;
}

const navigationRef = createNavigationContainerRef<any>();
let pendingNotificationRoute: { name: string; params?: Record<string, unknown> } | null = null;

function goToNotificationRoute(route: { name: string; params?: Record<string, unknown> }) {
  const availableNames: string[] = navigationRef.getRootState()?.routeNames || [];
  const target = availableNames.includes(route.name) ? route.name : availableNames.includes('Notifications') ? 'Notifications' : null;
  if (target) (navigationRef.navigate as (name: string, params?: Record<string, unknown>) => void)(target, route.params);
}

function handleNotificationOpen(data: Record<string, unknown> | undefined) {
  const route = resolveNotificationRoute((data?.subject as string) || null, data);
  if (navigationRef.isReady()) goToNotificationRoute(route);
  else pendingNotificationRoute = route;
}

export default function RootNavigator() {
  const { user, loading } = useAuth();
  const { theme, mode } = useTheme();

  useEffect(() => {
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) handleNotificationOpen(response.notification.request.content.data as Record<string, unknown>);
    });
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      handleNotificationOpen(response.notification.request.content.data as Record<string, unknown>);
    });
    return () => sub.remove();
  }, []);

  const navTheme = {
    ...(mode === 'dark' ? DarkTheme : DefaultTheme),
    colors: {
      ...(mode === 'dark' ? DarkTheme.colors : DefaultTheme.colors),
      background: theme.bg,
      primary: brand.primary,
      card: theme.surface,
    },
  };

  if (loading) {
    return <AnimatedSplash />;
  }

  return (
    <NavigationContainer
      ref={navigationRef}
      theme={navTheme}
      onReady={() => {
        if (pendingNotificationRoute) {
          goToNotificationRoute(pendingNotificationRoute);
          pendingNotificationRoute = null;
        }
      }}
    >
      {!user ? <GuestNavigator /> : user.role === 'admin' ? <AdminNavigator /> : user.role === 'team_lead' ? <TeamLeadDashboardScreen /> : <EmployeeNavigator />}
    </NavigationContainer>
  );
}
