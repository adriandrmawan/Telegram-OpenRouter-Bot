export interface Environment {
    TELEGRAM_BOT_TOKEN: string;
    ALLOWED_USER_IDS: string;
    DEFAULT_LANGUAGE: string;
    DEFAULT_MODEL: string;
    DEFAULT_SYSTEM_PROMPT?: string;
    USER_DATA: KVNamespace;
    CACHE: KVNamespace;
    OPENROUTER_API_KEY?: string;
    GOOGLE_API_KEY?: string;
    GOOGLE_CX?: string;
    BING_API_KEY?: string;
}

export interface UserSettings {
    apiKey?: string;
    model?: string;
    systemPrompt?: string;
    language?: string;
    history?: Array<{role: 'user'|'assistant', content: string}>;
    lastSearchQuery?: string;
    lastSearchTimestamp?: number;
    searchEnabled?: boolean;
}
