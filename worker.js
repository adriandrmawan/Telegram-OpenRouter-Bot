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
 * @property {string} [OPENROUTER_API_KEY] - Optional: Bot's own OpenRouter key (Secret)
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

// --- Helper Functions ---

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
			if (text.startsWith('/')) {
				const [command, ...args] = text.split(' ');
				const argString = args.join(' ');

				switch (command) {
					case '/start': {
						if (userSettings.apiKey) {
							await sendMessage(env, chatId, t(lang, 'start_welcome_authorized') + '\n\n' + t(lang, 'current_settings', { model: userSettings.model, systemPrompt: userSettings.systemPrompt }));
						} else {
							await sendMessage(env, chatId, t(lang, 'start_welcome'));
						}
						break;
					}
					case '/setkey': {
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
					case '/setmodel': {
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
					case '/setsystemprompt': {
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
					case '/resetsettings': {
						// Clear specific fields instead of deleting the whole user object
						// to preserve language preference if set separately later.
						const newSettings = { language: userSettings.language }; // Keep language
						await setUserSettings(env, userId, newSettings);
						await sendMessage(env, chatId, t(lang, 'settings_reset_success'));
						break;
					}
					case '/ask': {
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
					case '/help': {
						await sendMessage(env, chatId, t(lang, 'help') + '\n\n' + t(lang, 'current_settings', { model: userSettings.model, systemPrompt: userSettings.systemPrompt }));
						break;
					}
					// Add other commands like /setlang if needed
					default:
						await sendMessage(env, chatId, t(lang, 'help')); // Show help for unknown commands
						break;
				}
			} else {
				// Handle non-command messages (optional: could treat as /ask)
				// For now, just ignore or show help
				// await sendMessage(env, chatId, t(lang, 'help'));
			}

			return new Response('OK'); // Acknowledge the update
		} catch (error) {
			console.error('Error processing update:', error);
			// Avoid sending error messages for potential Telegram retries or irrelevant updates
			// Consider logging the error externally if needed
			return new Response('Error processing update', { status: 500 });
		}
	},
};
