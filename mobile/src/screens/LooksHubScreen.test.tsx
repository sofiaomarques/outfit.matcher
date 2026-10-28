import { fireEvent, screen } from '@testing-library/react-native';

import { renderScreen } from '../test/render';
import { LooksHubScreen } from './LooksHubScreen';

jest.mock('./LooksScreen', () => ({ LooksScreen: () => null }));
jest.mock('./FavoritesScreen', () => ({ FavoritesScreen: () => null }));

test('começa em Sugeridos e troca pra Favoritos', async () => {
  await renderScreen(<LooksHubScreen />);
  expect(screen.getByText('Sugeridos')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Sugeridos', selected: true })).toBeTruthy();
  await fireEvent.press(screen.getByText('Favoritos'));
  expect(screen.getByRole('button', { name: 'Favoritos', selected: true })).toBeTruthy();
});
