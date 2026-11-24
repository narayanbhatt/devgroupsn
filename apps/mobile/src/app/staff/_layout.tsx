import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router/js-tabs';
import type { ComponentProps } from 'react';
import type { ColorValue } from 'react-native';

import { colors } from '@/theme/tokens';

type IconName = ComponentProps<typeof Ionicons>['name'];

function icon(name: IconName) {
  return function TabIcon({ color, size }: { color: ColorValue; size: number }) {
    return <Ionicons name={name} color={color as string} size={size} />;
  };
}

/** Staff bottom navigation: Dashboard | Enquiries | Orders | Chat | Catalog | Settings (wireframe §3). */
export default function StaffTabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.brandPrimary },
        headerTintColor: colors.textOnBrand,
        tabBarActiveTintColor: colors.brandSecondary,
        tabBarInactiveTintColor: colors.textSecondary,
      }}>
      <Tabs.Screen name="index" options={{ title: 'Dashboard', headerTitle: 'DEV GROUP · Staff', tabBarIcon: icon('speedometer-outline') }} />
      <Tabs.Screen name="orders" options={{ title: 'Enquiries', tabBarIcon: icon('mail-unread-outline') }} />
      <Tabs.Screen name="order-list" options={{ title: 'Orders', tabBarIcon: icon('receipt-outline') }} />
      <Tabs.Screen name="chat" options={{ title: 'Chat', tabBarIcon: icon('chatbubbles-outline') }} />
      <Tabs.Screen name="catalog" options={{ title: 'Catalog', tabBarIcon: icon('grid-outline') }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarIcon: icon('settings-outline') }} />
    </Tabs>
  );
}
