# DA CHEF

Mobile-first витрина с каталогом, корзиной, серверным приёмом заказов и
защищённым реестром заявок.

## Запуск

```powershell
$env:ORDER_API_ENABLED="true"
$env:ADMIN_PASSWORD="change-me"
npm start
```

## Заказы

Endpoint `POST /api/order` пересчитывает заказ по серверному каталогу. Реестр
доступен по адресу `/admin/orders` через HTTP Basic Auth. Заявки хранятся
отдельными JSON-файлами в `DATA_DIR` и сохраняются между перезапусками, если
`/data` подключён как persistent storage.

Обязательные production-переменные:

```text
ORDER_API_ENABLED=true
ADMIN_USERNAME=admin
ADMIN_PASSWORD=<случайный длинный пароль>
PUBLIC_BASE_URL=https://dachef.shop
DATA_DIR=/data
TRUST_PROXY=true
```

Для Telegram-уведомлений без персональных данных дополнительно задаются
`TELEGRAM_BOT_TOKEN` и `TELEGRAM_CHAT_ID`.

## Проверка

```powershell
npm run check
npm test
```
