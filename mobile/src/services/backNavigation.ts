import { useEffect, useRef } from 'react';
import { BackHandler, Platform } from 'react-native';

/**
 * Telas internas abertas por cima da aba (adicionar peça, detalhe do look).
 * A última aberta é a primeira a fechar quando a pessoa volta.
 */
interface Overlay {
  close: () => void;
}

const stack: Overlay[] = [];
const isWeb = Platform.OS === 'web' && typeof window !== 'undefined' && !!window.history;
// popstates provocados por nós mesmos (fechar pelo botão da tela) não fecham mais nada.
let ignoredPops = 0;
let listening = false;

function onPopState() {
  if (ignoredPops > 0) {
    ignoredPops--;
    return;
  }
  stack.pop()?.close();
}

function open(overlay: Overlay) {
  stack.push(overlay);
  if (!isWeb) return;
  if (!listening) {
    window.addEventListener('popstate', onPopState);
    listening = true;
  }
  // Uma entrada no histórico por tela interna: o "voltar" do navegador a desfaz.
  window.history.pushState({ overlay: stack.length }, '');
}

function dismiss(overlay: Overlay) {
  const index = stack.indexOf(overlay);
  // Já saiu da pilha: foi o próprio "voltar" que fechou a tela.
  if (index === -1) return;
  stack.splice(index, 1);
  // Só desfaz a entrada que nós empurramos; se o histórico já andou, não há popstate a esperar.
  if (isWeb && window.history.state?.overlay) {
    ignoredPops++;
    window.history.back();
  }
}

/**
 * Faz o botão voltar (Android) e o voltar do navegador fecharem a tela
 * interna enquanto `active`, em vez de sair do app ou da página.
 */
export function useBackNavigation(active: boolean, onBack: () => void) {
  const onBackRef = useRef(onBack);
  useEffect(() => {
    onBackRef.current = onBack;
  });

  useEffect(() => {
    if (!active) return;
    const overlay: Overlay = { close: () => onBackRef.current() };
    open(overlay);
    const hardware = isWeb
      ? null
      : BackHandler.addEventListener('hardwareBackPress', () => {
          // Só a tela de cima responde.
          if (stack[stack.length - 1] !== overlay) return false;
          stack.pop();
          overlay.close();
          return true;
        });
    return () => {
      hardware?.remove();
      dismiss(overlay);
    };
  }, [active]);
}

const TAB_SLUGS = ['guarda-roupa', 'novo-look', 'looks', 'wishlist', 'configuracoes'];

/** Aba aberta segundo o endereço (`#/looks`); 0 se não houver ou fora da web. */
export function tabFromAddress(): number {
  if (!isWeb) return 0;
  const index = TAB_SLUGS.indexOf(window.location.hash.replace(/^#\/?/, ''));
  return index === -1 ? 0 : index;
}

/** Guarda a aba no endereço, pra recarregar a página voltar nela. */
export function saveTabInAddress(index: number) {
  if (!isWeb) return;
  const hash = `#/${TAB_SLUGS[index] ?? TAB_SLUGS[0]}`;
  if (window.location.hash === hash) return;
  const { pathname, search } = window.location;
  window.history.replaceState(window.history.state, '', `${pathname}${search}${hash}`);
}
