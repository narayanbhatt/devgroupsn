import { describe, expect, it, jest } from '@jest/globals';

import { swipeTarget } from '../swipe-tabs';

// Hoisted above the import by babel-jest.
jest.mock('expo-router', () => ({ router: {} }));

describe('swipeTarget', () => {
  it('swiping left opens the next tab, right the previous', () => {
    expect(swipeTarget('/', -100)).toBe('/welcome');
    expect(swipeTarget('/welcome', 100)).toBe('/');
    expect(swipeTarget('/orders', -100)).toBe('/chat');
  });
  it('stops at the ends and ignores short drags', () => {
    expect(swipeTarget('/', 100)).toBeNull();
    expect(swipeTarget('/profile', -100)).toBeNull();
    expect(swipeTarget('/welcome', -30)).toBeNull();
    expect(swipeTarget('/product/1', -100)).toBeNull();
  });
});
