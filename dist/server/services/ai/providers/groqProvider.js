"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GroqProvider = void 0;
const baseProvider_1 = require("./baseProvider");
class GroqProvider extends baseProvider_1.BaseAIProvider {
    name = 'groq-provider';
    apiKey;
    model;
    apiUrl = 'https://api.groq.com/openai/v1/chat/completions';
    constructor() {
        super();
        this.apiKey = process.env.GROQ_API_KEY || '';
        this.model = process.env.GROQ_MODEL || 'llama3-70b-8192'; // fallback free model
    }
    isConfigured() {
        return this.apiKey.length > 0;
    }
    async generateObject(prompt, schemaName, systemPrompt) {
        if (!this.isConfigured()) {
            throw new Error('Groq API is OFFLINE');
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
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: this.model,
                    messages,
                    temperature: 0.1,
                    response_format: { type: 'json_object' }
                })
            });
            if (!response.ok) {
                throw new Error(`Groq API Error: ${response.status} ${response.statusText}`);
            }
            const data = await response.json();
            let text = data.choices[0].message.content.trim();
            // Cleanup markdown quotes if model ignored instructions
            if (text.startsWith('```json'))
                text = text.replace(/^```json/, '');
            if (text.startsWith('```'))
                text = text.replace(/^```/, '');
            if (text.endsWith('```'))
                text = text.replace(/```$/, '');
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
exports.GroqProvider = GroqProvider;
