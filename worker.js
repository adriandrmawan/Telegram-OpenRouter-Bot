import en from './locales/en.json';
import id from './locales/id.json';

/**
 * @typedef {Object} Environment
 * @property {string} TELEGRAM_BOT_TOKEN
 * @property {string} ALLOWED_USER_IDS
 * @property {string} DEFAULT_LANGUAGE
 * @property {string} DEFAULT_MODEL
 * @property {string} [DEFAULT_SYSTEM_PROMPT]
 * @property {KVNamespace} USER_DATA
 * @property {KVNamespace} CACHE
 * @property {string} [OPENROUTER_API_KEY]
 * @property {string} [GOOGLE_API_KEY] 
 * @property {string} [GOOGLE_CX]
 * @property {string} [BING_API_KEY]
 */

/**
 * @typedef {object} UserSettings
 * @property {string} [apiKey]
 * @property {string} [model]
 * @property {string} [systemPrompt]
 * @property {string} [language]
 * @property {Array<{role: 'user'|'assistant', content: string}>} [history]
 */

// --- Constants ---
const TELEGRAM_API_BASE = 'https://api.telegram.org/bot';
const OPENROUTER_API_BASE = 'https://openrouter.ai/api/v1';
const LOCALES = { en, id };
const CACHE_TTL = 60 * 60 * 4; // 4 hours for search cache

// --- Predefined Personas ---
const PERSONAS = {
    default: 'You are a helpful assistant.',
    coder: 'You are an expert programmer. Provide code examples and explain technical concepts clearly.',
    translator: 'You are a multilingual translator. Translate the given text accurately.',
    summarizer: 'You are an expert summarizer. Provide concise summaries of the given text.',
};

// --- Helper Functions ---

/**
 * Summarizes conversation history using the summarizer persona
 * @param {Array} history - Conversation history array
 * @param {string} systemPrompt - Current system prompt
 * @returns {Promise<string>} Summary of the conversation
 */
async function summarizeHistory(history, systemPrompt) {
    if (history.length < 3) return null; // Don't summarize short conversations
    
    try {
        const conversationText = history.slice(0, -1) // Exclude current prompt
            .map(msg => `${msg.role}: ${msg.content}`)
            .join('\n');
        
        const prompt = `Summarize this conversation in 2-3 points while preserving key details:\n\n${conversationText}`;
        
        // Switch to summarizer persona temporarily
        const originalPrompt = systemPrompt;
        systemPrompt = PERSONAS.summarizer;
        
        const messages = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt }
        ];
        
        // Call OpenRouter API (implementation depends on your actual API calls)
        const response = await fetch(`${OPENROUTER_API_BASE}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                messages,
                model: 'gpt-3.5-turbo',
                max_tokens: 200
            })
        });

        const data = await response.json();
        return data.choices?.[0]?.message?.content || null;
    } catch (error) {
        console.error('Error summarizing history:', error);
        return null;
    }
}

/**
 * Placeholder for MD5 hashing function.
 * In a real Cloudflare Worker, you might use the SubtleCrypto API.
 * For simplicity here, we'll just return the input prefixed.
 * Replace with a proper implementation if needed.
 * @param {string} input
 * @returns {string}
 */
function md5Hash(input) {
    console.warn("Using placeholder md5Hash function.");
    return `hashed_${input}`;
}

/**
 * Placeholder for Google Search API call.
 * @param {string} query
 * @param {Environment} env
 * @returns {Promise<Array<{title: string, link: string, snippet: string}>>} Processed search results.
 */
async function googleSearch(query, env) {
    console.log(`Performing Google Search for: ${query}`);
    const url = `https://www.googleapis.com/customsearch/v1?key=${env.GOOGLE_API_KEY}&cx=${env.GOOGLE_CX}&q=${encodeURIComponent(query)}&num=5`;

    const response = await fetch(url);
    if (!response.ok) {
        const errorBody = await response.text();
        console.error(`Google Search API Error (${response.status}): ${errorBody}`);
        throw new Error(`Google Search API failed with status ${response.status}`);
    }
    const data = await response.json();

    if (!data.items || data.items.length === 0) {
        return [];
    }

    return data.items.map(item => ({
        title: item.title,
        link: item.link,
        snippet: item.snippet,
    }));
}

/**
 * Placeholder for Bing Search API call.
 * @param {string} query
 * @param {Environment} env
 * @returns {Promise<Array<{title: string, link: string, snippet: string}>>} Processed search results.
 */
async function bingSearch(query, env) {
    console.log(`Performing Bing Search for: ${query}`);
    const url = `https://api.bing.microsoft.com/v7.0/search?q=${encodeURIComponent(query)}&count=5`;

    const response = await fetch(url, {
        headers: { 'Ocp-Apim-Subscription-Key': env.BING_API_KEY }
    });

    if (!response.ok) {
        const errorBody = await response.text();
        console.error(`Bing Search API Error (${response.status}): ${errorBody}`);
        throw new Error(`Bing Search API failed with status ${response.status}`);
    }
    const data = await response.json();

    if (!data.webPages || !data.webPages.value || data.webPages.value.length === 0) {
        return [];
    }

    return data.webPages.value.map(item => ({
        title: item.name,
        link: item.url,
        snippet: item.snippet,
    }));
}

/**
 * Retrieves cached search results if available and not expired.
 * @param {string} query - The search query.
 * @param {Environment} env - Worker environment.
 * @returns {Promise<object | null>} Cached results or null.
 */
