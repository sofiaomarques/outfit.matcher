import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import type { ClothingItem } from '../models/clothingItem';
import { ApiException } from '../services/apiStatus';
import { NoAnalyzedItemsException } from '../services/recommendation';
import { OutfitHistory } from '../services/outfitHistory';
import { FakeHistoryStore } from '../test/fakeHistoryStore';
import { blusa, calca, lookOf, saia } from '../test/outfits';
import { renderScreen } from '../test/render';
import { NewLookScreen } from './NewLookScreen';

const WARDROBE: ClothingItem[] = [blusa, calca, saia];

function setup(looks = [lookOf(blusa, calca), lookOf(blusa, saia)]) {
  const store = new FakeHistoryStore();
  const history = new OutfitHistory(store);
  const rejected: { ids: string[]; occasion: string | null }[] = [];
  store.addRejection = async (ids, occasion) => {
    rejected.push({ ids, occasion });
  };
  const recommender = {
    loadWardrobe: jest.fn(async (onProgress?: (d: number, t: number) => void) => {
      onProgress?.(1, 1);
      return WARDROBE;
    }),
    recommend: jest.fn(async () => looks),
  };
  return { store, history, recommender, rejected };
}

async function pump(s: ReturnType<typeof setup>, displayName = 'Ana') {
  await renderScreen(
    <NewLookScreen displayName={displayName} recommender={s.recommender} history={s.history} />,
  );
  await screen.findByText('Escolha uma ocasião pra ver a sugestão de look de hoje.');
}

test('saúda pelo nome e, sem nome, só "Olá!!"', async () => {
  await pump(setup(), 'Ana');
  expect(screen.getByText('Olá, Ana!!')).toBeTruthy();
});

test('sem nome mostra "Olá!!"', async () => {
  await pump(setup(), '');
  expect(screen.getByText('Olá!!')).toBeTruthy();
});

test('escolher a ocasião pede os looks e mostra a primeira sugestão', async () => {
  const s = setup();
  await pump(s);

  await fireEvent.press(screen.getByText('Trabalho'));

  expect(await screen.findByText('Ver outra (1/2)')).toBeTruthy();
  expect(s.recommender.recommend).toHaveBeenCalledWith(WARDROBE, { occasion: 'Trabalho', topK: 5 });
});

test('"Ver outra" percorre as sugestões em ciclo', async () => {
  await pump(setup());
  await fireEvent.press(screen.getByText('Festa'));
  await fireEvent.press(await screen.findByText('Ver outra (1/2)'));
  expect(screen.getByText('Ver outra (2/2)')).toBeTruthy();
  await fireEvent.press(screen.getByText('Ver outra (2/2)'));
  expect(screen.getByText('Ver outra (1/2)')).toBeTruthy();
});

test('com uma sugestão só, não oferece "Ver outra"', async () => {
  await pump(setup([lookOf(blusa, calca)]));
  await fireEvent.press(screen.getByText('Casual'));
  await screen.findByText('Não curti');
  expect(screen.queryByText(/Ver outra/)).toBeNull();
});

test('favoritar o look sugerido salva no histórico', async () => {
  const s = setup();
  await pump(s);
  await fireEvent.press(screen.getByText('Casual'));

  await fireEvent.press(await screen.findByLabelText('Favoritar look'));

  await waitFor(() => expect(s.store.favorites).toHaveLength(1));
  expect(screen.getByLabelText('Desfavoritar look')).toBeTruthy();
});

test('"Não curti" tira o look, salva a rejeição da ocasião e permite desfazer', async () => {
  const s = setup();
  await pump(s);
  await fireEvent.press(screen.getByText('Trabalho'));
  await fireEvent.press(await screen.findByText('Não curti'));

  expect(await screen.findByText('Não vamos mais sugerir esse look pra trabalho.')).toBeTruthy();
  expect(s.rejected).toEqual([{ ids: ['a-calca', 'b-blusa'], occasion: 'trabalho' }]);
  // Sobrou uma só.
  expect(screen.queryByText(/Ver outra/)).toBeNull();

  await fireEvent.press(screen.getByText('Desfazer'));
  expect(await screen.findByText('Ver outra (1/2)')).toBeTruthy();
});

test('se salvar a rejeição falha, o look volta e avisa', async () => {
  const s = setup();
  s.store.addRejection = async () => {
    throw new Error('offline');
  };
  await pump(s);
  await fireEvent.press(screen.getByText('Trabalho'));
  await fireEvent.press(await screen.findByText('Não curti'));

  expect(await screen.findByText('Não foi possível salvar. Tente de novo.')).toBeTruthy();
  expect(await screen.findByText('Ver outra (1/2)')).toBeTruthy();
});

test('rejeitar a última sugestão pede novas', async () => {
  const s = setup([lookOf(blusa, calca)]);
  await pump(s);
  await fireEvent.press(screen.getByText('Trabalho'));
  await fireEvent.press(await screen.findByText('Não curti'));

  await waitFor(() => expect(s.recommender.recommend).toHaveBeenCalledTimes(2));
});

test('guarda-roupa sem como montar look mostra a dica', async () => {
  const s = setup([]);
  await pump(s);
  await fireEvent.press(screen.getByText('Encontro'));
  expect(await screen.findByText(/cadastre pelo menos uma peça de cima/)).toBeTruthy();
});

test('erros do recomendador viram mensagens e "Tentar de novo" refaz o pedido', async () => {
  const s = setup();
  s.recommender.recommend.mockRejectedValueOnce(new ApiException('offline'));
  await pump(s);
  await fireEvent.press(screen.getByText('Casual'));

  expect(await screen.findByText(/Sem conexão com o servidor/)).toBeTruthy();
  await fireEvent.press(screen.getByText('Tentar de novo'));
  expect(await screen.findByText('Ver outra (1/2)')).toBeTruthy();
});

test('peças sem análise e erro genérico têm mensagens próprias', async () => {
  const s = setup();
  s.recommender.recommend
    .mockRejectedValueOnce(new NoAnalyzedItemsException())
    .mockRejectedValueOnce(new Error('?'));
  await pump(s);

  await fireEvent.press(screen.getByText('Casual'));
  expect(await screen.findByText(/Não foi possível analisar suas peças/)).toBeTruthy();
  await fireEvent.press(screen.getByText('Festa'));
  expect(await screen.findByText('Não foi possível gerar o look. Tente de novo.')).toBeTruthy();
});

test('falha ao carregar o guarda-roupa mostra o erro e tenta de novo', async () => {
  const s = setup();
  s.recommender.loadWardrobe.mockRejectedValueOnce(new Error('offline'));
  await renderScreen(<NewLookScreen recommender={s.recommender} history={s.history} />);

  expect(await screen.findByText('Não foi possível carregar seu guarda-roupa.')).toBeTruthy();
  await fireEvent.press(screen.getByText('Tentar de novo'));
  expect(await screen.findByText('Escolha uma ocasião pra ver a sugestão de look de hoje.')).toBeTruthy();
});

test('tocar no card abre o detalhe e voltar volta à sugestão', async () => {
  await pump(setup());
  await fireEvent.press(screen.getByText('Trabalho'));
  await fireEvent.press(await screen.findByLabelText('Abrir look'));

  expect(await screen.findByText('Look do dia')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Voltar'));
  expect(await screen.findByText('Ver outra (1/2)')).toBeTruthy();
});
