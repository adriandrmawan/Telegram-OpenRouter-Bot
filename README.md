# Telegram OpenRouter Bot (Cloudflare Worker)

This is a Telegram bot that acts as an interface to AI models available through OpenRouter.ai. It runs entirely on Cloudflare Workers, utilizing KV storage for user settings and environment variables for configuration.

## Features

*   **OpenRouter Integration:** Connects to various AI models via user-provided OpenRouter API keys.
*   **Cloudflare Workers:** Runs serverlessly on Cloudflare's edge network.
*   **KV Storage:** Securely stores user API keys and preferences (model, system prompt).
*   **Streaming Responses:** Provides real-time, streamed responses for the `/ask` command.
*   **User Authorization:** Restricts bot usage to specific Telegram User IDs configured via environment variables.
*   **Multi-language Support:** Supports English (en) and Indonesian (id), configurable via environment variable and potentially user preference later.
*   **Customizable Settings:** Users can set their preferred model and system prompt.
*   **Easy Deployment:** Includes a "Deploy to Cloudflare" button.

## Setup

1.  **Telegram Bot Token:**
    *   Talk to [@BotFather](https://t.me/BotFather) on Telegram.
    *   Create a new bot using `/newbot`.
    *   Follow the instructions and copy the **HTTP API token**.

2.  **OpenRouter API Key:**
    *   Sign up or log in at [OpenRouter.ai](https://openrouter.ai/).
    *   Go to your account settings and generate an API key. Users will provide their own keys to the bot via the `/setkey` command.

3.  **Cloudflare Account:**
    *   Sign up for a free [Cloudflare account](https://dash.cloudflare.com/sign-up).

4.  **KV Namespace:**
    *   In your Cloudflare dashboard, navigate to **Workers & Pages** > **KV**.
    *   Click **Create a namespace**.
    *   Enter a name (e.g., `TELEGRAM_BOT_KV`) and click **Add**.
    *   Copy the **Namespace ID** and **Preview ID**.

## Configuration

1.  **`wrangler.toml`:**
    *   Open the `wrangler.toml` file.
    *   Update the `name` field with your desired worker name.
    *   Find the `[[kv_namespaces]]` section.
    *   Set `binding` to `"USER_DATA"` (this is how the code accesses KV).
    *   Paste the **Namespace ID** you copied into the `id` field.
    *   Paste the **Preview ID** you copied into the `preview_id` field.

2.  **Cloudflare Environment Variables & Secrets:**
    *   **Deploy via Button/CLI first**, then configure secrets and variables in the Cloudflare dashboard for your deployed worker (**Settings > Variables**).
    *   **Secrets** (Use `wrangler secret put <KEY>` or add via Dashboard > Workers & Pages > Your Worker > Settings > Variables > Secret Variables):
        *   `TELEGRAM_BOT_TOKEN`: Your Telegram Bot Token obtained from BotFather.
        *   `OPENROUTER_API_KEY` (Optional): Your *own* OpenRouter key if you need the bot to perform admin tasks like fetching all available models dynamically (not implemented by default). User keys are stored in KV.
    *   **Variables** (Add via Dashboard > Workers & Pages > Your Worker > Settings > Variables > Environment Variables):
        *   `ALLOWED_USER_IDS`: A comma-separated list of Telegram User IDs allowed to use the bot (e.g., `12345678,98765432`). Leave empty or unset to allow all users.
        *   `DEFAULT_LANGUAGE`: Set the default language (`en` or `id`). Defaults to `en` if unset.
        *   `DEFAULT_MODEL`: The default OpenRouter model ID to use if the user hasn't set one (e.g., `openai/gpt-3.5-turbo`).
        *   `DEFAULT_SYSTEM_PROMPT`: The default system prompt to use if the user hasn't set one (e.g., `You are a helpful assistant.`).

## Deployment

### Option 1: Deploy to Cloudflare Button

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/YOUR_GITHUB_USERNAME/YOUR_REPOSITORY_NAME)

**(Remember to replace `YOUR_GITHUB_USERNAME/YOUR_REPOSITORY_NAME` in the button URL above with your actual GitHub repository URL after you push the code there!)**

After deploying with the button, **you MUST configure the Secrets and Variables** as described in the Configuration section in your Cloudflare dashboard.

### Option 2: Using Wrangler CLI

1.  **Install Wrangler:**
    ```bash
    npm install -g wrangler
    ```
2.  **Login to Cloudflare:**
    ```bash
    wrangler login
    ```
3.  **Deploy:**
    ```bash
    wrangler deploy
    ```
    This command will build and deploy your worker based on `wrangler.toml`. It will also prompt you to set up secrets if they are defined in `wrangler.toml` but not yet configured in Cloudflare. Remember to configure the non-secret environment variables in the dashboard afterwards.

4.  **Set Telegram Webhook:**
    After deployment, you need to tell Telegram where to send updates. Run the following command in your terminal, replacing `<YOUR_WORKER_URL>` with the URL provided after deployment (usually `https://your-worker-name.your-subdomain.workers.dev`) and `<YOUR_TELEGRAM_BOT_TOKEN>` with your token:
    ```bash
    curl "https://api.telegram.org/bot<YOUR_TELEGRAM_BOT_TOKEN>/setWebhook?url=<YOUR_WORKER_URL>"
    ```
    You should see a response like `{"ok":true,"result":true,"description":"Webhook was set"}`.

## Usage

Interact with your bot on Telegram:

*   `/start`: Initializes the bot. Prompts for API key if not set, otherwise shows options.
*   `/setkey YOUR_API_KEY`: Saves and verifies your OpenRouter API key.
*   `/setmodel MODEL_ID`: Sets your preferred AI model (e.g., `/setmodel openai/gpt-4o`). Find model IDs on [OpenRouter.ai](https://openrouter.ai/models).
*   `/setsystemprompt YOUR_PROMPT`: Sets a custom system prompt for the AI. Leave the prompt empty (`/setsystemprompt`) to reset to the default.
*   `/resetsettings`: Clears your stored API key, model, and system prompt.
*   `/ask YOUR_QUESTION`: Asks the configured AI model a question. The response will be streamed.
*   `/help`: Shows the list of available commands and current settings.

Enjoy your AI assistant on Telegram!
