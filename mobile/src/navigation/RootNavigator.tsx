import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer, DarkTheme, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import { brand } from '../theme/tokens';
import LandingScreen from '../screens/LandingScreen';
import LoginScreen from '../screens/LoginScreen';
import ClientSubmitTicketScreen from '../screens/ClientSubmitTicketScreen';
import ClientTrackTicketScreen from '../screens/ClientTrackTicketScreen';
import EmployeeDashboardScreen from '../screens/EmployeeDashboardScreen';
import AdminDashboardScreen from '../screens/AdminDashboardScreen';
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
import TrainingCoursesScreen from '../screens/TrainingCoursesScreen';
import CoursePlayerScreen from '../screens/CoursePlayerScreen';
import TutorialsScreen from '../screens/TutorialsScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import SettingsScreen from '../screens/SettingsScreen';
import InstallationsScreen from '../screens/InstallationsScreen';
import GigPoolScreen from '../screens/GigPoolScreen';
import ManageTasksScreen from '../screens/ManageTasksScreen';
import LiveLocationsScreen from '../screens/LiveLocationsScreen';
import { useLiveLocationPing } from '../hooks/useLiveLocationPing';
import { AttendanceProvider } from '../context/AttendanceContext';

type GuestStackParams = {
  Landing: undefined;
  Login: undefined;
  SubmitTicket: undefined;
  TrackTicket: undefined;
};

type AdminStackParams = {
  Dashboard: undefined;
  Notifications: undefined;
  LiveLocations: undefined;
};

type EmployeeStackParams = {
  Dashboard: undefined;
  TaskDetail: { ticketId: string };
  Attendance: undefined;
  LeaveForm: undefined;
  JobTools: undefined;
  Estimator: undefined;
  DeviceFollowUp: undefined;
  DeviceDetail: { inquiryId: string };
  EodReport: undefined;
  Earnings: undefined;
  Profile: undefined;
  Leaderboard: undefined;
  TrainingCourses: undefined;
  CoursePlayer: { courseId: string };
  Tutorials: undefined;
  Notifications: undefined;
  Settings: undefined;
  Installations: undefined;
  GigPool: undefined;
  ManageTasks: undefined;
};

const GuestStack = createNativeStackNavigator<GuestStackParams>();
const EmployeeStack = createNativeStackNavigator<EmployeeStackParams>();
const AdminStack = createNativeStackNavigator<AdminStackParams>();

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

// Guest side (unauthenticated) gets a real stack — land on the public
// Landing screen, then staff sign-in, submit a request, or track a
// request, with native slide transitions between them.
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
    />
  );
}

function ManageTasksRoute({ navigation }: any) {
  return <ManageTasksScreen onBack={() => navigation.goBack()} />;
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

function DeviceFollowUpRoute({ navigation }: any) {
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
      onOpenTraining={() => navigation.navigate('TrainingCourses')}
      onOpenTutorials={() => navigation.navigate('Tutorials')}
      onOpenNotifications={() => navigation.navigate('Notifications')}
      onOpenSettings={() => navigation.navigate('Settings')}
    />
  );
}

function LeaderboardRoute({ navigation }: any) {
  return <LeaderboardScreen onBack={() => navigation.goBack()} />;
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

// Dashboard, Attendance, JobTools, Earnings, and Profile are siblings
// switched with no transition (an instant-swap approximation of tab
// behavior — design spec §3, same pattern established since phase 3b).
// Every other screen is a genuine drill-down push with a slide
// transition and no tab bar.
function EmployeeNavigator() {
  const { user } = useAuth();
  useLiveLocationPing(user?.id);
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
      <EmployeeStack.Screen name="Leaderboard" component={LeaderboardRoute} options={{ animation: 'slide_from_right' }} />
      <EmployeeStack.Screen name="TrainingCourses" component={TrainingCoursesRoute} options={{ animation: 'slide_from_right' }} />
      <EmployeeStack.Screen name="CoursePlayer" component={CoursePlayerRoute} options={{ animation: 'slide_from_right' }} />
      <EmployeeStack.Screen name="Tutorials" component={TutorialsRoute} options={{ animation: 'slide_from_right' }} />
      <EmployeeStack.Screen name="Notifications" component={NotificationsRoute} options={{ animation: 'slide_from_right' }} />
      <EmployeeStack.Screen name="Settings" component={SettingsRoute} options={{ animation: 'slide_from_right' }} />
    </EmployeeStack.Navigator>
    </AttendanceProvider>
  );
}

function AdminDashboardRoute({ navigation }: any) {
  return (
    <AdminDashboardScreen
      onOpenNotifications={() => navigation.navigate('Notifications')}
      onOpenLiveLocations={() => navigation.navigate('LiveLocations')}
    />
  );
}

function AdminNotificationsRoute({ navigation }: any) {
  return <NotificationsScreen onBack={() => navigation.goBack()} />;
}

function AdminLiveLocationsRoute({ navigation }: any) {
  return <LiveLocationsScreen onBack={() => navigation.goBack()} />;
}

// Only Dashboard + Notifications + Live Locations for now — the rest of
// admin (Job Cards, Finance, Device Tracking, etc.) is still the
// MoreSheet's "Coming soon" placeholder list (AdminDashboardScreen's
// MORE_SECTIONS), each becoming a real route here as it's built.
function AdminNavigator() {
  return (
    <AdminStack.Navigator screenOptions={{ headerShown: false }}>
      <AdminStack.Screen name="Dashboard" component={AdminDashboardRoute} options={{ animation: 'none' }} />
      <AdminStack.Screen name="Notifications" component={AdminNotificationsRoute} options={{ animation: 'slide_from_right' }} />
      <AdminStack.Screen name="LiveLocations" component={AdminLiveLocationsRoute} options={{ animation: 'slide_from_right' }} />
    </AdminStack.Navigator>
  );
}

export default function RootNavigator() {
  const { user, loading } = useAuth();
  const { theme, mode } = useTheme();

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
    return (
      <View style={{ flex: 1, backgroundColor: theme.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={brand.primary} size="large" />
      </View>
    );
  }

  return (
    <NavigationContainer theme={navTheme}>
      {!user ? <GuestNavigator /> : user.role === 'admin' ? <AdminNavigator /> : <EmployeeNavigator />}
    </NavigationContainer>
  );
}
