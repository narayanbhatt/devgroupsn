import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router/js-tabs';
import type { ComponentProps } from 'react';
import { router } from 'expo-router';
import { Pressable, Text, View, type ColorValue } from 'react-native';

import { SwipeTabs } from '@/components/swipe-tabs';
import { useBasket } from '@/lib/basket';

import { colors, type as typo } from '@/theme/tokens';

type IconName = ComponentProps<typeof Ionicons>['name'];

function icon(name: IconName) {
  return function TabIcon({ color, size }: { color: ColorValue; size: number }) {
    return <Ionicons name={name} color={color as string} size={size} />;
  };
}

/** Header button to the enquiry basket, with how many products are in it. */
function BasketButton() {
  const { count } = useBasket();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Your enquiry, ${count} product${count === 1 ? '' : 's'}`}
      onPress={() => router.push('/enquiry')}
      hitSlop={8}
      style={{ paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center' }}>
      <Ionicons name="clipboard-outline" size={24} color={colors.textOnBrand} />
      {count > 0 && (
        <View
          style={{
            position: 'absolute',
            right: 8,
            top: -4,
            minWidth: 18,
            height: 18,
            borderRadius: 9,
            backgroundColor: colors.brandSecondary,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 4,
          }}>
          <Text style={[typo.caption, { color: colors.textOnBrand, fontWeight: '700', lineHeight: 14 }]}>{count}</Text>
        </View>
      )}
    </Pressable>
  );
}

/** Customer bottom navigation: Catalog | Welcome | Orders | Chat | Profile. Swipe sideways to move between them. */
export default function TabsLayout() {
  return (
    <Tabs
      screenLayout={({ route, children }) => <SwipeTabs route={route.name}>{children}</SwipeTabs>}
      screenOptions={{
        headerStyle: { backgroundColor: colors.brandPrimary },
        headerTintColor: colors.textOnBrand,
        tabBarActiveTintColor: colors.brandSecondary,
        tabBarInactiveTintColor: colors.textSecondary,
      }}>
      <Tabs.Screen name="index" options={{ title: 'Catalog', headerTitle: 'DEV GROUP', tabBarIcon: icon('grid-outline'), headerRight: BasketButton }} />
      <Tabs.Screen name="welcome" options={{ title: 'Welcome', tabBarIcon: icon('home-outline'), headerRight: BasketButton }} />
      <Tabs.Screen name="orders" options={{ title: 'Orders', headerTitle: 'Enquiries and orders', tabBarIcon: icon('receipt-outline') }} />
      <Tabs.Screen name="chat" options={{ title: 'Chat', tabBarIcon: icon('chatbubbles-outline') }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: icon('person-outline') }} />
    </Tabs>
  );
}
