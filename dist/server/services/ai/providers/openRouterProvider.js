"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenRouterProvider = void 0;
const baseProvider_1 = require("./baseProvider");
class OpenRouterProvider extends baseProvider_1.BaseAIProvider {
    name = 'openrouter-provider';
    apiKey;
    model;
    apiUrl = 'https://openrouter.ai/api/v1/chat/completions';
    constructor(modelSuffix) {
        super();
        this.apiKey = process.env.OPENROUTER_API_KEY || '';
        // Support multiple models by instantiating this provider multiple times
        // Format: OPENROUTER_MODELS="modelA,modelB"
        const configuredModels = (process.env.OPENROUTER_MODELS || 'openrouter/free').split(',').map(s => s.trim());
        this.model = modelSuffix || configuredModels[0];
        // Override name so each instance has a unique identity in circuit breakers
        this.name = `openrouter-${this.model.replace(/\//g, '-')}`;
    }
    isConfigured() {
        return this.apiKey.length > 0;
    }
    async generateObject(prompt, schemaName, systemPrompt) {
        if (!this.isConfigured()) {
            throw new Error('OpenRouter API is OFFLINE');
        }
        const messages = [];
        if (systemPrompt) {
            messages.push({ role: 'system', content: systemPrompt + '\n\nIMPORTANT: You must return ONLY valid raw JSON matching the required schema. Do NOT wrap it in markdown block quotes like ```json.' });
        }
        messages.push({ role: 'user', content: prompt });
        try {
            const response = await fetch(this.apiUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': 'https://crypto-analysis-platform.local', // Required by OR
                    'X-Title': 'Crypto Analysis Platform'
                },
                body: JSON.stringify({
                    model: this.model,
                    messages,
                    temperature: 0.1,
                    response_format: { type: 'json_object' }
                })
            });
            if (!response.ok) {
                throw new Error(`OpenRouter API Error: ${response.status} ${response.statusText}`);
            }
            const data = await response.json();
            let text = data.choices[0].message.content.trim();
            if (text.startsWith('```json'))
                text = text.replace(/^```json\n?/, '');
            if (text.startsWith('```'))
                text = text.replace(/^```\n?/, '');
            if (text.endsWith('```'))
                text = text.replace(/\n?```$/, '');
            const parsed = JSON.parse(text);
            this.recordSuccess();
            return parsed;
        }
        catch (err) {
            this.recordFailure(err);
            throw err;
        }
    }
}
exports.OpenRouterProvider = OpenRouterProvider;