async function getCachedSearch(query, env) {
    if (!env.CACHE) {
        console.warn("CACHE KV namespace not bound. Skipping cache check.");
        return null;
    }
    const cacheKey = `search:${md5Hash(query)}`;
    try {
        const cached = await env.CACHE.get(cacheKey, { type: 'json' });
        return cached;
    } catch (e) {
        console.error(`Cache get error for key ${cacheKey}:`, e);
        return null;
    }
}

/**
 * Stores search results in the cache.
 * @param {string} query - The search query.
 * @param {object} results - The search results object to cache.
 * @param {Environment} env - Worker environment.
 * @returns {Promise<void>}
 */
async function setCachedSearch(query, results, env) {
    if (!env.CACHE) {
        console.warn("CACHE KV namespace not bound. Skipping cache set.");
        return;
    }
    const cacheKey = `search:${md5Hash(query)}`;
    try {
        await env.CACHE.put(cacheKey, JSON.stringify(results), { expirationTtl: CACHE_TTL });
    } catch (e) {
        console.error(`Cache put error for key ${cacheKey}:`, e);
    }
}

/**
 * Performs a web search, attempting Google first and falling back to Bing.
 * Caches results.
 * @param {string} query - The search query.
 * @param {Environment} env - Worker environment.
 * @returns {Promise<Array<{title: string, link: string, snippet: string}>>} Search results.
 */
async function searchWithFallback(query, env) {
    const cachedResults = await getCachedSearch(query, env);
    if (cachedResults) {
        console.log(`Cache hit for query: ${query}`);
        return cachedResults;
    }
    console.log(`Cache miss for query: ${query}`);

    try {
        if (!env.GOOGLE_API_KEY || !env.GOOGLE_CX) {
            throw new Error("Google API Key or CX not configured.");
        }
        const googleResults = await googleSearch(query, env);
        await setCachedSearch(query, googleResults, env);
        return googleResults;
    } catch (error) {
        console.warn('Google Search failed:', error.message);
        try {
            if (!env.BING_API_KEY) {
                throw new Error("Bing API Key not configured for fallback.");
            }
            console.log('Attempting Bing search as fallback...');
            const bingResults = await bingSearch(query, env);
            await setCachedSearch(query, bingResults, env);
            return bingResults;
        } catch (fallbackError) {
            console.error('Fallback Bing Search also failed:', fallbackError.message);
            throw new Error('Both primary and fallback search providers failed.');
        }
    }
}

/**
 * Migrates user data from an old key format/structure to a new one.
 * Example: Adds a default model setting.
 * NOTE: This function needs to be triggered manually during a migration process.
 * @param {string} oldKey - The old KV key (e.g., `user_${userId}`).
 * @param {string} newKey - The new KV key (could be the same if only structure changes).
 * @param {Environment} env - Worker environment.
 * @returns {Promise<void>}
 */
async function migrateUserData(oldKey, newKey, env) {
    try {
        const oldDataString = await env.USER_DATA.get(oldKey);
        if (!oldDataString) {
            console.log(`No old data found for key: ${oldKey}. Skipping migration.`);
            return;
        }

        let oldData;
        try {
            oldData = JSON.parse(oldDataString);
        } catch (parseError) {
            console.error(`Failed to parse old data for key ${oldKey}:`, parseError);
            return;
        }

        const newData = {
            ...oldData,
            settings: {
                ...(oldData.settings || {}),
                model: oldData.settings?.model || "anthropic/claude-3-sonnet",
            },
        };

        await env.USER_DATA.put(newKey, JSON.stringify(newData));
        console.log(`Successfully migrated data from ${oldKey} to ${newKey}`);
    } catch (error) {
        console.error(`Error migrating user data for key ${oldKey}:`, error);
    }
}

/**
 * Calculates the Levenshtein distance between two strings.
 * @param {string} s1 First string.
 * @param {string} s2 Second string.
 * @returns {number} The Levenshtein distance.
 */
function levenshteinDistance(s1, s2) {
    s1 = s1.toLowerCase();
    s2 = s2.toLowerCase();

    const costs = [];
    for (let i = 0; i <= s1.length; i++) {
        let lastValue = i;
        for (let j = 0; j <= s2.length; j++) {
            if (i === 0) {
                costs[j] = j;
            } else {
                if (j > 0) {
                    let newValue = costs[j - 1];
                    if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
                        newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
                    }
                    costs[j - 1] = lastValue;
                    lastValue = newValue;
                }
            }
        }
        if (i > 0) costs[s2.length] = lastValue;
    }
    return costs[s2.length];
}

/**
 * Detects the intended command, allowing for typos (max distance 2).
 * @param {string} input - The user's input text (potentially starting with /).
 * @returns {string | null} The detected command name (without /) or null if no close match.
 */
function detectCommand(input) {
    const commands = ['start', 'setkey', 'changemodel', 'setsystemprompt', 'resetsettings', 'ask', 'help', 'newchat', 'search', 'setlang', 'setpersona', 'togglesearch', 'managetoken'];
    if (!input || !input.startsWith('/')) {
        return null;
    }
    const inputCmd = input.split(' ')[0].substring(1).toLowerCase();
    if (!inputCmd) return null;

    if (commands.includes(inputCmd)) {
        return inputCmd;
    }

    let bestMatch = null;
    let minDistance = 3;

    for (const cmd of commands) {
        const distance = levenshteinDistance(cmd, inputCmd);
        if (distance < minDistance) {
            minDistance = distance;
            bestMatch = cmd;
        }
    }
    return minDistance <= 2 ? bestMatch : null;
}

