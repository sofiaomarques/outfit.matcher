import { fireEvent, screen } from '@testing-library/react-native';

import { makeOutfit } from '../models/outfit';
import { OutfitHistory } from '../services/outfitHistory';
import { FakeHistoryStore } from '../test/fakeHistoryStore';
import { blusa, calca, garment, lookOf } from '../test/outfits';
import { renderScreen } from '../test/render';
import { LooksScreen } from './LooksScreen';

// 8 looks distintos: 2 páginas (6 + 2).
const many = Array.from({ length: 8 }, (_, i) =>
  makeOutfit({ id: `l${i}`, items: [garment(`t${i}`, 'top'), calca], tags: [] }),
);

function setup(looks = many) {
  const history = new OutfitHistory(new FakeHistoryStore());
  const recommender = {
    loadWardrobe: jest.fn(async () => [blusa, calca]),
    recommend: jest.fn(async () => looks),
  };
  return { history, recommender };
}

async function pump(s: ReturnType<typeof setup>) {
  await renderScreen(<LooksScreen recommender={s.recommender} history={s.history} />);
  await screen.findByText('Seus looks');
}

test('carrega o guarda-roupa e pede 24 looks sem filtro de clima', async () => {
  const s = setup();
  await pump(s);

  expect(await screen.findAllByLabelText('Favoritar look')).toHaveLength(6);
  expect(s.recommender.recommend).toHaveBeenCalledWith([blusa, calca], {
    weather: 'Qualquer clima',
    topK: 24,
  });
});

test('pagina de 6 em 6 com os botões anterior e próxima', async () => {
  await pump(setup());
  await screen.findAllByLabelText('Favoritar look');

  await fireEvent.press(screen.getByLabelText('Próxima página'));
  expect(screen.getAllByLabelText('Favoritar look')).toHaveLength(2);

  await fireEvent.press(screen.getByLabelText('Página anterior'));
  expect(screen.getAllByLabelText('Favoritar look')).toHaveLength(6);
});

test('poucos looks: sem paginação', async () => {
  await pump(setup([lookOf(blusa, calca)]));
  await screen.findAllByLabelText('Favoritar look');
  expect(screen.queryByLabelText('Próxima página')).toBeNull();
});

test('trocar o clima refaz os looks e volta pra primeira página', async () => {
  const s = setup();
  await pump(s);
  await screen.findAllByLabelText('Favoritar look');
  await fireEvent.press(screen.getByLabelText('Próxima página'));

  await fireEvent.press(screen.getByText('Frio'));

  expect(await screen.findAllByLabelText('Favoritar look')).toHaveLength(6);
  expect(s.recommender.recommend).toHaveBeenLastCalledWith([blusa, calca], { weather: 'Frio', topK: 24 });
});

test('sem looks possíveis mostra a dica', async () => {
  await pump(setup([]));
  expect(await screen.findByText(/cadastre pelo menos uma peça de cima/)).toBeTruthy();
});

test('erro ao gerar os looks mostra a mensagem e "Tentar de novo"', async () => {
  const s = setup();
  s.recommender.recommend.mockRejectedValueOnce(new Error('?'));
  await pump(s);

  expect(await screen.findByText('Não foi possível gerar os looks. Tente de novo.')).toBeTruthy();
  await fireEvent.press(screen.getByText('Tentar de novo'));
  expect(await screen.findAllByLabelText('Favoritar look')).toHaveLength(6);
});

test('tocar num look abre o detalhe', async () => {
  await pump(setup());
  const cards = await screen.findAllByLabelText('Abrir look');
  await fireEvent.press(cards[0]);

  expect(await screen.findByText('Look do dia')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Voltar'));
  expect(await screen.findByText('Seus looks')).toBeTruthy();
});
