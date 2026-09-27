# Хостинг — много телефонов онлайн

## Ссылки для команд

**Основная (GitHub Pages):**  
https://kseniajarikova.github.io/autoquest-2026/

**Зеркало 1 — jsDelivr CDN** (часто открывается из РФ стабильнее, чем github.io):  
https://cdn.jsdelivr.net/gh/kseniajarikova/autoquest-2026@4cbaf6e/index.html

**Зеркало 2 — jsDelivr (альтернативный узел):**  
https://fastly.jsdelivr.net/gh/kseniajarikova/autoquest-2026@4cbaf6e/index.html

Ссылки с `@4cbaf6e` — актуальный снимок (без долгого кэша `@master`). После следующих правок обновите хеш коммита в ссылке или временно используйте `@master` (кэш до суток).

## Как это работает
- Все команды открывают **одну и ту же ссылку** с интернетом.
- У каждой команды свой телефон → свой прогресс и таймер (не пересекаются).
- Репозиторий: https://github.com/kseniajarikova/autoquest-2026  
- `key.html` командам не давать.

## Обновить сайт после правок
```
cd C:\Users\user\Documents\Autoquest\2026
git add index.html styles.css js
git commit -m "Update quest"
git push origin master
```
Через 1–2 минуты обновится GitHub Pages. Зеркало jsDelivr подтянется само (с учётом кэша выше).

## Cloudflare Pages (опционально, ещё одно зеркало)
Нужен аккаунт Cloudflare и логин один раз:
```
cd C:\Users\user\Documents\Autoquest\2026
npx wrangler login
npx wrangler pages project create autoquest-2026
npx wrangler pages deploy . --project-name=autoquest-2026 --branch=main
```
Получите URL вида `https://autoquest-2026.pages.dev` — его тоже можно дать командам как запасной.
