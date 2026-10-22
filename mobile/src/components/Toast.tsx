import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '../theme/colors';
import { text } from '../theme/fonts';

const DURATION_MS = 4000;

export interface ToastAction {
  label: string;
  onPress: () => void;
}

export type ShowToast = (message: string, action?: ToastAction) => void;

const ToastContext = createContext<ShowToast>(() => {});

/** Equivale ao SnackBar do Flutter: uma mensagem curta no pé da tela, com ação opcional. */
export function useToast(): ShowToast {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ message: string; action?: ToastAction } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const show = useCallback<ShowToast>((message, action) => {
    clearTimeout(timer.current);
    setToast({ message, action });
    timer.current = setTimeout(() => setToast(null), DURATION_MS);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast !== null && (
        <View style={styles.wrap} pointerEvents="box-none">
          <View style={styles.toast} accessibilityRole="alert">
            <Text style={[text.bodyMedium, { color: colors.cream, flexShrink: 1 }]}>{toast.message}</Text>
            {toast.action && (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setToast(null);
                  toast.action?.onPress();
                }}
              >
                <Text style={[text.label, { color: colors.pink }]}>{toast.action.label}</Text>
              </Pressable>
            )}
          </View>
        </View>
      )}
    </ToastContext.Provider>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16, bottom: 88, alignItems: 'center' },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    backgroundColor: colors.wine,
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 12,
    maxWidth: 480,
  },
});
