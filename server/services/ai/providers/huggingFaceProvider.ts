import { BaseAIProvider } from './baseProvider';

export class HuggingFaceProvider extends BaseAIProvider {
  name = 'huggingface-provider';
  private token: string;
  private model: string;
  private apiUrl: string;

  constructor() {
    super();
    this.token = process.env.HF_TOKEN || '';
    this.model = process.env.HF_MODEL || 'meta-llama/Meta-Llama-3-8B-Instruct';
    this.apiUrl = `https://api-inference.huggingface.co/models/${this.model}/v1/chat/completions`;
  }

  isConfigured(): boolean {
    return this.token.length > 0;
  }

  async generateObject<T>(prompt: string, schemaName: string, systemPrompt?: string): Promise<T> {
    if (!this.isConfigured()) {
      throw new Error('HuggingFace API is OFFLINE');
    }

    const messages = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt + '\n\nIMPORTANT: You must return ONLY valid raw JSON matching the required schema. Do NOT wrap it in markdown block quotes like ```json. Your response must begin with { and end with }.' });
    }
    messages.push({ role: 'user', content: prompt });

    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          temperature: 0.1,
          max_tokens: 1500
        })
      });

      if (!response.ok) {
        throw new Error(`HuggingFace API Error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      let text = data.choices[0].message.content.trim();
      
      // Extensive JSON cleanup for open source models
      if (text.startsWith('```json')) text = text.replace(/^```json\n?/, '');
      if (text.startsWith('```')) text = text.replace(/^```\n?/, '');
      if (text.endsWith('```')) text = text.replace(/\n?```$/, '');
      
      const firstBrace = text.indexOf('{');
      const lastBrace = text.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1) {
          text = text.substring(firstBrace, lastBrace + 1);
      }
      
      const parsed = JSON.parse(text);
      this.recordSuccess();
      return parsed as T;
    } catch (err: any) {
      this.recordFailure(err);
      throw err;
    }
  }
}
