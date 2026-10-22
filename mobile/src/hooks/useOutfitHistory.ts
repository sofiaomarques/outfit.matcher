import { useSyncExternalStore } from 'react';

import { useToast } from '../components/Toast';
import type { Outfit } from '../models/outfit';
import { outfitHistory, type OutfitHistory } from '../services/outfitHistory';

/** Re-renderiza a tela quando favoritos, rejeições ou usos mudam; devolve o histórico compartilhado. */
export function useOutfitHistory(history: OutfitHistory = outfitHistory): OutfitHistory {
  useSyncExternalStore(history.subscribe, history.getSnapshot);
  return history;
}

/** Ações dos cards de look, avisando (toast) se não deu pra salvar. */
export function useOutfitActions(history: OutfitHistory = outfitHistory) {
  const toast = useToast();
  return {
    async toggleFavorite(outfit: Outfit) {
      if (!(await history.toggleFavorite(outfit))) toast('Não foi possível salvar o favorito.');
    },
    async markWorn(outfit: Outfit) {
      const saved = await history.markWorn(outfit);
      toast(saved ? 'Anotado: você usou esse look hoje.' : 'Não foi possível salvar. Tente de novo.');
    },
  };
}