/**
 * Gets the appropriate translation string.
 * @param {string} lang - Language code ('en' or 'id').
 * @param {string} key - The key for the translation string.
 * @param {Record<string, string>} [replacements] - Optional replacements for placeholders like {placeholder}.
 * @returns {string} The translated string.
 */
function t(lang, key, replacements = {}) {
    const locale = LOCALES[lang] || LOCALES['en'];
    let text = locale[key] || en[key] || `Missing translation: ${key}`;
    for (const placeholder in replacements) {
        text = text.replace(`{${placeholder}}`, replacements[placeholder]);
    }
    return text;
}

/**
 * Creates the inline keyboard markup for model selection pagination.
 * @param {Array<{id: string, name: string}>} models - The full list of models.
 * @param {number} page - The current page number (1-based).
 * @param {string} lang - The language code for button text.
 * @returns {object} The inline keyboard markup object.
 */
function createModelKeyboard(models, page, lang) {
    const modelsPerPage = 5;
    const startIndex = (page - 1) * modelsPerPage;
    const endIndex = startIndex + modelsPerPage;
    const pageModels = models.slice(startIndex, endIndex);
    const totalPages = Math.ceil(models.length / modelsPerPage);

    const keyboard = pageModels.map(model => ([
        { text: model.id, callback_data: `setmodel_${model.id}` }
    ]));

    const navigationRow = [];
    if (page > 1) {
        navigationRow.push({ text: `⬅️ ${t(lang, 'pagination_back')}`, callback_data: `modelpage_${page - 1}` });
    }
    if (page < totalPages) {
        navigationRow.push({ text: `${t(lang, 'pagination_next')} ➡️`, callback_data: `modelpage_${page + 1}` });
    }

    if (navigationRow.length > 0) {
        keyboard.push(navigationRow);
    }

    return { inline_keyboard: keyboard };
}

/**
 * Creates the inline keyboard markup for search toggle.
 * @param {boolean} isEnabled - Current search enabled status.
 * @param {string} lang - The language code for button text.
 * @returns {object} The inline keyboard markup object.
 */
function createSearchToggleKeyboard(isEnabled, lang) {
    const keyboard = [
        [
            { 
                text: isEnabled 
                    ? `🔴 ${t(lang, 'search_toggle_disable')}` 
                    : `🟢 ${t(lang, 'search_toggle_enable')}`,
                callback_data: isEnabled ? 'togglesearch_off' : 'togglesearch_on'
            }
        ]
    ];
    return { inline_keyboard: keyboard };
}

/**
 * Creates the inline keyboard markup for token management.
 * @param {string} lang - The language code for button text.
 * @returns {object} The inline keyboard markup object.
 */
function createTokenManagementKeyboard(lang) {
    const keyboard = [
        [
            { 
                text: `🔴 ${t(lang, 'token_revoke')}`,
                callback_data: 'revoketoken'
            }
        ]
    ];
    return { inline_keyboard: keyboard };
}

/**
 * Creates the inline keyboard markup for persona selection.
 * @param {string} lang - The language code for button text.
 * @returns {object} The inline keyboard markup object.
 */
function createPersonaKeyboard(lang) {
    const keyboard = Object.entries(PERSONAS).map(([name, _]) => [
        { 
            text: name,
            callback_data: `setpersona_${name}`
        }
    ]);
    return { inline_keyboard: keyboard };
}

/**
 * Creates the inline keyboard markup for language selection.
 * @param {string} currentLang - The current language code ('en' or 'id').
 * @returns {object} The inline keyboard markup object.
 */
function createLanguageKeyboard(currentLang) {
    const keyboard = [
        [
            { 
                text: `English ${currentLang === 'en' ? '✅' : ''}`,
                callback_data: 'setlang_en'
            },
            { 
                text: `Bahasa ${currentLang === 'id' ? '✅' : ''}`,
                callback_data: 'setlang_id'
            }
        ]
    ];
    return { inline_keyboard: keyboard };
}

/**
 * Answers a Telegram callback query.
 * @param {Environment} env - Worker environment.
 * @param {string} callbackQueryId - The ID of the callback query to answer.
 * @param {string} [text] - Optional text to show as a notification.
 * @returns {Promise<Response>}
 */
async function answerCallbackQuery(env, callbackQueryId, text) {
    const url = `${TELEGRAM_API_BASE}${env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`;
    const payload = {
        callback_query_id: callbackQueryId,
        ...(text && { text: text }),
    };
    return fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
}

/**
 * Sends a message using the Telegram Bot API.
 * @param {Environment} env - Worker environment.
 * @param {number} chatId - The chat ID to send the message to.
 * @param {string} text - The message text.
 * @param {object} [extraParams={}] - Additional parameters for the sendMessage API call.
 * @returns {Promise<Response>}
 */
async function sendMessage(env, chatId, text, extraParams = {}) {
    const url = `${TELEGRAM_API_BASE}${env.TELEGRAM_BOT_TOKEN}/sendMessage`;
    const payload = {
        chat_id: chatId,
        text: text,
        parse_mode: 'Markdown',
        ...extraParams,
    };
    return fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
}

/**
 * Edits an existing message using the Telegram Bot API.
 * @param {Environment} env - Worker environment.
 * @param {number} chatId - The chat ID of the message.
 * @param {number} messageId - The ID of the message to edit.
 * @param {string} text - The new message text.
 * @param {object} [extraParams={}] - Additional parameters for the editMessageText API call.
 * @returns {Promise<Response>}
 */
