import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';

import { OutfitHistory } from '../services/outfitHistory';
import { FakeHistoryStore } from '../test/fakeHistoryStore';
import { blusa, calca, lookOf } from '../test/outfits';
import { renderScreen } from '../test/render';
import { OutfitDetailScreen } from './OutfitDetailScreen';

const look = lookOf(blusa, calca);

function setup() {
  const store = new FakeHistoryStore();
  const history = new OutfitHistory(store);
  const onBack = jest.fn();
  return { store, history, onBack };
}

test('mostra título, tags e a paleta de cada peça', async () => {
  const { history, onBack } = setup();
  await renderScreen(<OutfitDetailScreen outfit={look} history={history} onBack={onBack} />);

  expect(screen.getByText('Look do dia')).toBeTruthy();
  expect(screen.getByText('Trabalho')).toBeTruthy();
  expect(screen.getByLabelText('Cor de b-blusa')).toBeTruthy();
  expect(screen.getByLabelText('Cor de a-calca')).toBeTruthy();
});

test('título personalizado e voltar', async () => {
  const { history, onBack } = setup();
  await renderScreen(<OutfitDetailScreen outfit={look} title="Look salvo" history={history} onBack={onBack} />);

  expect(screen.getByText('Look salvo')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Voltar'));
  expect(onBack).toHaveBeenCalled();
});

test('"Salvar look" favorita e vira "Look salvo"', async () => {
  const { store, history, onBack } = setup();
  await renderScreen(<OutfitDetailScreen outfit={look} history={history} onBack={onBack} />);

  await fireEvent.press(screen.getByText('♡ Salvar look'));

  expect(await screen.findByText('♥ Look salvo')).toBeTruthy();
  expect(store.favorites).toEqual([['a-calca', 'b-blusa']]);
});

test('se salvar o favorito falha, avisa', async () => {
  const { store, history, onBack } = setup();
  store.fail = true;
  await renderScreen(<OutfitDetailScreen outfit={look} history={history} onBack={onBack} />);

  await fireEvent.press(screen.getByText('♡ Salvar look'));

  expect(await screen.findByText('Não foi possível salvar o favorito.')).toBeTruthy();
  expect(screen.getByText('♡ Salvar look')).toBeTruthy();
});

test('"Usei hoje" anota o uso e trava o botão', async () => {
  const { history, onBack } = setup();
  await renderScreen(<OutfitDetailScreen outfit={look} history={history} onBack={onBack} />);

  await fireEvent.press(screen.getByText('Usei hoje'));

  expect(await screen.findByText('Anotado: você usou esse look hoje.')).toBeTruthy();
  expect(screen.getByText('✓ Usado hoje')).toBeTruthy();
});

test('look usado há dias mostra há quanto tempo e deixa marcar de novo', async () => {
  const { history, onBack } = setup();
  const threeDaysAgo = new Date();
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
  await act(async () => {
    await history.markWorn(look, threeDaysAgo);
  });
  await renderScreen(<OutfitDetailScreen outfit={look} history={history} onBack={onBack} />);

  expect(screen.getByText('Usado há 3 dias')).toBeTruthy();
  expect(screen.getByText('Usei hoje')).toBeTruthy();
});
