import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react-native';
import { Text } from 'react-native';
import { generateInlineHtml } from '../src/inline/htmlGenerator';
import { FincraInlineCheckout } from '../src/components/FincraInlineCheckout';

describe('FincraInlineCheckout', () => {
  const defaultProps = {
    publicKey: 'pk_test_12345',
    amount: 5000,
    currency: 'NGN' as const,
    customerEmail: 'customer@example.com',
    customerName: 'Customer Test',
    customerPhoneNumber: '07000000000',
    reference: 'ORDER_100',
    feeBearer: 'customer' as const,
    onSuccess: jest.fn(),
    onFailed: jest.fn(),
    onCancelled: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders header title and webview initially with inline JS', () => {
    render(<FincraInlineCheckout {...defaultProps} headerTitle="Inline Pay" />);

    expect(screen.getByText('Inline Pay')).toBeTruthy();
    expect(screen.getByTestId('mock-webview')).toBeTruthy();
  });

  test('renders custom closeIcon when provided', () => {
    render(
      <FincraInlineCheckout
        {...defaultProps}
        closeIcon={<Text testID="inline-close">EXIT</Text>}
      />
    );

    expect(screen.getByTestId('inline-close')).toBeTruthy();
  });

  test('displays built-in Error Recovery UI when WebView encounters error', () => {
    const { getByTestId } = render(<FincraInlineCheckout {...defaultProps} />);

    const webView = getByTestId('mock-webview');

    fireEvent(webView, 'onError', {
      nativeEvent: {
        code: -1009,
        description: 'No internet connection',
      },
    });

    expect(screen.getByText('Connection Error')).toBeTruthy();
    expect(screen.getByText('No internet connection')).toBeTruthy();
    expect(screen.getByText('Retry')).toBeTruthy();
    expect(screen.getByText('Cancel')).toBeTruthy();
  });

  test('clicking Retry button clears error screen and reloads WebView', () => {
    const { getByTestId } = render(<FincraInlineCheckout {...defaultProps} />);

    const webView = getByTestId('mock-webview');

    fireEvent(webView, 'onError', {
      nativeEvent: {
        code: -1009,
        description: 'Offline error',
      },
    });

    expect(screen.getByText('Connection Error')).toBeTruthy();

    const retryBtn = screen.getByText('Retry');
    fireEvent.press(retryBtn);

    expect(screen.queryByText('Connection Error')).toBeNull();
  });

  test('renders custom renderError UI when provided and retry works', () => {
    const customRenderError = jest.fn((error, retry) => (
      <Text testID="custom-inline-error" onPress={retry}>
        Inline Error: {error.message}
      </Text>
    ));

    const { getByTestId } = render(
      <FincraInlineCheckout {...defaultProps} renderError={customRenderError} />
    );

    const webView = getByTestId('mock-webview');
    fireEvent(webView, 'onError', {
      nativeEvent: {
        code: 404,
        description: 'Page not found',
      },
    });

    expect(customRenderError).toHaveBeenCalledWith(
      expect.objectContaining({
        code: '404',
        message: 'Page not found',
      }),
      expect.any(Function)
    );
    expect(screen.getByTestId('custom-inline-error')).toBeTruthy();
  });

  test('calls onSuccess when success message is received from bridge', () => {
    const { getByTestId } = render(<FincraInlineCheckout {...defaultProps} />);

    const webView = getByTestId('mock-webview');
    const messageEvent = {
      nativeEvent: {
        data: JSON.stringify({
          event: 'success',
          data: {
            reference: 'ORDER_100',
            status: 'success',
            message: 'Payment completed successfully',
            transactionId: 'TX123',
          },
        }),
      },
    };

    fireEvent(webView, 'onMessage', messageEvent);

    expect(defaultProps.onSuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        reference: 'ORDER_100',
        status: 'success',
        message: 'Payment completed successfully',
      })
    );
  });

  test('calls onFailed when error message is received from bridge', () => {
    const { getByTestId } = render(<FincraInlineCheckout {...defaultProps} />);

    const webView = getByTestId('mock-webview');
    const messageEvent = {
      nativeEvent: {
        data: JSON.stringify({
          event: 'error',
          data: {
            message: 'Insufficient funds',
          },
        }),
      },
    };

    fireEvent(webView, 'onMessage', messageEvent);

    expect(defaultProps.onFailed).toHaveBeenCalledWith({
      code: 'fincra_sdk_error',
      message: 'Insufficient funds',
    });
  });

  test('displays Error Recovery UI when 15-second initialization timeout expires', () => {
    jest.useFakeTimers();
    try {
      render(<FincraInlineCheckout {...defaultProps} />);

      act(() => {
        jest.advanceTimersByTime(15000);
      });

      expect(screen.getByText('Connection Error')).toBeTruthy();
      expect(
        screen.getByText(
          'Fincra Checkout failed to load. Please check your internet connection.'
        )
      ).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });

  const sendMessage = (payload: unknown) =>
    fireEvent(screen.getByTestId('mock-webview'), 'onMessage', {
      nativeEvent: { data: JSON.stringify(payload) },
    });

  // ── Item 5: phone number is optional ──────────────────────────────────────
  test('renders without a phone number and leaves it out of the page', () => {
    const { customerPhoneNumber: _omit, ...withoutPhone } = defaultProps;
    render(<FincraInlineCheckout {...withoutPhone} />);

    const { html } = screen.getByTestId('mock-webview').props.source;
    expect(html).not.toContain('phoneNumber');
  });

  // ── Item 6: keep the error message from the bridge ───────────────────────
  test('passes the page\'s SDK load-failure message to onFailed', () => {
    render(<FincraInlineCheckout {...defaultProps} />);
    const pageMessage = 'Fincra SDK failed to load. Check your internet connection.';
    // Guard: this is the exact string the generated page posts.
    expect(generateInlineHtml(defaultProps)).toContain(pageMessage);

    sendMessage({ event: 'error', data: { message: pageMessage } });

    expect(defaultProps.onFailed).toHaveBeenCalledWith({
      code: 'fincra_sdk_error',
      message: pageMessage,
    });
  });

  test('falls back to a generic message when the error has no data', () => {
    render(<FincraInlineCheckout {...defaultProps} />);
    sendMessage({ event: 'error', data: null });

    expect(defaultProps.onFailed).toHaveBeenCalledWith({
      code: 'fincra_sdk_error',
      message: 'An unknown error occurred',
    });
  });

  // ── Item 7: a success without data is still a success ────────────────────
  test('treats a success event with null data as success, not cancelled', () => {
    render(<FincraInlineCheckout {...defaultProps} />);
    sendMessage({ event: 'success', data: null });

    expect(defaultProps.onCancelled).not.toHaveBeenCalled();
    expect(defaultProps.onSuccess).toHaveBeenCalledWith(
      expect.objectContaining({ reference: '', status: 'success' })
    );
  });

  // ── Items 4 & 9: settle once; ignore late messages ───────────────────────
  test('ignores bridge messages after the session has settled', () => {
    render(<FincraInlineCheckout {...defaultProps} />);

    fireEvent.press(screen.getByLabelText('Close checkout'));
    sendMessage({ event: 'success', data: { reference: 'LATE' } });
    sendMessage({ event: 'closed' });

    expect(defaultProps.onCancelled).toHaveBeenCalledTimes(1);
    expect(defaultProps.onSuccess).not.toHaveBeenCalled();
  });

  test('ignores bridge messages that arrive after unmount', () => {
    const { unmount } = render(<FincraInlineCheckout {...defaultProps} />);
    const { onMessage } = screen.getByTestId('mock-webview').props;

    unmount();
    onMessage({ nativeEvent: { data: JSON.stringify({ event: 'closed' }) } });

    expect(defaultProps.onCancelled).not.toHaveBeenCalled();
  });

  // ── Item 10: Retry re-arms the 15s timeout ───────────────────────────────
  test('Retry restarts the 15-second timeout', () => {
    jest.useFakeTimers();
    try {
      render(<FincraInlineCheckout {...defaultProps} />);
      act(() => {
        jest.advanceTimersByTime(15000);
      });
      fireEvent.press(screen.getByText('Retry'));
      expect(screen.queryByText('Connection Error')).toBeNull();

      act(() => {
        jest.advanceTimersByTime(15000);
      });
      expect(screen.getByText('Connection Error')).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });

  test('a ready event cancels the timeout', () => {
    jest.useFakeTimers();
    try {
      render(<FincraInlineCheckout {...defaultProps} />);
      sendMessage({ event: 'ready' });
      act(() => {
        jest.advanceTimersByTime(20000);
      });
      expect(screen.queryByText('Connection Error')).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  test('shows the header close button by default and hides it with showCloseButton={false}', () => {
    const { rerender } = render(<FincraInlineCheckout {...defaultProps} />);
    expect(screen.getByLabelText('Close checkout')).toBeTruthy();

    rerender(<FincraInlineCheckout {...defaultProps} showCloseButton={false} />);
    expect(screen.queryByLabelText('Close checkout')).toBeNull();
    expect(screen.queryByText('✕')).toBeNull();
  });
});
