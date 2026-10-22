import { useSyncExternalStore } from 'react';

import { apiStatus, type ApiState, type ApiStatus } from '../services/apiStatus';

/** Estado atual da API, re-renderizando a tela quando muda. */
export function useApiStatus(api: ApiStatus = apiStatus): ApiState {
  return useSyncExternalStore(api.subscribe, api.getSnapshot);
}
