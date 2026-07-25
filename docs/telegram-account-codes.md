# Telegram account codes

Nurik's Academy uses Telegram only to deliver account invitations and password-reset codes. Telegram never creates an application login session. Normal sign-in remains phone number plus password.

## Production configuration

Set these variables on the backend Render service:

```env
TELEGRAM_BOT_TOKEN=<BotFather token; secret>
TELEGRAM_BOT_USERNAME=nuriksacademy_bot
```

`TELEGRAM_DELIVERY_MODE` may be omitted in production. A configured bot token selects live delivery. `RENDER_EXTERNAL_HOSTNAME` is used to register `https://<host>/api/telegram/webhook` automatically.

Outside Render, set the complete public endpoint explicitly:

```env
TELEGRAM_WEBHOOK_URL=https://api.example.com/api/telegram/webhook
```

`TELEGRAM_WEBHOOK_SECRET` is optional. When omitted, the backend derives a stable webhook secret from the bot token. Never commit or log the bot token or webhook secret.

## Account flow

1. An authorized administrator creates an account.
2. The backend returns a private, single-use Telegram link and QR code.
3. The administrator shares it directly with the intended person.
4. That person opens the link in a private chat and presses **Start**.
5. The backend binds the permanent numeric Telegram user ID and sends a six-digit activation code.
6. The person enters their phone-number login, code, and chosen password in the application.
7. Future password-reset codes are delivered to the bound Telegram account.

Links expire after 24 hours by default, are invalidated when superseded, and cannot be replayed. Codes expire after five minutes by default and retain the existing attempt and daily-rate limits.

## Test configuration

Automated tests use an explicit transport that never calls Telegram:

```env
APP_ENV=finance_qa
TELEGRAM_DELIVERY_MODE=mock
TELEGRAM_WEBHOOK_SECRET=nuriks-finance-qa-webhook-secret
```

Mock Telegram delivery is rejected when `APP_ENV` is `production` or `prod`.