async function editMessageText(env, chatId, messageId, text, extraParams = {}) {
    const url = `${TELEGRAM_API_BASE}${env.TELEGRAM_BOT_TOKEN}/editMessageText`;
    const payload = {
        chat_id: chatId,
        message_id: messageId,
        text: text,
        parse_mode: 'Markdown',
        ...extraParams,
    };
    return fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
}

/**
 * Retrieves user settings from KV.
 * @param {Environment} env - Worker environment.
 * @param {number} userId - The Telegram user ID.
 * @returns {Promise<UserSettings>} User settings object.
 */
async function getUserSettings(env, userId) {
    const defaultSettings = {
        language: env.DEFAULT_LANGUAGE === 'id' ? 'id' : 'en',
        model: env.DEFAULT_MODEL || 'openai/gpt-3.5-turbo',
        systemPrompt: env.DEFAULT_SYSTEM_PROMPT || 'You are a helpful assistant.',
        history: [],
        lastSearchQuery: undefined,
        lastSearchTimestamp: undefined,
        searchEnabled: true
    };
    try {
        const storedSettings = await env.USER_DATA.get(`user_${userId}`, { type: 'json' });
        const history = Array.isArray(storedSettings?.history) ? storedSettings.history : [];
        return { ...defaultSettings, ...storedSettings, history };
    } catch (e) {
        console.error(`KV get error for user ${userId}:`, e);
        return defaultSettings;
    }
}

/**
 * Saves user settings to KV.
 * @param {Environment} env - Worker environment.
 * @param {number} userId - The Telegram user ID.
 * @param {UserSettings} settings - The settings object to save.
 * @returns {Promise<void>}
 */
async function setUserSettings(env, userId, settings) {
    try {
        await env.USER_DATA.put(`user_${userId}`, JSON.stringify(settings));
    } catch (e) {
        console.error(`KV put error for user ${userId}:`, e);
    }
}

/**
 * Checks if a user is authorized based on the ALLOWED_USER_IDS environment variable.
 * @param {Environment} env - Worker environment.
 * @param {number} userId - The Telegram user ID.
 * @returns {boolean} True if authorized, false otherwise.
 */
function isUserAuthorized(env, userId) {
    if (!env.ALLOWED_USER_IDS) {
        return true;
    }
    const allowedIds = env.ALLOWED_USER_IDS.split(',').map((id) => id.trim());
    return allowedIds.includes(String(userId));
}

/**
 * Verifies an OpenRouter API key by making a simple request.
 * @param {string} apiKey - The OpenRouter API key to verify.
 * @returns {Promise<boolean>} True if the key is valid, false otherwise.
 */
async function verifyOpenRouterKey(apiKey) {
    try {
        const response = await fetch(`${OPENROUTER_API_BASE}/auth/key`, {
            headers: { Authorization: `Bearer ${apiKey}` },
        });
        return response.ok;
    } catch (error) {
        console.error('Error verifying OpenRouter key:', error);
        return false;
    }
}

/**
 * Checks if a model ID is valid by trying to fetch its details (requires a valid key).
 * @param {string} apiKey - A valid OpenRouter API key (user's or bot's).
 * @param {string} modelId - The model ID to check.
 * @returns {Promise<boolean>} True if the model exists, false otherwise.
 */
async function checkOpenRouterModel(apiKey, modelId) {
    if (!apiKey) return false;
    try {
        const encodedModelId = encodeURIComponent(modelId);
        const checkUrl = `${OPENROUTER_API_BASE}/models/${encodedModelId}`;
        console.log(`Checking model URL: ${checkUrl}`);
        const response = await fetch(checkUrl, {
            headers: { Authorization: `Bearer ${apiKey}` },
        });
        console.log(`Model check response status for ${modelId}: ${response.status}`);
        if (!response.ok) {
            const errorBody = await response.text().catch(() => 'Could not read error body');
            console.error(`Model check failed for ${modelId}: ${errorBody}`);
        }
        return response.ok;
    } catch (error) {
        console.error(`Error checking OpenRouter model ${modelId}:`, error);
        return false;
    }
}

/**
 * Fetches the list of models from OpenRouter.
 * Requires a valid API key.
 * @param {string} apiKey - A valid OpenRouter API key.
 * @returns {Promise<Array<{id: string, name: string}>>} A list of models.
 */
async function getOpenRouterModels(apiKey) {
    if (!apiKey) {
        throw new Error("API key is required to fetch models.");
    }
    const url = `${OPENROUTER_API_BASE}/models`;
    try {
        const response = await fetch(url, {
            headers: { Authorization: `Bearer ${apiKey}` },
        });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error('OpenRouter Models API Error:', response.status, errorData);
            throw new Error(`Failed to fetch models (Status: ${response.status})`);
        }
        const data = await response.json();
        console.log(`Fetched ${data?.data?.length || 0} models from OpenRouter.`);
        return data.data || [];
    } catch (error) {
        console.error('Error fetching OpenRouter models:', error);
        throw error;
    }
}

/**
 * Streams chat completions from OpenRouter to Telegram.
 * @param {Environment} env - Worker environment.
 * @param {number} chatId - Telegram chat ID.
 * @param {number} messageId - Telegram message ID of the "Thinking..." message.
 * @param {UserSettings} settings - User settings including API key, model, system prompt, and history.
 * @param {string} userPrompt - The user's question/prompt.
 * @param {number} userId - The user's ID to save settings back.
 */
