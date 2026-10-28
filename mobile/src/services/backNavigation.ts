import { createContext, useContext, useEffect, useRef } from 'react';
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
let listening = false;

/**
 * Falso nas telas escondidas (abas de fundo, seção fechada do Looks): elas
 * continuam montadas, mas não podem tomar o "voltar" de quem está à vista.
 */
export const VisibleContext = createContext(true);

// Cada entrada empurrada guarda a profundidade da pilha. Só fechamos quando o
// histórico recuou para menos telas do que as abertas: avançar, ou o popstate
// causado pelo nosso próprio history.back(), deixa a profundidade >= a da pilha.
function onPopState(event: PopStateEvent) {
  const depth = event.state?.overlay ?? 0;
  if (depth < stack.length) stack.pop()?.close();
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
  if (isWeb && window.history.state?.overlay) window.history.back();
}

/**
 * Faz o botão voltar (Android) e o voltar do navegador fecharem a tela
 * interna enquanto `active`, em vez de sair do app ou da página.
 */
export function useBackNavigation(active: boolean, onBack: () => void) {
  const visible = useContext(VisibleContext);
  const registered = active && visible;
  const onBackRef = useRef(onBack);
  useEffect(() => {
    onBackRef.current = onBack;
  });

  useEffect(() => {
    if (!registered) return;
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
  }, [registered]);
}

/** Aba aberta segundo o endereço (`#/looks`); 0 se não houver ou fora da web. */
export function tabFromAddress(slugs: string[]): number {
  if (!isWeb) return 0;
  const index = slugs.indexOf(window.location.hash.replace(/^#\/?/, ''));
  return index === -1 ? 0 : index;
}

/** Guarda a aba no endereço, pra recarregar a página voltar nela. */
export function saveTabInAddress(slugs: string[], index: number) {
  if (!isWeb) return;
  const hash = `#/${slugs[index] ?? slugs[0]}`;
  if (window.location.hash === hash) return;
  const { pathname, search } = window.location;
  window.history.replaceState(window.history.state, '', `${pathname}${search}${hash}`);
}
