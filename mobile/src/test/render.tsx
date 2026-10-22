import { render } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ToastProvider } from '../components/Toast';

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

/** Renderiza com os providers que as telas esperam (área segura e toast). */
export async function renderScreen(ui: ReactElement) {
  return await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <ToastProvider>{ui}</ToastProvider>
    </SafeAreaProvider>,
  );
}
