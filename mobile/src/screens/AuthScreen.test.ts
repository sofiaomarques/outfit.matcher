import { authErrorMessage, validateAuth } from './AuthScreen';

describe('authErrorMessage', () => {
  it('traduz credenciais inválidas', () => {
    expect(authErrorMessage('Invalid login credentials')).toBe('E-mail ou senha incorretos.');
  });

  it('mantém mensagens desconhecidas', () => {
    expect(authErrorMessage('Algo novo')).toBe('Algo novo');
  });
});

describe('validateAuth', () => {
  it('pede nome só no cadastro', () => {
    const f = { name: ' ', email: 'a@b.c', password: '123456' };
    expect(validateAuth(f, true).name).toBeDefined();
    expect(validateAuth(f, false)).toEqual({});
  });
});
