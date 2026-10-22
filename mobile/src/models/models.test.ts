import { categoryFromName } from './clothingCategory';
import { hexToSwatch, swatchToHex } from './clothingItem';
import { displayNameOf } from '../services/currentUser';

test('swatch ARGB vai e volta de #rrggbb', () => {
  expect(swatchToHex(0xff7a1836)).toBe('#7a1836');
  expect(swatchToHex(0xff000000)).toBe('#000000');
  expect(hexToSwatch('#7a1836')).toBe(0xff7a1836);
  expect(hexToSwatch('#7a1836')).toBeGreaterThan(0); // sem sinal, cabe na coluna do banco
});

test('categoryFromName aceita os nomes do banco e recusa o resto', () => {
  expect(categoryFromName('skirt')).toBe('skirt');
  expect(() => categoryFromName('Saias')).toThrow();
});

describe('displayNameOf', () => {
  test('prefere o nome escolhido no cadastro', () => {
    expect(displayNameOf({ email: 'a@b.c', user_metadata: { display_name: '  Sofia ' } })).toBe('Sofia');
  });
  test('sem nome, cai pro início do e-mail', () => {
    expect(displayNameOf({ email: 'sofia@exemplo.com', user_metadata: {} })).toBe('sofia');
    expect(displayNameOf({ email: 'a@b.c', user_metadata: { display_name: '   ' } })).toBe('a');
  });
  test('sem usuário nem e-mail, vazio', () => {
    expect(displayNameOf(null)).toBe('');
    expect(displayNameOf({ email: undefined, user_metadata: {} })).toBe('');
  });
});
