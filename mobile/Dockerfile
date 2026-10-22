# Site do Wable (Expo/React Native for web), servido como arquivos estáticos
# pelo nginx — pensado pro Cloud Run, que manda a porta em $PORT.
#
# As variáveis EXPO_PUBLIC_* são embutidas no JavaScript na hora do build (não
# existe "variável de ambiente" num site estático), então entram como
# --build-arg. A anon key do Supabase é pública por design (protegida pelas
# policies de RLS em supabase/schema.sql), mas não fica fixa no repositório.
#
#   docker build \
#       --build-arg EXPO_PUBLIC_SUPABASE_URL=https://<projeto>.supabase.co \
#       --build-arg EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon key> \
#       --build-arg EXPO_PUBLIC_API_BASE_URL=https://<api> \
#       -t wable-web mobile/
#
#   docker run --rm -p 8080:8080 wable-web
#
# O domínio onde o site ficar precisa estar em ALLOWED_ORIGINS da API (CORS).

FROM node:24-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

ARG EXPO_PUBLIC_SUPABASE_URL
ARG EXPO_PUBLIC_SUPABASE_ANON_KEY
ARG EXPO_PUBLIC_API_BASE_URL
ARG EXPO_PUBLIC_APP_VERSION
ARG EXPO_PUBLIC_FEEDBACK_URL
ENV EXPO_PUBLIC_SUPABASE_URL=$EXPO_PUBLIC_SUPABASE_URL \
    EXPO_PUBLIC_SUPABASE_ANON_KEY=$EXPO_PUBLIC_SUPABASE_ANON_KEY \
    EXPO_PUBLIC_API_BASE_URL=$EXPO_PUBLIC_API_BASE_URL \
    EXPO_PUBLIC_APP_VERSION=$EXPO_PUBLIC_APP_VERSION \
    EXPO_PUBLIC_FEEDBACK_URL=$EXPO_PUBLIC_FEEDBACK_URL \
    CI=1

# Sem estas o site sobe "quebrado": o valor vazio vence o padrão do código e o
# erro só aparece em tempo de execução. Melhor falhar o build.
RUN test -n "$EXPO_PUBLIC_SUPABASE_URL" && test -n "$EXPO_PUBLIC_SUPABASE_ANON_KEY" && test -n "$EXPO_PUBLIC_API_BASE_URL" \
    || { echo "Faltam --build-arg EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY e EXPO_PUBLIC_API_BASE_URL" >&2; exit 1; }

COPY . .
RUN npm run build:web

FROM nginx:1.27-alpine
# Cloud Run manda a porta em $PORT; o nginx lê os templates de /etc/nginx/templates.
ENV PORT=8080
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
