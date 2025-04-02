import en from './locales/en.json';
import id from './locales/id.json';

// --- Interfaces (Optional but helpful for clarity) ---
/**
 * @typedef {object} Environment
 * @property {string} TELEGRAM_BOT_TOKEN - Telegram Bot Token (Secret)
 * @property {string} [ALLOWED_USER_IDS] - Comma-separated list of allowed Telegram User IDs (Variable)
 * @property {string} [DEFAULT_LANGUAGE] - Default language ('en' or 'id') (Variable)
 * @property {string} [DEFAULT_MODEL] - Default OpenRouter model ID (Variable)
 * @property {string} [DEFAULT_SYSTEM_PROMPT] - Default system prompt (Variable)
 * @property {KVNamespace} USER_DATA - KV Namespace for storing user settings (Binding)
 * @property {KVNamespace} CACHE - KV Namespace for caching search results (Binding)
 * @property {string} [OPENROUTER_API_KEY] - Optional: Bot's own OpenRouter key (Secret)
 * @property {string} [GOOGLE_API_KEY] - Google Search API Key (Secret) - Needed for web search
 * @property {string} [GOOGLE_CX] - Google Custom Search Engine ID (Secret) - Needed for web search
 * @property {string} [BING_API_KEY] - Bing Search API Key (Secret) - Needed for fallback search
 */

/**
 * @typedef {object} UserSettings
 * @property {string} [apiKey] - User's OpenRouter API Key
 * @property {string} [model] - User's selected model ID
 * @property {string} [systemPrompt] - User's custom system prompt
 * @property {string} [language] - User's preferred language ('en' or 'id')
 * @property {Array<{role: 'user' | 'assistant', content: string}>} [history] - Conversation history
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
 * Placeholder for MD5 hashing function.
 * In a real Cloudflare Worker, you might use the SubtleCrypto API.
 * For simplicity here, we'll just return the input prefixed.
 * Replace with a proper implementation if needed.
 * @param {string} input
 * @returns {string}
 */
