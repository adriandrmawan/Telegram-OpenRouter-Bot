import en from '../locales/en.json';
import id from '../locales/id.json';

export const TELEGRAM_API_BASE = 'https://api.telegram.org/bot';
export const OPENROUTER_API_BASE = 'https://openrouter.ai/api/v1';
export const LOCALES = { en, id };
export const CACHE_TTL = 60 * 60 * 4; // 4 hours

export const PERSONAS = {
    default: 'You are a helpful assistant.',
    coder: 'You are an expert programmer. Provide code examples and explain technical concepts clearly.',
    translator: 'You are a multilingual translator. Translate the given text accurately.',
    summarizer: 'You are an expert summarizer. Provide concise summaries of the given text.',
};
