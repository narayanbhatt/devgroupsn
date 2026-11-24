import { useEffect, useRef, useState } from 'react';
import { Dimensions, Keyboard, Platform, TextInput } from 'react-native';

const GAP = 24;

/**
 * Android draws the app edge to edge, so the window no longer shrinks when the keyboard
 * opens and the bottom of a form stays hidden behind it. This returns the keyboard
 * height (to pad the end of a scroll view, so everything can scroll up to the keyboard's
 * edge) and, given a way to scroll, lifts the field being typed in above the keyboard.
 */
export function useKeyboardInset(scrollTo?: (y: number) => void) {
  const scrollToRef = useRef(scrollTo);
  useEffect(() => {
    scrollToRef.current = scrollTo;
  });
  const [height, setHeight] = useState(0);
  const offset = useRef(0);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const reveal = (kb: number) => {
      const input = TextInput.State.currentlyFocusedInput?.();
      const scroll = scrollToRef.current;
      if (!input || !scroll) return;
      // Wait a frame for the extra padding to lay out before scrolling.
      requestAnimationFrame(() =>
        input.measureInWindow((_x, y, _w, h) => {
          const visibleBottom = Dimensions.get('window').height - kb - GAP;
          const overlap = y + h - visibleBottom;
          if (overlap > 0) scroll(offset.current + overlap);
        }),
      );
    };
    const show = Keyboard.addListener('keyboardDidShow', (e) => {
      setHeight(e.endCoordinates.height);
      reveal(e.endCoordinates.height);
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return {
    keyboardHeight: height,
    /** Pass to the scroll view's onScroll so the lift knows where it is. */
    onScroll: (e: { nativeEvent: { contentOffset: { y: number } } }) => {
      offset.current = e.nativeEvent.contentOffset.y;
    },
  };
}
