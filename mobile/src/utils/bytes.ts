/** Data URI (PNG ou JPEG) pra mostrar bytes em memória num `<Image>`. */
export function bytesToDataUri(bytes: Uint8Array): string {
  const isPng = bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50;
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return `data:${isPng ? 'image/png' : 'image/jpeg'};base64,${btoa(binary)}`;
}

/** Lê os bytes de um arquivo local ou blob (uri do seletor de fotos). */
export async function readUriBytes(uri: string): Promise<Uint8Array> {
  const response = await fetch(uri);
  return new Uint8Array(await response.arrayBuffer());
}
