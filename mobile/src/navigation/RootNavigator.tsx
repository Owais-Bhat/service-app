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
  DeviceFollowUp: undefined;
  DeviceDetail: { inquiryId: string };
  EodReport: undefined;
  Earnings: undefined;
};

const GuestStack = createNativeStackNavigator<GuestStackParams>();
const EmployeeStack = createNativeStackNavigator<EmployeeStackParams>();

function LandingRoute({ navigation }: any) {
  return (
    <LandingScreen
      onStaffLogin={() => navigation.navigate('Login')}
      onGoSubmit={() => navigation.navigate('SubmitTicket')}
      onGoTrack={() => navigation.navigate('TrackTicket')}
    />
  );
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
      onOpenEstimator={() => navigation.navigate('Estimator')}
      onOpenDeviceFollowUp={() => navigation.navigate('DeviceFollowUp')}
      onOpenEodReport={() => navigation.navigate('EodReport')}
    />
  );
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
    />
  );
}

// Dashboard, Attendance, and JobTools are siblings switched with no
// transition (an instant-swap approximation of tab behavior — design
// spec §4, same pattern phase 3b established). Every other screen is a
// genuine drill-down push with a slide transition and no tab bar.
function EmployeeNavigator() {
  return (
    <EmployeeStack.Navigator screenOptions={{ headerShown: false }}>
      <EmployeeStack.Screen name="Dashboard" component={EmployeeDashboardRoute} options={{ animation: 'none' }} />
      <EmployeeStack.Screen name="Attendance" component={AttendanceRoute} options={{ animation: 'none' }} />
      <EmployeeStack.Screen name="JobTools" component={JobToolsRoute} options={{ animation: 'none' }} />
      <EmployeeStack.Screen name="Earnings" component={EarningsRoute} options={{ animation: 'none' }} />
      <EmployeeStack.Screen name="TaskDetail" component={TaskDetailRoute} options={{ animation: 'slide_from_right' }} />
      <EmployeeStack.Screen name="LeaveForm" component={LeaveFormRoute} options={{ animation: 'slide_from_right' }} />
      <EmployeeStack.Screen name="Estimator" component={EstimatorRoute} options={{ animation: 'slide_from_right' }} />
      <EmployeeStack.Screen name="DeviceFollowUp" component={DeviceFollowUpRoute} options={{ animation: 'slide_from_right' }} />
      <EmployeeStack.Screen name="DeviceDetail" component={DeviceDetailRoute} options={{ animation: 'slide_from_right' }} />
      <EmployeeStack.Screen name="EodReport" component={EodReportRoute} options={{ animation: 'slide_from_right' }} />
    </EmployeeStack.Navigator>
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
      {!user ? <GuestNavigator /> : user.role === 'admin' ? <AdminDashboardScreen /> : <EmployeeNavigator />}
    </NavigationContainer>
  );
}
