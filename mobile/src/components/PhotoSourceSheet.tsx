import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '../theme/colors';
import { text } from '../theme/fonts';
import type { PhotoSource } from '../utils/pickPhoto';

interface PhotoSourceSheetProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (source: PhotoSource) => void;
}

/** "De onde vem a foto?": câmera ou galeria, numa folha que sobe do pé da tela. */
export function PhotoSourceSheet({ visible, onClose, onSelect }: PhotoSourceSheetProps) {
  return (
    <Modal transparent animationType="slide" visible={visible} onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View style={styles.sheet}>
          <Text style={[text.titleMedium, { marginBottom: 8 }]}>De onde vem a foto?</Text>
          <Option icon="camera-outline" label="Tirar foto" onPress={() => onSelect('camera')} />
          <Option icon="images-outline" label="Escolher da galeria" onPress={() => onSelect('gallery')} />
        </View>
      </Pressable>
    </Modal>
  );
}

function Option({
  icon,
  label,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.option}>
      <Ionicons name={icon} size={24} color={colors.wine} />
      <Text style={text.bodyLarge}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 32,
  },
  option: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 14 },
});
