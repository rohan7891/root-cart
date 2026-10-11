const config = {
  appId: 'com.rootcart.app',
  appName: 'Root Cart',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    AdMob: {
      appIdAndroid: 'ca-app-pub-3940256099942544~3347511713', // Official Google Test App ID
      initializeForTesting: true,
    },
  },
};

export default config;
