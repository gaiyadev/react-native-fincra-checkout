import React from 'react';
import { Modal } from 'react-native';
import { render, screen, act } from '@testing-library/react-native';
import {
  FincraCheckout,
  FincraCheckoutHostRegistrar,
} from '../src/checkout/FincraCheckout';
import type { FincraCheckoutResult } from '../src/types';

// ─── FincraCheckout host Tests ────────────────────────────────────────────────
//
// Item 9: after the Android back button (Modal onRequestClose) closes the
// session, a late bridge message must not settle it a second time — otherwise
// merchant callbacks fire twice (e.g. popping the host app's own screen).

describe('FincraCheckoutHost', () => {
  const inlineConfig = {
    publicKey: 'pk_test_12345',
    amount: 5000,
    currency: 'NGN' as const,
    customerEmail: 'customer@example.com',
    customerName: 'Customer Test',
    feeBearer: 'customer' as const,
    onSuccess: jest.fn(),
    onFailed: jest.fn(),
    onCancelled: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Returns the pending result wrapped in an object: returning the promise
  // directly from an async function would make `await` wait for the result.
  async function openInline() {
    render(<FincraCheckoutHostRegistrar />);
    let promise!: Promise<FincraCheckoutResult>;
    await act(async () => {
      promise = FincraCheckout.openInline(inlineConfig);
    });
    return { promise };
  }

  test('Android back settles as cancelled exactly once; late messages are ignored', async () => {
    const { promise } = await openInline();
    const { onMessage } = screen.getByTestId('mock-webview').props;

    await act(async () => {
      screen.UNSAFE_getByType(Modal).props.onRequestClose();
    });

    // Late messages from the page after back closed the session
    await act(async () => {
      onMessage({
        nativeEvent: {
          data: JSON.stringify({ event: 'success', data: { reference: 'R' } }),
        },
      });
      onMessage({ nativeEvent: { data: JSON.stringify({ event: 'closed' }) } });
    });
    // A second back press must not re-notify either
    await act(async () => {
      screen.UNSAFE_getByType(Modal).props.onRequestClose();
    });

    await expect(promise).resolves.toEqual({ type: 'cancelled' });
    expect(inlineConfig.onCancelled).toHaveBeenCalledTimes(1);
    expect(inlineConfig.onSuccess).not.toHaveBeenCalled();
  });

  test('a bridge result settles once and allows a new session afterwards', async () => {
    const { promise: first } = await openInline();
    const { onMessage } = screen.getByTestId('mock-webview').props;

    await act(async () => {
      onMessage({ nativeEvent: { data: JSON.stringify({ event: 'closed' }) } });
    });
    await expect(first).resolves.toEqual({ type: 'cancelled' });

    // Back press after settlement is a no-op
    await act(async () => {
      screen.UNSAFE_getByType(Modal).props.onRequestClose();
    });
    expect(inlineConfig.onCancelled).toHaveBeenCalledTimes(1);

    // A stale message from the first session can't settle the second one
    let second!: Promise<FincraCheckoutResult>;
    await act(async () => {
      second = FincraCheckout.openInline(inlineConfig);
    });
    await act(async () => {
      onMessage({
        nativeEvent: {
          data: JSON.stringify({ event: 'success', data: { reference: 'OLD' } }),
        },
      });
    });
    expect(inlineConfig.onSuccess).not.toHaveBeenCalled();

    await act(async () => {
      screen.UNSAFE_getByType(Modal).props.onRequestClose();
    });
    await expect(second).resolves.toEqual({ type: 'cancelled' });
  });
});
