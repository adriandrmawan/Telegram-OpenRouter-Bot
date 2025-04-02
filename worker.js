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
 */

// --- Constants ---
const TELEGRAM_API_BASE = 'https://api.telegram.org/bot';
const OPENROUTER_API_BASE = 'https://openrouter.ai/api/v1';
const LOCALES = { en, id };
const CACHE_TTL = 60 * 60 * 4; // 4 hours for search cache

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
 * @returns {Promise<object>} // Replace object with actual search result structure
 */
async function googleSearch(query, env) {
    // TODO: Implement actual Google Custom Search API call
    console.warn(`Placeholder googleSearch called with query: ${query}`);
    // Example structure (adjust based on actual API response):
    // const url = `https://www.googleapis.com/customsearch/v1?key=${env.GOOGLE_API_KEY}&cx=${env.GOOGLE_CX}&q=${encodeURIComponent(query)}`;
    // const response = await fetch(url);
    // if (!response.ok) throw new Error('Google Search API failed');
    // const data = await response.json();
    // return data.items; // Or process as needed
    return Promise.resolve({ results: [{ title: "Placeholder Google Result", link: "http://example.com/google", snippet: "This is a placeholder." }] });
}

/**
 * Placeholder for Bing Search API call.
 * @param {string} query
 * @param {Environment} env
 * @returns {Promise<object>} // Replace object with actual search result structure
 */
async function bingSearch(query, env) {
    // TODO: Implement actual Bing Search API call
    console.warn(`Placeholder bingSearch called with query: ${query}`);
    // Example structure (adjust based on actual API response):
    // const url = `https://api.bing.microsoft.com/v7.0/search?q=${encodeURIComponent(query)}`;
    // const response = await fetch(url, { headers: { 'Ocp-Apim-Subscription-Key': env.BING_API_KEY } });
    // if (!response.ok) throw new Error('Bing Search API failed');
    // const data = await response.json();
    // return data.webPages.value; // Or process as needed
    return Promise.resolve({ results: [{ title: "Placeholder Bing Result", link: "http://example.com/bing", snippet: "This is a fallback placeholder." }] });
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
 * @returns {Promise<object>} Search results.
 */
async function searchWithFallback(query, env) {
    // 1. Check cache
    const cachedResults = await getCachedSearch(query, env);
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
    const commands = ['start', 'setkey', 'setmodel', 'setsystemprompt', 'resetsettings', 'ask', 'help']; // Bot commands
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
	};
	try {
		const storedSettings = await env.USER_DATA.get(`user_${userId}`, { type: 'json' });
		return { ...defaultSettings, ...storedSettings };
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
		const response = await fetch(`${OPENROUTER_API_BASE}/models/${modelId}`, {
			headers: { Authorization: `Bearer ${apiKey}` },
		});
		return response.ok;
	} catch (error) {
		console.error(`Error checking OpenRouter model ${modelId}:`, error);
		return false;
	}
}


/**
 * Streams chat completions from OpenRouter to Telegram.
 * @param {Environment} env - Worker environment.
 * @param {number} chatId - Telegram chat ID.
 * @param {number} messageId - Telegram message ID of the "Thinking..." message.
 * @param {UserSettings} settings - User settings including API key, model, and system prompt.
 * @param {string} userPrompt - The user's question/prompt.
 */
async function streamChatCompletion(env, chatId, messageId, settings, userPrompt) {
	const { apiKey, model, systemPrompt } = settings;
	const lang = settings.language || 'en';

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
		if (currentMessage.trim()) {
			await editMessageText(env, chatId, messageId, currentMessage);
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
			if (!update.message) {
				// Ignore updates without a message (like channel posts, edited messages if not handled, etc.)
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
					case 'setmodel': {
						if (!userSettings.apiKey) {
                            await sendMessage(env, chatId, t(lang, 'key_required'));
                            break;
                        }
						const modelId = argString.trim();
						if (!modelId) {
							await sendMessage(env, chatId, t(lang, 'model_set_invalid'));
							break;
						}
						// Verify model exists using the user's key
						const modelExists = await checkOpenRouterModel(userSettings.apiKey, modelId);
						if (modelExists) {
							userSettings.model = modelId;
							await setUserSettings(env, userId, userSettings);
							await sendMessage(env, chatId, t(lang, 'model_set_success', { model: modelId }));
						} else {
							await sendMessage(env, chatId, t(lang, 'model_fetch_error'));
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

						// Start streaming in the background
						ctx.waitUntil(streamChatCompletion(env, chatId, thinkingMessageId, userSettings, question));
						break;
					}
					case 'help': {
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
