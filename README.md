# Telegram OpenRouter Bot 🤖

A complete Telegram bot solution for interacting with AI models through OpenRouter API, built on Cloudflare Workers platform.

## ✨ Key Features

### 🤖 AI Chat Interface
- Connect to 100+ AI models via OpenRouter
- Streaming responses for real-time interaction
- Conversation history and context memory
- Customizable system prompts

### 🔒 Security
- JWT-based authentication
- Encrypted user credentials storage
- HttpOnly and Secure cookies
- Rate limiting protection
- Token blacklisting system

### ⚡ Performance
- Edge computing via Cloudflare Workers
- KV storage for fast data access
- Automatic scaling
- Low latency worldwide

### 🌐 Multi-language Support
- English (default)
- Indonesian localization
- Easy to add more languages

## 🚀 Deployment Options

### One-Click Deployment
[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/adriandrmawan/Telegram-OpenRouter-Bot)

### Manual Deployment Steps

1. **Prerequisites**
   - Node.js v16+
   - npm/yarn
   - Cloudflare account
   - Telegram bot token

2. **Installation**
```bash
# Clone repository
git clone https://github.com/adriandrmawan/Telegram-OpenRouter-Bot.git.git
cd Telegram-OpenRouter-Bot

# Install dependencies
npm install

# Install Wrangler CLI
npm install -g wrangler
```

3. **Configuration**
- Create KV namespaces in Cloudflare dashboard:
  - USER_DATA
  - CACHE  
  - TOKEN_BLACKLIST
- Set environment variables:
  - `TELEGRAM_BOT_TOKEN` (from @BotFather)
  - `JWT_SECRET` (min 32 chars random string)
  - `ALLOWED_USER_IDS` (comma-separated Telegram IDs)

4. **Deploy**
```bash
wrangler login
wrangler deploy
```

## 🛠 Configuration Details

### Required Environment Variables
| Variable | Description | Example |
|----------|-------------|---------|
| TELEGRAM_BOT_TOKEN | From @BotFather | `123456:ABC-DEF1234` |
| JWT_SECRET | Random string for token signing | `my-secret-key-123` |
| ALLOWED_USER_IDS | Restricted access IDs | `12345,67890` |

### Optional Variables
| Variable | Description | Default |
|----------|-------------|---------|
| DEFAULT_MODEL | Default AI model | `openai/gpt-3.5-turbo` |
| DEFAULT_LANGUAGE | UI language | `en` |

## 🤖 Bot Commands

### Basic Commands
- `/start` - Initialize bot
- `/help` - Show command list
- `/setkey API_KEY` - Save OpenRouter API key

### AI Interaction
- `/ask [question]` - Ask the AI
- `/newchat` - Start fresh conversation
- `/changemodel` - Switch AI model

### Settings
- `/setsystemprompt` - Customize AI behavior  
- `/setlang [en/id]` - Change language
- `/togglesearch` - Enable/disable web search
- `/managetoken` - Manage your API token
- `/setpersona` - Choose predefined AI persona

## 🔒 Security Best Practices

1. **Token Security**
   - Use long, random JWT_SECRET (min 32 chars)
   - Rotate secrets periodically
   - Never commit secrets to git

2. **Access Control**
   - Restrict to specific Telegram IDs
   - Monitor usage logs
   - Implement rate limiting

3. **Data Protection**
   - All sensitive data encrypted
   - HttpOnly cookies
   - Regular backups

[View Indonesian Version](README.id.md)
