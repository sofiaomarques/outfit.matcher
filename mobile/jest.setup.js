jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// Os ícones carregam a fonte por expo-asset, que não existe no Jest.
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
