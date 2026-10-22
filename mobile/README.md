# Wable (Expo / React Native, web + iOS + Android)

Substitui o app Flutter de `../app/` (migração em andamento). A API Python e o
Supabase continuam os mesmos.

## Desenvolvimento

```bash
cd mobile
npm install
EXPO_PUBLIC_SUPABASE_URL=https://<projeto>.supabase.co \
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon key> \
EXPO_PUBLIC_API_BASE_URL=http://localhost:8000 \
npx expo start --web        # ou --ios / --android
```

| Variável | Para quê |
|---|---|
| `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase (a anon key é pública por design; a proteção é o RLS). |
| `EXPO_PUBLIC_API_BASE_URL` | API Python (padrão `http://localhost:8000`). |
| `EXPO_PUBLIC_APP_VERSION` | Versão mostrada em Configurações (padrão `dev`). |
| `EXPO_PUBLIC_FEEDBACK_URL` | Link do "Mandar feedback" (sem ele, a opção some). |

Testes e tipos: `npm test` e `npm run typecheck`.

## Site no Cloud Run

`npm run build:web` gera o site estático em `dist/`. A imagem
(`mobile/Dockerfile`) faz esse build e serve com nginx na porta de `$PORT`
(Cloud Run), com fallback de SPA e cache longo nos arquivos com hash.

Num site estático as variáveis `EXPO_PUBLIC_*` são **embutidas no JavaScript
na hora do build**, então entram como `--build-arg` (trocar uma exige
reconstruir a imagem):

```bash
docker build \
  --build-arg EXPO_PUBLIC_SUPABASE_URL=https://<projeto>.supabase.co \
  --build-arg EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon key> \
  --build-arg EXPO_PUBLIC_API_BASE_URL=https://<url da api> \
  -t wable-web mobile/

docker run --rm -p 8080:8080 wable-web   # http://localhost:8080
```

Depois do deploy, coloque o domínio do site em `ALLOWED_ORIGINS` da API
(CORS) e em *Authentication → URL Configuration* do Supabase.
