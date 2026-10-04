// Jest setup — mock react-native-webview and react-native-safe-area-context to avoid native module errors in tests
global.__DEV__ = true;

jest.mock('react-native-webview', () => {
  const React = require('react');
  const { View } = require('react-native');
  const WebViewMock = React.forwardRef((props, ref) => {
    React.useImperativeHandle(ref, () => ({
      reload: jest.fn(),
    }));
    return React.createElement(View, { testID: 'mock-webview', ...props });
  });
  WebViewMock.displayName = 'WebView';
  return {
    WebView: WebViewMock,
  };
});

// StatusBar keeps a module-level setImmediate handle (`_updateImmediate`) that it
// clears/recreates on every mount and unmount. Across tests that switch between
// fake and real timers, that shared handle crosses clocks, and on Node 18/20 it
// hangs RNTL's afterEach cleanup ("Exceeded timeout ... for a hook").
// Status bar styling is not under test, so render nothing.
jest.mock('react-native/Libraries/Components/StatusBar/StatusBar', () => {
  const StatusBarMock = () => null;
  StatusBarMock.setBarStyle = jest.fn();
  StatusBarMock.setBackgroundColor = jest.fn();
  StatusBarMock.setHidden = jest.fn();
  StatusBarMock.setTranslucent = jest.fn();
  StatusBarMock.setNetworkActivityIndicatorVisible = jest.fn();
  StatusBarMock.pushStackEntry = jest.fn();
  StatusBarMock.popStackEntry = jest.fn();
  StatusBarMock.replaceStackEntry = jest.fn();
  StatusBarMock.currentHeight = 0;
  return StatusBarMock;
});

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    SafeAreaView: ({ children, ...props }) => React.createElement(View, props, children),
    SafeAreaProvider: ({ children, ...props }) => React.createElement(View, props, children),
    useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
  };
});