function md5Hash(input) {
    // TODO: Replace with actual MD5 implementation using SubtleCrypto if required
    // Example: const digest = await crypto.subtle.digest('MD5', new TextEncoder().encode(input));
    //          return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
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
    const url = `https://www.googleapis.com/customsearch/v1?key=${env.GOOGLE_API_KEY}&cx=${env.GOOGLE_CX}&q=${encodeURIComponent(query)}&num=5`; // Get top 5 results

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

    // Process results into a standard format
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
    const url = `https://api.bing.microsoft.com/v7.0/search?q=${encodeURIComponent(query)}&count=5`; // Get top 5 results

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

    // Process results into a standard format
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
        return cached; // Returns the parsed JSON object or null if not found/expired
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
    // 1. Check cache
    const cachedResults = await getCachedSearch(query, env); // Cache stores the processed array
    if (cachedResults) {
        console.log(`Cache hit for query: ${query}`);
        return cachedResults;
    }
    console.log(`Cache miss for query: ${query}`);

    // 2. Try primary provider (Google)
    try {
        if (!env.GOOGLE_API_KEY || !env.GOOGLE_CX) {
            throw new Error("Google API Key or CX not configured.");
        }
        const googleResults = await googleSearch(query, env);
        // Cache the successful Google result
        await setCachedSearch(query, googleResults, env);
        return googleResults;
    } catch (error) {
        console.warn('Google Search failed:', error.message);
        // 3. Try fallback provider (Bing)
        try {
            if (!env.BING_API_KEY) {
                throw new Error("Bing API Key not configured for fallback.");
            }
            console.log('Attempting Bing search as fallback...');
            const bingResults = await bingSearch(query, env);
            // Cache the successful Bing result
            await setCachedSearch(query, bingResults, env);
            return bingResults;
        } catch (fallbackError) {
            console.error('Fallback Bing Search also failed:', fallbackError.message);
            throw new Error('Both primary and fallback search providers failed.'); // Re-throw or return a specific error object
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
            // Decide how to handle corrupted data: skip, delete, log?
            // For now, we'll skip.
            return;
        }

        // --- Transformation Logic ---
        // Example: Add a default model if missing
        const newData = {
            ...oldData, // Keep existing data
            settings: {
                ...(oldData.settings || {}), // Keep existing settings
                model: oldData.settings?.model || "anthropic/claude-3-sonnet", // Add default model if missing
                // Add other new fields or transformations here
            },
            // Example: Rename a field
            // preferredLanguage: oldData.language,
            // language: undefined, // Remove old field if renamed
        };
        // --- End Transformation Logic ---

        // Validate newData structure if necessary

        await env.USER_DATA.put(newKey, JSON.stringify(newData));
        console.log(`Successfully migrated data from ${oldKey} to ${newKey}`);

        // Optionally delete the old key *after* successful write
        // Be cautious with deletion, ensure migration is correct first.
        // if (oldKey !== newKey) {
        //   await env.USER_DATA.delete(oldKey);
        //   console.log(`Deleted old key: ${oldKey}`);
        // }

    } catch (error) {
        console.error(`Error migrating user data for key ${oldKey}:`, error);
        // Consider logging this error externally or implementing retry logic
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
    // Replace 'setmodel' and 'listmodels' with 'changemodel'
    const commands = ['start', 'setkey', 'changemodel', 'setsystemprompt', 'resetsettings', 'ask', 'help', 'newchat', 'search', 'setlang', 'setpersona']; // Bot commands
    if (!input || !input.startsWith('/')) {
        return null;
    }
    const inputCmd = input.split(' ')[0].substring(1).toLowerCase(); // Get command part, remove /, lowercase
    if (!inputCmd) return null; // Handle case like just "/"

    // Exact match first
    if (commands.includes(inputCmd)) {
        return inputCmd;
    }

    // Check Levenshtein distance
    let bestMatch = null;
    let minDistance = 3; // Allow distance up to 2 (threshold)

    for (const cmd of commands) {
        const distance = levenshteinDistance(cmd, inputCmd);
        if (distance < minDistance) {
            minDistance = distance;
            bestMatch = cmd;
        }
    }
    // Only return if the match is reasonably close (distance <= 2)
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
	const locale = LOCALES[lang] || LOCALES['en']; // Fallback to English
	let text = locale[key] || en[key] || `Missing translation: ${key}`; // Fallback to English key or error message
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
    const modelsPerPage = 5; // Adjust as needed
    const startIndex = (page - 1) * modelsPerPage;
    const endIndex = startIndex + modelsPerPage;
    const pageModels = models.slice(startIndex, endIndex);
    const totalPages = Math.ceil(models.length / modelsPerPage);

    const keyboard = pageModels.map(model => ([
        // Button text can be just the ID, or ID + Name if space allows
        // Using just ID for simplicity and to avoid hitting button text limits
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
        ...(text && { text: text }), // Only include text if provided
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
		parse_mode: 'Markdown', // Optional: Or 'HTML'
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
		parse_mode: 'Markdown', // Optional: Or 'HTML'
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
		history: [], // Initialize history
	};
	try {
		const storedSettings = await env.USER_DATA.get(`user_${userId}`, { type: 'json' });
		// Ensure history is always an array, even if stored data is old/malformed
		const history = Array.isArray(storedSettings?.history) ? storedSettings.history : [];
		return { ...defaultSettings, ...storedSettings, history };
	} catch (e) {
		console.error(`KV get error for user ${userId}:`, e);
		return defaultSettings; // Return defaults if KV fails
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
		// Optionally notify the user or admin
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
		return true; // Allow all users if the variable is not set
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
    if (!apiKey) return false; // Cannot check without a key
	try {
        // URL-encode the model ID in case it contains special characters like ':'
        const encodedModelId = encodeURIComponent(modelId);
        const checkUrl = `${OPENROUTER_API_BASE}/models/${encodedModelId}`;
        console.log(`Checking model URL: ${checkUrl}`); // Log the URL being checked
		const response = await fetch(checkUrl, {
			headers: { Authorization: `Bearer ${apiKey}` },
		});
        console.log(`Model check response status for ${modelId}: ${response.status}`); // Log status
        if (!response.ok) {
            const errorBody = await response.text().catch(() => 'Could not read error body');
            console.error(`Model check failed for ${modelId}: ${errorBody}`); // Log error body if possible
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
        // Assuming the models are in the 'data' array based on typical API structures
        // Adjust if the actual OpenRouter API response structure is different
        console.log(`Fetched ${data?.data?.length || 0} models from OpenRouter.`); // Log count
        return data.data || [];
    } catch (error) {
        console.error('Error fetching OpenRouter models:', error);
        throw error; // Re-throw the error to be handled by the caller
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
	const { apiKey, model, systemPrompt, history = [] } = settings; // Default history to empty array
	const lang = settings.language || 'en';
	const MAX_HISTORY_MESSAGES = 6; // Keep last 3 user/assistant pairs

	if (!apiKey) {
		await editMessageText(env, chatId, messageId, t(lang, 'key_required'));
		return;
	}

	try {
		const response = await fetch(`${OPENROUTER_API_BASE}/chat/completions`, {
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${apiKey}`,
				'Content-Type': 'application/json',
				'HTTP-Referer': 'https://github.com/username/telegram-openrouter-bot', // Replace with your repo URL
				'X-Title': 'Telegram OpenRouter Bot', // Replace with your bot name
			},
			body: JSON.stringify({
				model: model,
				messages: [
					{ role: 'system', content: systemPrompt },
                    // Include truncated history
                    ...history.slice(-MAX_HISTORY_MESSAGES),
					{ role: 'user', content: userPrompt },
				],
				stream: true,
			}),
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
		const updateInterval = 1500; // Milliseconds between Telegram edits

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			buffer += decoder.decode(value, { stream: true });

			// Process buffer line by line for SSE events
			let lines = buffer.split('\n');
			buffer = lines.pop() || ''; // Keep the last partial line

			for (const line of lines) {
				if (line.startsWith('data: ')) {
					const dataContent = line.substring(6).trim();
					if (dataContent === '[DONE]') {
						break; // End of stream
					}
					try {
						const chunk = JSON.parse(dataContent);
						if (chunk.choices && chunk.choices[0]?.delta?.content) {
							currentMessage += chunk.choices[0].delta.content;

							// Throttle Telegram API calls
							const now = Date.now();
							if (now - lastUpdateTime > updateInterval) {
								// Avoid editing with the exact same content
								const currentTelegramMessage = await env.USER_DATA.get(`msg_${messageId}`); // Simple way to track last sent content
								if (currentMessage.trim() && currentMessage !== currentTelegramMessage) {
									await editMessageText(env, chatId, messageId, currentMessage);
									await env.USER_DATA.put(`msg_${messageId}`, currentMessage, { expirationTtl: 300 }); // Store for 5 mins
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

		// Final update with the complete message
        const finalMessage = currentMessage.trim();
		if (finalMessage) {
			await editMessageText(env, chatId, messageId, finalMessage);

            // Add user prompt and assistant response to history
            const newHistory = [
                ...history,
                { role: 'user', content: userPrompt },
                { role: 'assistant', content: finalMessage }
            ].slice(-MAX_HISTORY_MESSAGES); // Keep history truncated

            // Save updated settings with new history
            const updatedSettings = { ...settings, history: newHistory };
            await setUserSettings(env, userId, updatedSettings);

		} else {
			// Handle cases where the stream finished but no content was generated
			await editMessageText(env, chatId, messageId, t(lang, 'ask_error') + " (No content received)");
		}
		await env.USER_DATA.delete(`msg_${messageId}`); // Clean up temp message tracking

	} catch (error) {
		console.error('Error streaming chat completion:', error);
		await editMessageText(env, chatId, messageId, t(lang, 'ask_error'));
		await env.USER_DATA.delete(`msg_${messageId}`); // Clean up on error
	}
}


// --- Main Fetch Handler ---

export default {
	/**
	 * @param {Request} request
	 * @param {Environment} env
	 * @param {ExecutionContext} ctx
	 * @returns {Promise<Response>}
	 */
	async fetch(request, env, ctx) {
		if (request.method !== 'POST') {
			return new Response('Expected POST', { status: 405 });
		}

		try {
			const update = await request.json();

            // --- Handle Callback Queries ---
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
                        const models = await getOpenRouterModels(userSettings.apiKey); // Fetch models again
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
                    // No need to re-validate here as it came from the list we provided
                    userSettings.model = modelId;
                    await setUserSettings(env, userId, userSettings);

                    // Delete the keyboard message
                     ctx.waitUntil(fetch(`${TELEGRAM_API_BASE}${env.TELEGRAM_BOT_TOKEN}/deleteMessage`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ chat_id: chatId, message_id: messageId }),
                    }).catch(e => console.error("Failed to delete model selection message:", e)));

                    // Send confirmation
                    await sendMessage(env, chatId, t(lang, 'model_set_success', { model: modelId }));
                    await answerCallbackQuery(env, callbackQuery.id); // Answer silently
                } else {
                     // Unknown callback data
                     await answerCallbackQuery(env, callbackQuery.id, t(lang, 'generic_error'));
                }

                return new Response('OK'); // Acknowledge callback
            }

            // --- Handle Regular Messages ---
			if (!update.message) {
				// Ignore other update types for now
				return new Response('OK');
			}

			const message = update.message;
			const chatId = message.chat.id;
			const userId = message.from.id;
			const text = message.text || '';

			// --- Authorization Check ---
			if (!isUserAuthorized(env, userId)) {
				await sendMessage(env, chatId, t('en', 'unauthorized')); // Unauthorized message always in English? Or detect lang? Let's use default lang.
				const defaultLang = env.DEFAULT_LANGUAGE === 'id' ? 'id' : 'en';
				await sendMessage(env, chatId, t(defaultLang, 'unauthorized'));
				return new Response('Unauthorized', { status: 403 });
			}

			// --- Get User Settings and Language ---
			const userSettings = await getUserSettings(env, userId);
			const lang = userSettings.language; // Use user's preferred language

			// --- Command Handling ---
			const detectedCommand = detectCommand(text); // Use typo detection

			if (detectedCommand) {
				const commandArgs = text.split(' ').slice(1); // Get arguments after the command
                const argString = commandArgs.join(' ');

				switch (detectedCommand) { // Switch on the detected command name
					case 'start': {
						if (userSettings.apiKey) {
							await sendMessage(env, chatId, t(lang, 'start_welcome_authorized') + '\n\n' + t(lang, 'current_settings', { model: userSettings.model, systemPrompt: userSettings.systemPrompt }));
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
                        await sendMessage(env, chatId, t(lang, 'models_list_fetching')); // Initial fetching message
                        try {
                            const models = await getOpenRouterModels(userSettings.apiKey);
                            if (models && models.length > 0) {
                                const keyboard = createModelKeyboard(models, 1, lang); // Start at page 1
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
					// case 'setmodel': // Removed - handled by callback
					case 'setsystemprompt': {
						const prompt = argString.trim();
						if (prompt) {
							userSettings.systemPrompt = prompt;
							await setUserSettings(env, userId, userSettings);
							await sendMessage(env, chatId, t(lang, 'system_prompt_set_success'));
						} else {
							// Reset to default if no prompt is provided
							userSettings.systemPrompt = env.DEFAULT_SYSTEM_PROMPT || 'You are a helpful assistant.';
							await setUserSettings(env, userId, userSettings);
							await sendMessage(env, chatId, t(lang, 'system_prompt_reset_success'));
						}
						break;
					}
					case 'resetsettings': {
						// Clear specific fields instead of deleting the whole user object
						// to preserve language preference if set separately later.
						const newSettings = { language: userSettings.language }; // Keep language
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
						// Send "Thinking..." message and get its ID
						const thinkingMessage = await sendMessage(env, chatId, t(lang, 'ask_thinking'));
						if (!thinkingMessage.ok) {
							console.error("Failed to send 'Thinking...' message");
							await sendMessage(env, chatId, t(lang, 'generic_error')); // Notify user about the failure
							break;
						}
						const thinkingMessageData = await thinkingMessage.json();
						const thinkingMessageId = thinkingMessageData.result.message_id;

						// Start streaming in the background, passing userId to save history
						ctx.waitUntil(streamChatCompletion(env, chatId, thinkingMessageId, userSettings, question, userId));
						break;
					}
                    case 'newchat': {
                        userSettings.history = []; // Clear history
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
                        if (!env.GOOGLE_API_KEY || !env.GOOGLE_CX) {
                             // Only check primary keys here, fallback handles Bing key check
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
                            // Edit the "Searching..." message with the results
                            await editMessageText(env, chatId, thinkingMessageId, responseText, { disable_web_page_preview: true }); // Disable preview for cleaner look

                        } catch (error) {
                            console.error('Search command error:', error);
                            await editMessageText(env, chatId, thinkingMessageId, t(lang, 'search_error'));
                        }
						break;
					}
                    // case 'listmodels': // Removed - handled by /changemodel
                    case 'setlang': {
                        const targetLang = argString.trim().toLowerCase();
                        if (targetLang === 'en' || targetLang === 'id') {
                            userSettings.language = targetLang;
                            await setUserSettings(env, userId, userSettings);
                            // Send confirmation in the *new* language
                            await sendMessage(env, chatId, t(targetLang, 'lang_set_success', { lang: targetLang === 'en' ? 'English' : 'Bahasa Indonesia' }));
                        } else if (!targetLang) {
                             await sendMessage(env, chatId, t(lang, 'lang_set_format')); // Use current language for format error
                        }
                         else {
                            await sendMessage(env, chatId, t(lang, 'lang_set_invalid')); // Use current language for invalid code error
                        }
						break;
					}
                    case 'setpersona': {
                        const personaName = argString.trim().toLowerCase();
                        const availablePersonas = Object.keys(PERSONAS);

                        if (personaName && PERSONAS[personaName]) {
                            userSettings.systemPrompt = PERSONAS[personaName];
                            await setUserSettings(env, userId, userSettings);
                            await sendMessage(env, chatId, t(lang, 'persona_set_success', { persona: personaName }));
                        } else {
                            // Send error message listing available personas
                            await sendMessage(env, chatId, t(lang, 'persona_set_invalid', { personas: availablePersonas.join(', ') }));
                        }
                        break;
                    }
					case 'help': {
						// TODO: Update help text to include /setpersona
						await sendMessage(env, chatId, t(lang, 'help') + '\n\n' + t(lang, 'current_settings', { model: userSettings.model, systemPrompt: userSettings.systemPrompt }));
						break;
					}
					// Add other commands here if needed
					default:
						// This case should ideally not be reached if detectCommand works correctly
						// but as a fallback, show help.
						await sendMessage(env, chatId, t(lang, 'help'));
						break;
				}
			} else if (text.startsWith('/')) {
                // If it starts with / but wasn't detected (e.g., too many typos or unknown command)
                await sendMessage(env, chatId, t(lang, 'help'));
            }
            // Ignore non-command messages otherwise

			return new Response('OK'); // Acknowledge the update
		} catch (error) {
			console.error('Error processing update:', error);
			// Avoid sending error messages for potential Telegram retries or irrelevant updates
			// Consider logging the error externally if needed
			return new Response('Error processing update', { status: 500 });
		}
	},
};