async function streamChatCompletion(env, chatId, messageId, settings, userPrompt, userId) {
    const { apiKey, model, systemPrompt, history = [] } = settings;
    const lang = settings.language || 'en';
    const MAX_HISTORY_MESSAGES = 10; // Increased to allow longer conversation context

    if (!apiKey) {
        await editMessageText(env, chatId, messageId, t(lang, 'key_required'));
        return;
    }

    try {
        const messagesPayload = [
            { role: 'system', content: systemPrompt },
            ...history.slice(-MAX_HISTORY_MESSAGES),
            { role: 'user', content: userPrompt },
        ];
        const payloadForLog = {
            model: model,
            messages: messagesPayload,
            stream: true,
        };
        console.log(`OpenRouter Request Payload for chat ${chatId}:\n${JSON.stringify(payloadForLog, null, 2)}`);

        const response = await fetch(`${OPENROUTER_API_BASE}/chat/completions`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'https://github.com/username/telegram-openrouter-bot',
                'X-Title': 'Telegram OpenRouter Bot',
            },
            body: JSON.stringify(payloadForLog),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error('OpenRouter API Error:', response.status, errorData);
            await editMessageText(env, chatId, messageId, `${t(lang, 'ask_error')} (Status: ${response.status})`);
            return;
        }

        if (!response.body) {
            throw new Error('Response body is null');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let currentMessage = '';
        let lastUpdateTime = 0;
        const updateInterval = 1500;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            let lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const dataContent = line.substring(6).trim();
                    if (dataContent === '[DONE]') {
                        break;
                    }
                    try {
                        const chunk = JSON.parse(dataContent);
                        if (chunk.choices && chunk.choices[0]?.delta?.content) {
                            currentMessage += chunk.choices[0].delta.content;

                            const now = Date.now();
                            if (now - lastUpdateTime > updateInterval) {
                                const currentTelegramMessage = await env.USER_DATA.get(`msg_${messageId}`);
                                if (currentMessage.trim() && currentMessage !== currentTelegramMessage) {
                                    await editMessageText(env, chatId, messageId, currentMessage);
                                    await env.USER_DATA.put(`msg_${messageId}`, currentMessage, { expirationTtl: 300 });
                                    lastUpdateTime = now;
                                }
                            }
                        }
                    } catch (e) {
                        console.error('Error parsing stream chunk:', e, 'Data:', dataContent);
                    }
                }
            }
        }

        const finalMessage = currentMessage.trim();
        if (finalMessage) {
            await editMessageText(env, chatId, messageId, finalMessage);

            const newHistory = [
                ...history,
                { role: 'user', content: userPrompt },
                { role: 'assistant', content: finalMessage }
            ].slice(-MAX_HISTORY_MESSAGES);

            const updatedSettings = { ...settings, history: newHistory };
            await setUserSettings(env, userId, updatedSettings);

        } else {
            await editMessageText(env, chatId, messageId, t(lang, 'ask_error') + " (No content received)");
        }
        await env.USER_DATA.delete(`msg_${messageId}`);

    } catch (error) {
        console.error('Error streaming chat completion:', error);
        await editMessageText(env, chatId, messageId, t(lang, 'ask_error'));
        await env.USER_DATA.delete(`msg_${messageId}`);
    }
}

// --- Main Fetch Handler ---

/**
 * Gets dashboard data including metrics and status
 * @param {Environment} env - Worker environment
 * @returns {Promise<object>} Dashboard data
 */
async function getDashboardData(env) {
    try {
        // Get basic metrics from KV
        const metrics = {
            activeUsers: await env.USER_DATA.get('metrics:active_users') || 0,
            dailyRequests: await env.USER_DATA.get('metrics:daily_requests') || 0,
            errorRate: await env.USER_DATA.get('metrics:error_rate') || 0,
            popularModels: JSON.parse(await env.USER_DATA.get('metrics:popular_models') || '{}')
        };

        return {
            botStatus: 'Online',
            defaultModel: env.DEFAULT_MODEL || 'openai/gpt-3.5-turbo',
            defaultLanguage: env.DEFAULT_LANGUAGE || 'en',
            metrics,
            timestamp: Date.now()
        };
    } catch (error) {
        console.error('Error getting dashboard data:', error);
        return {
            botStatus: 'Error',
            defaultModel: 'N/A',
            defaultLanguage: 'N/A',
            metrics: {},
            timestamp: Date.now()
        };
    }
}

// WebSocket connections map
const activeConnections = new Map();

