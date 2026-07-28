// Jest setup — mock react-native-webview to avoid native module errors in tests
jest.mock('react-native-webview', () => ({
  WebView: 'WebView',
}));
