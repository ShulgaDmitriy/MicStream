const config = {
  appId: 'com.micstream.phone',
  appName: 'MicStream',
  webDir: 'app/src/main/assets/public',
  android: {
    buildOptions: {
      keystorePath: null,
      keystoreAlias: null,
    }
  },
  server: {
    androidScheme: 'https'
  }
};

module.exports = config;
