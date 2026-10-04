import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { Alert, Text } from 'react-native';
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

  // ── Item 2: payment_status is read when status is missing ─────────────────
  test('reports payment_status=failed as a failure, not success', () => {
    const { getByTestId } = render(<FincraWebViewCheckout {...defaultProps} />);

    fireEvent(getByTestId('mock-webview'), 'onNavigationStateChange', {
      url: 'https://mybackend.com/callback?payment_status=failed&reference=R1',
    });

    expect(defaultProps.onSuccess).not.toHaveBeenCalled();
    expect(defaultProps.onFailed).toHaveBeenCalledWith({
      code: 'failed',
      message: 'Payment failed',
    });
  });

  test('uses the message param for failures', () => {
    const { getByTestId } = render(<FincraWebViewCheckout {...defaultProps} />);

    fireEvent(getByTestId('mock-webview'), 'onNavigationStateChange', {
      url: 'https://mybackend.com/callback?status=declined&reference=R&message=Card%20declined',
    });

    expect(defaultProps.onFailed).toHaveBeenCalledWith({
      code: 'declined',
      message: 'Card declined',
    });
  });

  // ── Item 3: strict redirect matching inside the component ────────────────
  test('does not intercept a lookalike host of the redirect URL', () => {
    const { getByTestId } = render(<FincraWebViewCheckout {...defaultProps} />);
    const webView = getByTestId('mock-webview');

    const allowed = webView.props.onShouldStartLoadWithRequest({
      url: 'https://mybackend.com.evil.io/callback?status=success&reference=X',
    });

    expect(allowed).toBe(true);
    expect(defaultProps.onSuccess).not.toHaveBeenCalled();
  });

  // ── Item 4: settle once; ignore callbacks after unmount ──────────────────
  test('settles only once when the completion URL is seen twice', () => {
    const { getByTestId } = render(<FincraWebViewCheckout {...defaultProps} />);
    const webView = getByTestId('mock-webview');
    const url = 'https://mybackend.com/callback?status=success&reference=R';

    expect(webView.props.onShouldStartLoadWithRequest({ url })).toBe(false);
    fireEvent(webView, 'onNavigationStateChange', { url });
    fireEvent.press(screen.getByLabelText('Close checkout'));

    expect(defaultProps.onSuccess).toHaveBeenCalledTimes(1);
    expect(defaultProps.onCancelled).not.toHaveBeenCalled();
  });

  test('ignores navigation callbacks that fire after unmount', () => {
    const { getByTestId, unmount } = render(
      <FincraWebViewCheckout {...defaultProps} />
    );
    const { onShouldStartLoadWithRequest, onNavigationStateChange } =
      getByTestId('mock-webview').props;

    unmount();

    const url = 'https://mybackend.com/callback?status=success&reference=R';
    onShouldStartLoadWithRequest({ url });
    onNavigationStateChange({ url });

    expect(defaultProps.onSuccess).not.toHaveBeenCalled();
    expect(defaultProps.onFailed).not.toHaveBeenCalled();
  });

  test('ignores a cancel-confirmation "Yes" pressed after unmount', () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    try {
      const { unmount } = render(
        <FincraWebViewCheckout {...defaultProps} showCancelConfirmationDialog />
      );
      fireEvent.press(screen.getByLabelText('Close checkout'));
      const buttons = alertSpy.mock.calls[0][2]!;
      const yes = buttons.find((b) => b.text === 'Yes')!;

      unmount();
      yes.onPress!();

      expect(defaultProps.onCancelled).not.toHaveBeenCalled();
    } finally {
      alertSpy.mockRestore();
    }
  });

  // ── Item 1: load errors never settle the payment as failed ───────────────
  test('load errors show the recovery UI but never call onFailed', () => {
    const { getByTestId } = render(<FincraWebViewCheckout {...defaultProps} />);
    const webView = getByTestId('mock-webview');

    fireEvent(webView, 'onHttpError', {
      nativeEvent: {
        url: 'https://checkout.fincra.com/pay/test_token_123',
        statusCode: 502,
        description: '',
      },
    });

    expect(screen.getByText('Connection Error')).toBeTruthy();
    expect(screen.getByText('HTTP error 502')).toBeTruthy();
    expect(defaultProps.onFailed).not.toHaveBeenCalled();
    expect(defaultProps.onSuccess).not.toHaveBeenCalled();
  });

  test('ignores load errors for the (blocked) redirect URL', () => {
    const { getByTestId } = render(<FincraWebViewCheckout {...defaultProps} />);
    const webView = getByTestId('mock-webview');

    fireEvent(webView, 'onError', {
      nativeEvent: {
        url: 'https://mybackend.com/callback?reference=R',
        code: -1003,
        description: 'Host not found',
      },
    });
    fireEvent(webView, 'onHttpError', {
      nativeEvent: {
        url: 'https://mybackend.com/callback',
        statusCode: 404,
        description: 'Not Found',
      },
    });

    expect(screen.queryByText('Connection Error')).toBeNull();
    expect(defaultProps.onFailed).not.toHaveBeenCalled();
  });

  test('shows the header close button by default and hides it with showCloseButton={false}', () => {
    const { rerender } = render(<FincraWebViewCheckout {...defaultProps} />);
    expect(screen.getByLabelText('Close checkout')).toBeTruthy();

    rerender(<FincraWebViewCheckout {...defaultProps} showCloseButton={false} />);
    expect(screen.queryByLabelText('Close checkout')).toBeNull();
    expect(screen.queryByText('✕')).toBeNull();
  });
});
