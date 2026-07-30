import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { Text } from 'react-native';
import { FincraWebViewCheckout } from '../src/components/FincraWebViewCheckout';

describe('FincraWebViewCheckout', () => {
  const defaultProps = {
    checkoutUrl: 'https://checkout.fincra.com/pay/test_token_123',
    redirectUrl: 'https://mybackend.com/callback',
    onSuccess: jest.fn(),
    onFailed: jest.fn(),
    onCancelled: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders header title and webview initially', () => {
    render(<FincraWebViewCheckout {...defaultProps} headerTitle="My Custom Checkout" />);

    expect(screen.getByText('My Custom Checkout')).toBeTruthy();
    expect(screen.getByTestId('mock-webview')).toBeTruthy();
  });

  test('renders custom closeIcon when provided', () => {
    render(
      <FincraWebViewCheckout
        {...defaultProps}
        closeIcon={<Text testID="custom-close">CLOSE</Text>}
      />
    );

    expect(screen.getByTestId('custom-close')).toBeTruthy();
  });

  test('displays built-in Error Recovery UI when WebView encounters error', () => {
    const { getByTestId } = render(<FincraWebViewCheckout {...defaultProps} />);

    const webView = getByTestId('mock-webview');

    // Simulate WebView error
    fireEvent(webView, 'onError', {
      nativeEvent: {
        code: -1009,
        description: 'The Internet connection appears to be offline.',
      },
    });

    expect(screen.getByText('Connection Error')).toBeTruthy();
    expect(screen.getByText('The Internet connection appears to be offline.')).toBeTruthy();
    expect(screen.getByText('Retry')).toBeTruthy();
    expect(screen.getByText('Cancel')).toBeTruthy();
  });

  test('clicking Retry button clears error screen and reloads WebView', () => {
    const { getByTestId } = render(<FincraWebViewCheckout {...defaultProps} />);

    const webView = getByTestId('mock-webview');

    // Simulate WebView error
    fireEvent(webView, 'onError', {
      nativeEvent: {
        code: -1009,
        description: 'Offline error',
      },
    });

    expect(screen.getByText('Connection Error')).toBeTruthy();

    // Click Retry
    const retryBtn = screen.getByText('Retry');
    fireEvent.press(retryBtn);

    // Error UI should disappear
    expect(screen.queryByText('Connection Error')).toBeNull();
  });

  test('renders custom renderError UI when provided and retry works', () => {
    const customRenderError = jest.fn((error, retry) => (
      <Text testID="custom-error-screen" onPress={retry}>
        Custom Error: {error.message}
      </Text>
    ));

    const { getByTestId } = render(
      <FincraWebViewCheckout {...defaultProps} renderError={customRenderError} />
    );

    const webView = getByTestId('mock-webview');
    fireEvent(webView, 'onError', {
      nativeEvent: {
        code: 500,
        description: 'Server unreachable',
      },
    });

    expect(customRenderError).toHaveBeenCalledWith(
      expect.objectContaining({
        code: '500',
        message: 'Server unreachable',
      }),
      expect.any(Function)
    );
    expect(screen.getByTestId('custom-error-screen')).toBeTruthy();
  });

  test('calls onSuccess when navigation state changes to completion url', () => {
    const { getByTestId } = render(<FincraWebViewCheckout {...defaultProps} />);

    const webView = getByTestId('mock-webview');
    fireEvent(webView, 'onNavigationStateChange', {
      url: 'https://mybackend.com/callback?status=success&reference=ORDER_99',
    });

    expect(defaultProps.onSuccess).toHaveBeenCalledWith({
      reference: 'ORDER_99',
      transactionId: '',
      status: 'success',
      message: undefined,
      rawResponse: expect.any(Object),
    });
  });

  test('calls onCancelled when cancel button in Error Recovery UI is pressed', () => {
    const { getByTestId } = render(<FincraWebViewCheckout {...defaultProps} />);

    const webView = getByTestId('mock-webview');
    fireEvent(webView, 'onError', {
      nativeEvent: {
        code: -1009,
        description: 'Offline error',
      },
    });

    const cancelBtn = screen.getByText('Cancel');
    fireEvent.press(cancelBtn);

    expect(defaultProps.onCancelled).toHaveBeenCalledTimes(1);
  });
});
