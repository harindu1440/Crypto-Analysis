import { BaseAIProvider } from './baseProvider';

/**
 * Structured error thrown when the provider returns a non-JSON / safety response.
 * The `name` field is checked first in ModelRegistry.classifyError().
 */
class InvalidResponseError extends Error {
  public readonly name = 'InvalidResponseError';
  public readonly statusCode?: number;
  constructor(message: string, statusCode?: number) {
    super(message);
    this.statusCode = statusCode;
  }
}

export class OpenRouterProvider extends BaseAIProvider {
  name = 'openrouter-provider';
  private apiKey: string;
  private model: string;
  private apiUrl = 'https://openrouter.ai/api/v1/chat/completions';

  constructor(modelSuffix?: string) {
    super();
    this.apiKey = process.env.OPENROUTER_API_KEY || '';
    const configuredModels = (process.env.OPENROUTER_MODELS || 'openrouter/free').split(',').map(s => s.trim());
    this.model = modelSuffix || configuredModels[0];
    this.name = `openrouter-${this.model.replace(/\//g, '-')}`;
  }

  isConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  async generateObject<T>(prompt: string, schemaName: string, systemPrompt?: string): Promise<T> {
    if (!this.isConfigured()) {
      throw new Error('OpenRouter API is OFFLINE');
    }

    const messages = [];
    if (systemPrompt) {
      messages.push({
        role: 'system',
        content: systemPrompt + '\n\nIMPORTANT: You must return ONLY valid raw JSON matching the required schema. Do NOT wrap it in markdown block quotes like ```json. Your response must begin with { and end with }.'
      });
    }
    messages.push({ role: 'user', content: prompt });

    let response: Response;
    try {
      response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://crypto-analysis-platform.local',
          'X-Title': 'Crypto Analysis Platform'
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          temperature: 0.1,
          response_format: { type: 'json_object' }
        })
      });
    } catch (networkErr: any) {
      // fetch() itself threw — network-level failure
      this.recordFailure(networkErr);
      const e = new Error(`fetch failed: ${networkErr.message}`);
      (e as any).name = 'NetworkError';
      throw e;
    }

    if (!response.ok) {
      let errBody = '';
      try { errBody = await response.text(); } catch {}
      let errMsg = errBody;
      try {
        const parsed = JSON.parse(errBody);
        if (parsed?.error?.message) errMsg = parsed.error.message;
      } catch {}

      const err = new Error(`OpenRouter API Error: ${response.status} ${response.statusText} - ${errMsg.substring(0, 200)}`);
      (err as any).statusCode = response.status;
      this.recordFailure(err);
      throw err;
    }

    let rawText = '';
    try {
      const data = await response.json();
      rawText = (data?.choices?.[0]?.message?.content || '').trim();
    } catch (parseErr: any) {
      const e = new InvalidResponseError(
        `OpenRouter returned unparseable response body: ${parseErr.message}`
      );
      this.recordFailure(e);
      throw e;
    }

    // Attempt to extract valid JSON from the raw response
    const parsed = this.extractJson<T>(rawText);

    this.recordSuccess();
    return parsed;
  }

  /**
   * Robust JSON extractor.
   * 1. Strip markdown fences.
   * 2. Detect known non-JSON safety messages — reject immediately.
   * 3. Find first `{` … last `}` range.
   * 4. Parse and return.
   * 5. If no valid JSON found → throw InvalidResponseError.
   */
  private extractJson<T>(raw: string): T {
    // Check for obvious non-JSON safety / moderation messages
    const lowerRaw = raw.toLowerCase();
    const safetyPhrases = [
      'user safety', 'safety:', 'i cannot', 'i am unable', 'content policy',
      'i apologize', 'as an ai', 'i\'m sorry, i can\'t'
    ];
    if (safetyPhrases.some(p => lowerRaw.startsWith(p.toLowerCase()) || lowerRaw.includes(`: ${p.toLowerCase()}`))) {
      const preview = raw.substring(0, 120).replace(/\n/g, ' ');
      throw new InvalidResponseError(
        `OpenRouter returned a safety/non-JSON response. Preview: "${preview}". Model: ${this.model}`
      );
    }

    // Strip markdown fences
    let text = raw;
    if (text.startsWith('```json')) text = text.replace(/^```json\n?/, '');
    else if (text.startsWith('```'))  text = text.replace(/^```\n?/, '');
    if (text.endsWith('```')) text = text.replace(/\n?```$/, '');
    text = text.trim();

    // Try direct parse first
    try {
      return JSON.parse(text) as T;
    } catch {}

    // Attempt brace-range extraction
    const first = text.indexOf('{');
    const last  = text.lastIndexOf('}');
    if (first !== -1 && last > first) {
      try {
        return JSON.parse(text.substring(first, last + 1)) as T;
      } catch {}
    }

    const preview = raw.substring(0, 120).replace(/\n/g, ' ');
    throw new InvalidResponseError(
      `OpenRouter returned invalid JSON. Preview: "${preview}". Model: ${this.model}`
    );
  }
}
