import * as ImagePicker from 'expo-image-picker';

import { readUriBytes } from './bytes';

export type PhotoSource = 'camera' | 'gallery';

/** Foto escolhida no seletor: `uri` serve pra mostrar o preview. */
export interface PickedPhoto {
  uri: string;
}

export type PickResult =
  | { status: 'ok'; photo: PickedPhoto; bytes: Uint8Array }
  | { status: 'canceled' }
  /** A usuária não liberou a câmera. */
  | { status: 'denied' };

/** Abre a câmera ou a galeria e devolve a foto escolhida, com os bytes já lidos. */
export async function pickPhoto(source: PhotoSource): Promise<PickResult> {
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.9 };
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return { status: 'denied' };
  }
  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled || result.assets.length === 0) return { status: 'canceled' };

  const asset = result.assets[0];
  return {
    status: 'ok',
    photo: { uri: asset.uri },
    bytes: await readUriBytes(asset.uri),
  };
}

export const CAMERA_DENIED_MESSAGE =
  'Sem permissão da câmera. Escolha da galeria ou libere nas configurações.';
