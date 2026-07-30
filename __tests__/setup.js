// Jest setup — mock react-native-webview and react-native-safe-area-context to avoid native module errors in tests
global.__DEV__ = true;

jest.mock('react-native-webview', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    WebView: React.forwardRef((props, ref) => {
      React.useImperativeHandle(ref, () => ({
        reload: jest.fn(),
      }));
      return React.createElement(View, { testID: 'mock-webview', ...props });
    }),
  };
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
