import { render } from '@testing-library/react-native';
import { BackHandler } from 'react-native';

import { useBackNavigation } from './backNavigation';

type Handler = Parameters<typeof BackHandler.addEventListener>[1];

function Screen({ open, onBack }: { open: boolean; onBack: () => void }) {
  useBackNavigation(open, onBack);
  return null;
}

const handlers: Handler[] = [];

beforeEach(() => {
  handlers.length = 0;
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, handler) => {
    handlers.push(handler);
    return {
      remove: () => {
        handlers.splice(handlers.indexOf(handler), 1);
      },
    };
  });
});

afterEach(() => jest.restoreAllMocks());

// Como o Android: do último registrado ao primeiro, até alguém tratar.
function pressBack() {
  for (const handler of [...handlers].reverse()) if (handler(undefined as never)) return;
}

describe('useBackNavigation', () => {
  it('fecha a tela interna com o botão voltar', async () => {
    const onBack = jest.fn();
    await render(<Screen open onBack={onBack} />);
    pressBack();
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('não intercepta o voltar com a tela fechada', async () => {
    const onBack = jest.fn();
    await render(<Screen open={false} onBack={onBack} />);
    pressBack();
    expect(onBack).not.toHaveBeenCalled();
  });

  it('só a tela de cima responde', async () => {
    const first = jest.fn();
    const second = jest.fn();
    await render(
      <>
        <Screen open onBack={first} />
        <Screen open onBack={second} />
      </>,
    );
    pressBack();
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });
});
