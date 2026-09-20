# outfit_matcher (app)

Interface do Outfit Matcher em Flutter (web + iOS + Android), construída
a partir do mockup do projeto. Por enquanto usa dados fake em
`lib/data/mock_wardrobe.dart` — a troca pelo pipeline real em Python
(`model/gerar_outfit.py`) fica pra depois, já que o formato dos looks
(`Outfit.items` + `score`) segue o mesmo contrato que o modelo retorna.

## Rodando

```bash
flutter pub get
flutter run -d chrome   # web
flutter run              # dispositivo/emulador conectado
```

## Estrutura

- `lib/theme/` — paleta de cores e tipografia
- `lib/models/` — `ClothingItem`, `Outfit`, categorias
- `lib/data/` — mock do guarda-roupa
- `lib/widgets/` — componentes reutilizáveis (nav, cards, peça, estrela decorativa)
- `lib/screens/` — telas (inicial, guarda-roupa, looks, detalhe do look)

## Telas ainda não desenhadas

"Favoritos" e "Configurações" existem só como placeholder no menu — não
faziam parte do mockup original.
