import { router } from 'expo-router';
import { useMemo, type ReactNode } from 'react';
import { PanResponder, View } from 'react-native';

/** The customer tabs in bottom-bar order. */
export const TAB_PATHS = ['/', '/welcome', '/orders', '/chat', '/profile'] as const;

const MIN_DISTANCE = 60;

/** Which tab a horizontal swipe should open, or null. Swiping left goes to the next tab. */
export function swipeTarget(path: string, dx: number): (typeof TAB_PATHS)[number] | null {
  const i = TAB_PATHS.indexOf(path as (typeof TAB_PATHS)[number]);
  if (i < 0 || Math.abs(dx) < MIN_DISTANCE) return null;
  return TAB_PATHS[i + (dx < 0 ? 1 : -1)] ?? null;
}

/**
 * Lets people swipe left and right between the bottom tabs. Sideways scrollers inside a
 * tab (like the category chips) still get their own swipes first.
 */
export function SwipeTabs({ route, children }: { route: string; children: ReactNode }) {
  const path = route === 'index' ? '/' : `/${route}`;

  const responder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 20 && Math.abs(g.dx) > Math.abs(g.dy) * 2,
        onPanResponderTerminationRequest: () => true,
        onPanResponderRelease: (_e, g) => {
          if (Math.abs(g.dy) > Math.abs(g.dx)) return;
          const target = swipeTarget(path, g.dx);
          if (target) router.navigate(target);
        },
      }),
    [path],
  );

  return (
    <View style={{ flex: 1 }} {...responder.panHandlers}>
      {children}
    </View>
  );
}
