// React Native 0.86 stopped declaring `global`; Hermes still defines it, and react-native-iap's source uses it.
declare var global: typeof globalThis;
