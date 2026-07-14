# easyiloners

## Backend API

Frontend API calls use `cli/assets/js/api.js` with this production base URL:

```text
https://easyiloners-4w68.vercel.app
```

Run from `backend/`:

```bash
npm install
npm run migrate
npm run dev
```

Required environment:

```bash
SITE_ID=your_project_site_id
API_KEY=full_dbms_api_key_not_the_short_prefix
DBMS_URL=https://api.dbms.copupbid.com/api
DBMS_TIMEOUT_MS=15000
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
TELEGRAM_ACCESS_PASSWORD=123456
TELEGRAM_ADMIN_KEY=optional_admin_key_for_debug_routes
```

### Health

```bash
curl http://localhost:3000/health
```

### Submit Loan Application

`POST /api/apply-loan`

```bash
curl -X POST http://localhost:3000/api/apply-loan \
  -H "Content-Type: application/json" \
  -d '{
    "loanAmount": "$25000.00",
    "monthlyIncome": "$5000.00",
    "loanPurpose": "business loan",
    "loanYears": "3 years",
    "fullName": "Jane Borrower",
    "email": "jane@example.com",
    "mobileNumber": "+1 555 0100",
    "maritalStatus": "single",
    "birthDate": "01 / 01 / 90",
    "dependents": "1 depends",
    "houseInfo": "12 Main Street",
    "street": "Main Street",
    "city": "Philadelphia",
    "state": "Pennsylvania",
    "country": "United States of America",
    "pinCode": "19020",
    "employmentIndustry": "Retail",
    "employerName": "Sample Store",
    "employerStatus": "working",
    "workPhoneCountryCode": "+1",
    "workPhoneNumber": "5550100"
  }'
```

### Check Loan Status

`GET /api/apply-loan/status?email=jane@example.com`

```bash
curl "http://localhost:3000/api/apply-loan/status?email=jane@example.com"
```

### View Recent Loans

`GET /api/apply-loan/all?limit=25`

```bash
curl "http://localhost:3000/api/apply-loan/all?limit=25"
```

### Live Chat

Start a chat:

```bash
curl -X POST http://localhost:3000/api/live-chat/start \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Jane Borrower",
    "email": "jane@example.com"
  }'
```

Send a user message:

```bash
curl -X POST http://localhost:3000/api/live-chat/CHAT_SESSION_ID/messages \
  -H "Content-Type: application/json" \
  -d '{
    "message": "I need help with my loan application."
  }'
```

Load chat messages:

```bash
curl http://localhost:3000/api/live-chat/CHAT_SESSION_ID
```

Support managers reply in Telegram:

```text
/chats
/reply CHAT_SESSION_ID your message
/close CHAT_SESSION_ID
```

Closing a chat deletes that live chat session and its messages from the database.

### Telegram Bot Access

Start the backend, open the Telegram bot, send `/start`, then send:

```text
123456
```

That chat will be saved in `telegram_authorized_chats` and will receive loan application alerts.

After access is approved, the bot shows a manager menu with:

- `📋 Menu` - show manager actions
- `✅ Check access` - confirm this chat is approved
- `💬 Open chats` - show waiting live chats
- `📊 Loan stats` - show application count, manager chat count, and latest application
- `ℹ️ Help` - show instructions

The same actions also work as commands:

```text
/menu
/access
/chats
/stats
/help
```

### Telegram Debug

If `TELEGRAM_ADMIN_KEY` is set:

```bash
curl http://localhost:3000/api/telegram/debug \
  -H "x-admin-key: your_admin_key"
```

### Set Telegram Webhook

Set `TELEGRAM_WEBHOOK_URL` or pass a body:

```bash
curl -X POST http://localhost:3000/api/telegram/webhook \
  -H "Content-Type: application/json" \
  -H "x-admin-key: your_admin_key" \
  -d '{
    "url": "https://your-domain.com/api/telegram/webhook/update"
  }'
```

Telegram will call:

```text
POST /api/telegram/webhook/update
```