export default {
    /**
     * Handle WebSocket upgrades
     */
    async websocket(conn, env, ctx) {
        const id = crypto.randomUUID();
        activeConnections.set(id, conn);
        
        conn.accept();
        conn.addEventListener('message', async (msg) => {
            // Handle incoming messages
            try {
                const data = JSON.parse(msg.data);
                if (data.type === 'subscribe') {
                    // Send initial dashboard data
                    const dashboardData = await getDashboardData(env);
                    conn.send(JSON.stringify({
                        type: 'data',
                        data: dashboardData
                    }));
                }
            } catch (e) {
                console.error('WebSocket message error:', e);
            }
        });

        conn.addEventListener('close', () => {
            activeConnections.delete(id);
        });
    },

    /**
     * @param {Request} request
     * @param {Environment} env
     * @param {ExecutionContext} ctx
     * @returns {Promise<Response>}
     */
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        
        // Only handle API requests
        if (request.method === 'OPTIONS') {
            return new Response(null, {
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type',
                }
            });
        }

        try {
            const update = await request.json();
            if (!update) {
                return new Response('Invalid request', { status: 400 });
            }

            if (update.callback_query) {
                const callbackQuery = update.callback_query;
                const userId = callbackQuery.from.id;
                const chatId = callbackQuery.message.chat.id;
                const messageId = callbackQuery.message.message_id;
                const data = callbackQuery.data;

                const userSettings = await getUserSettings(env, userId);
                const lang = userSettings.language;

                if (data.startsWith('modelpage_')) {
                    const page = parseInt(data.split('_')[1], 10);
                    try {
                        const models = await getOpenRouterModels(userSettings.apiKey);
                        if (models && models.length > 0) {
                            const keyboard = createModelKeyboard(models, page, lang);
                            await editMessageText(env, chatId, messageId, t(lang, 'change_model_prompt'), { reply_markup: keyboard });
                        } else {
                            await editMessageText(env, chatId, messageId, t(lang, 'models_list_error_nodata'));
                        }
                        await answerCallbackQuery(env, callbackQuery.id);
                    } catch (error) {
                        console.error("Error handling model page callback:", error);
                        await answerCallbackQuery(env, callbackQuery.id, t(lang, 'models_list_error_generic'));
                    }
                } else if (data.startsWith('setmodel_')) {
                    const modelId = data.substring('setmodel_'.length);
                    userSettings.model = modelId;
                    await setUserSettings(env, userId, userSettings);

                    ctx.waitUntil(fetch(`${TELEGRAM_API_BASE}${env.TELEGRAM_BOT_TOKEN}/deleteMessage`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ chat_id: chatId, message_id: messageId }),
                    }).catch(e => console.error("Failed to delete model selection message:", e)));

                    await sendMessage(env, chatId, t(lang, 'model_set_success', { model: modelId }));
                    await answerCallbackQuery(env, callbackQuery.id);
                } else if (data === 'togglesearch_on') {
                    userSettings.searchEnabled = true;
                    await setUserSettings(env, userId, userSettings);
                    await editMessageText(env, chatId, messageId, t(lang, 'search_toggle_success', { status: t(lang, 'search_toggle_enabled') }));
                    await answerCallbackQuery(env, callbackQuery.id);
                } else if (data === 'togglesearch_off') {
                    userSettings.searchEnabled = false;
                    await setUserSettings(env, userId, userSettings);
                    await editMessageText(env, chatId, messageId, t(lang, 'search_toggle_success', { status: t(lang, 'search_toggle_disabled') }));
                    await answerCallbackQuery(env, callbackQuery.id);
                } else if (data === 'revoketoken') {
                    userSettings.apiKey = undefined;
                    await setUserSettings(env, userId, userSettings);
                    await editMessageText(env, chatId, messageId, t(lang, 'token_revoked'));
                    await answerCallbackQuery(env, callbackQuery.id);
                } else if (data === 'checktoken') {
                    // Validate token status
                    const isValid = await verifyOpenRouterKey(userSettings.apiKey, userSettings);
                    const status = isValid ? t(lang, 'token_status_active') : t(lang, 'token_status_invalid');
                    await editMessageText(env, chatId, messageId, t(lang, 'token_status_result', {status}));
                    await answerCallbackQuery(env, callbackQuery.id);
                } else if (data.startsWith('setpersona_')) {
                    const personaName = data.substring('setpersona_'.length);
                    if (PERSONAS[personaName]) {
                        userSettings.systemPrompt = PERSONAS[personaName];
                        await setUserSettings(env, userId, userSettings);
                        await editMessageText(env, chatId, messageId, t(lang, 'persona_set_success', { persona: personaName }));
                        await answerCallbackQuery(env, callbackQuery.id);
                    }
                } else {
                    await answerCallbackQuery(env, callbackQuery.id, t(lang, 'generic_error'));
                }

                return new Response('OK');
            }

            if (!update.message) {
                return new Response('OK');
            }

            const message = update.message;
            const chatId = message.chat.id;
            const userId = message.from.id;
            const text = message.text || '';

            if (!isUserAuthorized(env, userId)) {
                await sendMessage(env, chatId, t('en', 'unauthorized'));
                const defaultLang = env.DEFAULT_LANGUAGE === 'id' ? 'id' : 'en';
                await sendMessage(env, chatId, t(defaultLang, 'unauthorized'));
                return new Response('Unauthorized', { status: 403 });
            }

            const userSettings = await getUserSettings(env, userId);
            const lang = userSettings.language;

            const detectedCommand = detectCommand(text);

            if (detectedCommand) {
                const commandArgs = text.split(' ').slice(1);
                const argString = commandArgs.join(' ');

                switch (detectedCommand) {
                    case 'start': {
                        if (userSettings.apiKey) {
                            await sendMessage(env, chatId, t(lang, 'start_welcome_authorized', { model: userSettings.model, systemPrompt: userSettings.systemPrompt }));
                        } else {
                            await sendMessage(env, chatId, t(lang, 'start_welcome'));
                        }
                        break;
                    }
                    case 'setkey': {
                        const apiKey = argString.trim();
                        if (!apiKey) {
                            await sendMessage(env, chatId, t(lang, 'key_set_invalid'));
                            break;
                        }
                        const isValid = await verifyOpenRouterKey(apiKey);
                        if (isValid) {
                            userSettings.apiKey = apiKey;
                            await setUserSettings(env, userId, userSettings);
                            await sendMessage(env, chatId, t(lang, 'key_set_success'));
                        } else {
                            await sendMessage(env, chatId, t(lang, 'key_verification_failed'));
                        }
                        break;
                    }
                    case 'changemodel': {
                        if (!userSettings.apiKey) {
                            await sendMessage(env, chatId, t(lang, 'key_required'));
                            break;
                        }
                        await sendMessage(env, chatId, t(lang, 'models_list_fetching'));
                        try {
                            const models = await getOpenRouterModels(userSettings.apiKey);
                            if (models && models.length > 0) {
                                const keyboard = createModelKeyboard(models, 1, lang);
                                await sendMessage(env, chatId, t(lang, 'change_model_prompt'), { reply_markup: keyboard });
                            } else {
                                await sendMessage(env, chatId, t(lang, 'models_list_error_nodata'));
                            }
                        } catch (error) {
                            console.error('Error handling /changemodel:', error);
                            await sendMessage(env, chatId, t(lang, 'models_list_error_generic'));
                        }
                        break;
                    }
                    case 'setsystemprompt': {
                        const prompt = argString.trim();
                        if (prompt) {
                            userSettings.systemPrompt = prompt;
                            await setUserSettings(env, userId, userSettings);
                            await sendMessage(env, chatId, t(lang, 'system_prompt_set_success'));
                        } else {
                            userSettings.systemPrompt = env.DEFAULT_SYSTEM_PROMPT || 'You are a helpful assistant.';
                            await setUserSettings(env, userId, userSettings);
                            await sendMessage(env, chatId, t(lang, 'system_prompt_reset_success'));
                        }
                        break;
                    }
                    case 'resetsettings': {
                        const newSettings = { language: userSettings.language };
                        await setUserSettings(env, userId, newSettings);
                        await sendMessage(env, chatId, t(lang, 'settings_reset_success'));
                        break;
                    }
                    case 'ask': {
                        const question = argString.trim();
                        if (!question) {
                            await sendMessage(env, chatId, t(lang, 'ask_invalid'));
                            break;
                        }
                        if (!userSettings.apiKey) {
                            await sendMessage(env, chatId, t(lang, 'key_required'));
                            break;
                        }

                        // Check if asking to summarize last search
                        if (question.toLowerCase().includes('ringkas')) {
                            const lastSearch = await env.CACHE.get(`user_${userId}_last_search`, { type: 'json' });
                            if (lastSearch?.results?.length > 0) {
                                const thinkingMessage = await sendMessage(env, chatId, t(lang, 'summary_thinking'));
                                if (!thinkingMessage.ok) {
                                    console.error("Failed to send 'Summarizing...' message");
                                    await sendMessage(env, chatId, t(lang, 'generic_error'));
                                    break;
                                }
                                const thinkingMessageData = await thinkingMessage.json();
                                const thinkingMessageId = thinkingMessageData.result.message_id;

                                const summaryPrompt = `Ringkas hasil pencarian terakhir tentang "${lastSearch.query}" dalam 3 poin utama:\n\n` +
                                    JSON.stringify(lastSearch.results.map(r => r.snippet));
                                
                                ctx.waitUntil(streamChatCompletion(env, chatId, thinkingMessageId, userSettings, summaryPrompt, userId));
                                break;
                            } else {
                                await sendMessage(env, chatId, t(lang, 'summary_no_results'));
                                break;
                            }
                        }

                        // Normal question handling
                        const thinkingMessage = await sendMessage(env, chatId, t(lang, 'ask_thinking'));
                        if (!thinkingMessage.ok) {
                            console.error("Failed to send 'Thinking...' message");
                            await sendMessage(env, chatId, t(lang, 'generic_error'));
                            break;
                        }
                        const thinkingMessageData = await thinkingMessage.json();
                        const thinkingMessageId = thinkingMessageData.result.message_id;

                        // Check if question relates to last search
                        let finalQuestion = question;
                        if (userSettings.lastSearchQuery && 
                            userSettings.lastSearchTimestamp &&
                            Date.now() - userSettings.lastSearchTimestamp < 3600000 && // Within 1 hour
                            (question.toLowerCase().includes('tentang') || 
                             question.toLowerCase().includes('about') ||
                             question.toLowerCase().includes('hasil') ||
                             question.toLowerCase().includes('result'))) {
                            
                            finalQuestion = `Berdasarkan pencarian terakhir tentang "${userSettings.lastSearchQuery}": ${question}`;
                        }

                        ctx.waitUntil(streamChatCompletion(env, chatId, thinkingMessageId, userSettings, finalQuestion, userId));
                        break;
                    }
                    case 'newchat': {
                        userSettings.history = [];
                        await setUserSettings(env, userId, userSettings);
                        await sendMessage(env, chatId, t(lang, 'new_chat_success'));
                        break;
                    }
                    case 'search': {
                        const searchQuery = argString.trim();
                        if (!searchQuery) {
                            await sendMessage(env, chatId, t(lang, 'search_invalid'));
                            break;
                        }
                        if (!userSettings.searchEnabled) {
                            await sendMessage(env, chatId, t(lang, 'search_toggle_disabled'));
                            break;
                        }
                        if (!env.GOOGLE_API_KEY || !env.GOOGLE_CX) {
                            await sendMessage(env, chatId, t(lang, 'search_keys_missing'));
                            break;
                        }

                        const thinkingMessage = await sendMessage(env, chatId, t(lang, 'search_thinking'));
                        if (!thinkingMessage.ok) {
                            console.error("Failed to send 'Searching...' message");
                            await sendMessage(env, chatId, t(lang, 'generic_error'));
                            break;
                        }
                        const thinkingMessageData = await thinkingMessage.json();
                        const thinkingMessageId = thinkingMessageData.result.message_id;

                        try {
                            const results = await searchWithFallback(searchQuery, env);
                            let responseText = t(lang, 'search_results_title', { query: searchQuery }) + "\n\n";
                            if (results && results.length > 0) {
                                results.forEach((item, index) => {
                                    responseText += `${index + 1}. *${item.title}*\n[${item.link}](${item.link})\n_${item.snippet}_\n\n`;
                                });
                            } else {
                                responseText = t(lang, 'search_no_results', { query: searchQuery });
                            }
                            // Save search results to KV
                            // Save search results to KV and update user settings
                            await env.CACHE.put(
                                `user_${userId}_last_search`, 
                                JSON.stringify({
                                    query: searchQuery,
                                    results: results,
                                    timestamp: Date.now()
                                }),
                                { expirationTtl: 3600 } // 1 hour expiry
                            );
                            
                            // Update user settings with search context
                            userSettings.lastSearchQuery = searchQuery;
                            userSettings.lastSearchTimestamp = Date.now();
                            await setUserSettings(env, userId, userSettings);
                            
                            await editMessageText(env, chatId, thinkingMessageId, responseText, { disable_web_page_preview: true });

                        } catch (error) {
                            console.error('Search command error:', error);
                            await editMessageText(env, chatId, thinkingMessageId, t(lang, 'search_error'));
                        }
                        break;
                    }
                    case 'setlang': {
                        const targetLang = argString.trim().toLowerCase();
                        if (targetLang === 'en' || targetLang === 'id') {
                            userSettings.language = targetLang;
                            await setUserSettings(env, userId, userSettings);
                            await sendMessage(env, chatId, t(targetLang, 'lang_set_success', { lang: targetLang === 'en' ? 'English' : 'Bahasa Indonesia' }));
                        } else if (!targetLang) {
                            const keyboard = createLanguageKeyboard(lang);
                            await sendMessage(env, chatId, t(lang, 'lang_select_prompt'), { reply_markup: keyboard });
                        } else {
                            const keyboard = createLanguageKeyboard(lang);
                            await sendMessage(env, chatId, t(lang, 'lang_set_invalid'), { reply_markup: keyboard });
                        }
                        break;
                    }
                    case 'setpersona': {
                        const personaName = argString.trim().toLowerCase();
                        const availablePersonas = Object.keys(PERSONAS);

                        if (!personaName) {
                            const keyboard = createPersonaKeyboard(lang);
                            await sendMessage(env, chatId, t(lang, 'persona_select_prompt'), { reply_markup: keyboard });
                        } else if (PERSONAS[personaName]) {
                            userSettings.systemPrompt = PERSONAS[personaName];
                            await setUserSettings(env, userId, userSettings);
                            await sendMessage(env, chatId, t(lang, 'persona_set_success', { persona: personaName }));
                        } else {
                            const keyboard = createPersonaKeyboard(lang);
                            await sendMessage(env, chatId, t(lang, 'persona_set_invalid', { personas: availablePersonas.join(', ') }), { reply_markup: keyboard });
                        }
                        break;
                    }
                    case 'togglesearch': {
                        const statusText = t(lang, 'search_toggle_status', { 
                            status: t(lang, userSettings.searchEnabled ? 'search_toggle_enabled' : 'search_toggle_disabled') 
                        });
                        const keyboard = createSearchToggleKeyboard(userSettings.searchEnabled, lang);
                        await sendMessage(env, chatId, statusText, { reply_markup: keyboard });
                        break;
                    }
                    case 'managetoken': {
                        if (!userSettings.apiKey) {
                            await sendMessage(env, chatId, t(lang, 'key_required'));
                            break;
                        }
                        const keyboard = createTokenManagementKeyboard(lang);
                        await sendMessage(env, chatId, t(lang, 'token_management_prompt'), { reply_markup: keyboard });
                        break;
                    }
                    case 'help': {
                        const helpText = t(lang, 'help');
                        const settingsText = t(lang, 'current_settings', { 
                            model: userSettings.model, 
                            systemPrompt: userSettings.systemPrompt,
                            searchEnabled: userSettings.searchEnabled ? t(lang, 'search_toggle_enabled') : t(lang, 'search_toggle_disabled')
                        });
                        const fullMessage = helpText + '\n\n' + settingsText;
                        console.log(`Attempting to send help message to chat ${chatId}: ${fullMessage.substring(0, 200)}...`);
                        const response = await sendMessage(env, chatId, fullMessage);
                        if (!response.ok) {
                            console.error(`Failed to send help message: ${response.status} ${await response.text()}`);
                        } else {
                            console.log(`Successfully sent help message to chat ${chatId}`);
                        }
                        break;
                    }
                    default:
                        await sendMessage(env, chatId, t(lang, 'help'));
                        break;
                }
            }

            if (text.startsWith('/')) {
                if (!detectedCommand) {
                    await sendMessage(env, chatId, t(lang, 'help'));
                }
            } else if (text.trim().length > 0) {
                // Only process as question if user has API key set
                if (!userSettings.apiKey) {
                    await sendMessage(env, chatId, t(lang, 'key_required'));
                    return new Response('OK');
                }
                
                // Send initial "Thinking..." message
                const thinkingMessage = await sendMessage(env, chatId, t(lang, 'ask_thinking'));
                if (!thinkingMessage.ok) {
                    console.error("Failed to send 'Thinking...' message");
                    return new Response('OK');
                }
                
                // Process the question
                const thinkingMessageData = await thinkingMessage.json();
                const thinkingMessageId = thinkingMessageData.result.message_id;
                ctx.waitUntil(streamChatCompletion(env, chatId, thinkingMessageId, userSettings, text, userId));
            }

            return new Response('OK');
        } catch (error) {
            console.error('Error processing update:', error);
            return new Response('Error processing update', { status: 500 });
        }
    }
};
