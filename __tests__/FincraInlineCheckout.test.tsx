import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react-native';
import { Text } from 'react-native';
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
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
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
  });
});
