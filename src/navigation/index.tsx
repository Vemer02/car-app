import React from 'react';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { darkTheme } from '../theme/tokens';
import { HomeIcon, WrenchIcon, WalletIcon, UserIcon } from '../components/icons';

// Экраны — заготовки, реализация по мокапу (Dashboard/Service/Expenses/Garage)
import LoginScreen from '../screens/Auth/LoginScreen';
import RegisterScreen from '../screens/Auth/RegisterScreen';
import ConsentScreen from '../screens/Auth/ConsentScreen';
import DashboardScreen from '../screens/Dashboard/DashboardScreen';
import ServiceScreen from '../screens/Service/ServiceScreen';
import ExpensesScreen from '../screens/Expenses/ExpensesScreen';
import GarageScreen from '../screens/Garage/GarageScreen';
import AddServiceRecordScreen from '../screens/Service/AddServiceRecordScreen';
import AddExpenseScreen from '../screens/Expenses/AddExpenseScreen';
import Obd2ConnectScreen from '../screens/Dashboard/Obd2ConnectScreen';
import { withTabSwipe } from '../components/withTabSwipe';
import AddReminderScreen from '../screens/Dashboard/AddReminderScreen';
import TransferCarScreen from '../screens/Garage/TransferCarScreen';
import AcceptTransferScreen from '../screens/Garage/AcceptTransferScreen';
import ForgotPasswordScreen from '../screens/Auth/ForgotPasswordScreen';

export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
  ForgotPassword: undefined;
};

export type MainTabParamList = {
  Dashboard: undefined;
  Service: undefined;
  Expenses: undefined;
  Garage: undefined;
};

export type RootStackParamList = {
  MainTabs: undefined;
  AddServiceRecord: { carId: string };
  AddExpense: { carId: string };
  Obd2Connect: { carId: string };
  AddReminder: { carId: string };
  TransferCar: { carId: string };
  AcceptTransfer: { token: string };
};

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const MainTabs = createBottomTabNavigator<MainTabParamList>();
const RootStack = createNativeStackNavigator<RootStackParamList>();

function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: darkTheme.background } }}>
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="Register" component={RegisterScreen} />
      <AuthStack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
    </AuthStack.Navigator>
  );
}

// Свайп между вкладками — оборачиваем один раз на уровне модуля, не внутри рендера
// (иначе при каждой перерисовке навигатора экраны пересоздавались бы с нуля).
const SwipeDashboard = withTabSwipe(DashboardScreen);
const SwipeService = withTabSwipe(ServiceScreen);
const SwipeExpenses = withTabSwipe(ExpensesScreen);
const SwipeGarage = withTabSwipe(GarageScreen);

function MainTabNavigator() {
  return (
    <MainTabs.Navigator
      sceneContainerStyle={{ backgroundColor: darkTheme.background }}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: darkTheme.accent,
        tabBarInactiveTintColor: darkTheme.textSecondary,
        tabBarStyle: { backgroundColor: darkTheme.surface, borderTopColor: darkTheme.border },
      }}>
      <MainTabs.Screen
        name="Dashboard"
        component={SwipeDashboard}
        options={{ title: 'Главная', tabBarIcon: ({ color, size }) => <HomeIcon color={color} size={size} /> }}
      />
      <MainTabs.Screen
        name="Service"
        component={SwipeService}
        options={{ title: 'Сервис', tabBarIcon: ({ color, size }) => <WrenchIcon color={color} size={size} /> }}
      />
      <MainTabs.Screen
        name="Expenses"
        component={SwipeExpenses}
        options={{ title: 'Расходы', tabBarIcon: ({ color, size }) => <WalletIcon color={color} size={size} /> }}
      />
      <MainTabs.Screen
        name="Garage"
        component={SwipeGarage}
        options={{ title: 'Гараж', tabBarIcon: ({ color, size }) => <UserIcon color={color} size={size} /> }}
      />
    </MainTabs.Navigator>
  );
}

interface RootNavigatorProps {
  isAuthenticated: boolean;
  /** Согласия на текущую редакцию документов нет — показываем только ConsentScreen. */
  consentRequired: boolean;
}

// Если не авторизован — RootStack (и AcceptTransfer в нём) ниже даже не смонтирован,
// ссылка просто не сработает молча. Это сознательно: сперва войти обычным способом,
// потом открыть ссылку ещё раз — проще сделать и проще объяснить, чем городить один
// экран "регистрация + приём" сразу.
// Тёмная тема навигации. Без неё всё, что лежит ПОД экранами (подложка навигатора), —
// светлое по умолчанию; обычно этого не видно, пока экраны непрозрачны и неподвижны, но при
// анимации свайпа экран на миг становится прозрачным и сквозь него вспыхивает белый фон.
const navTheme = {
  ...DefaultTheme,
  dark: true,
  colors: {
    ...DefaultTheme.colors,
    background: darkTheme.background,
    card: darkTheme.surface,
    border: darkTheme.border,
    text: darkTheme.textPrimary,
    primary: darkTheme.accent,
  },
};

const linking = {
  prefixes: ['carapp://'],
  config: { screens: { AcceptTransfer: 'transfer/:token' } },
};

export function RootNavigator({ isAuthenticated, consentRequired }: RootNavigatorProps) {
  return (
    <NavigationContainer linking={linking} theme={navTheme}>
      {!isAuthenticated ? (
        <AuthNavigator />
      ) : consentRequired ? (
        <ConsentScreen />
      ) : (
        <RootStack.Navigator
          screenOptions={{ presentation: 'modal', headerShown: false, contentStyle: { backgroundColor: darkTheme.background } }}>
          <RootStack.Screen name="MainTabs" component={MainTabNavigator} options={{ presentation: 'card' }} />
          <RootStack.Screen name="AddServiceRecord" component={AddServiceRecordScreen} />
          <RootStack.Screen name="AddExpense" component={AddExpenseScreen} />
          <RootStack.Screen name="Obd2Connect" component={Obd2ConnectScreen} />
          <RootStack.Screen name="AddReminder" component={AddReminderScreen} />
          <RootStack.Screen name="TransferCar" component={TransferCarScreen} />
          <RootStack.Screen name="AcceptTransfer" component={AcceptTransferScreen} />
        </RootStack.Navigator>
      )}
    </NavigationContainer>
  );
}
