import { ActivityIndicator, Modal, StyleSheet, Text, View } from 'react-native';

import { colors } from '../theme/colors';
import { text } from '../theme/fonts';
import { Button } from './Button';

interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message: string;
  cancelLabel: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmDialog(props: ConfirmDialogProps) {
  return (
    <Modal transparent animationType="fade" visible={props.visible} onRequestClose={props.onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.dialog} accessibilityViewIsModal>
          <Text style={text.titleLarge}>{props.title}</Text>
          <Text style={[text.bodyLarge, { marginTop: 12 }]}>{props.message}</Text>
          <View style={styles.actions}>
            <Button variant="text" label={props.cancelLabel} onPress={props.onCancel} />
            <Button
              variant="text"
              tone="danger"
              label={props.confirmLabel}
              onPress={props.onConfirm}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

/** Tampa o app inteiro enquanto algo roda; não fecha ao tocar fora nem no botão de voltar. */
export function BusyDialog({ visible, message }: { visible: boolean; message: string }) {
  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={() => {}}>
      <View style={styles.backdrop}>
        <View style={[styles.dialog, styles.busy]}>
          <ActivityIndicator color={colors.wine} />
          <Text style={[text.bodyLarge, { flex: 1 }]}>{message}</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  dialog: { backgroundColor: colors.white, borderRadius: 24, padding: 24, width: '100%', maxWidth: 420 },
  busy: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 20, gap: 4 },
});
