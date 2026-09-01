import { BaseAIProvider } from './baseProvider';

class InvalidResponseError extends Error {
  public readonly name = 'InvalidResponseError';
  constructor(message: string) { super(message); }
}

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
      messages.push({
        role: 'system',
        content: systemPrompt +
          '\n\nIMPORTANT: You must return ONLY valid raw JSON matching the required schema. ' +
          'Do NOT wrap it in markdown block quotes like ```json. Your response must begin with { and end with }.'
      });
    }
    messages.push({ role: 'user', content: prompt });

    let response: Response;
    try {
      response = await fetch(this.apiUrl, {
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
    } catch (networkErr: any) {
      this.recordFailure(networkErr);
      const e = new Error(`fetch failed: ${networkErr.message}`);
      (e as any).name = 'NetworkError';
      throw e;
    }

    if (!response.ok) {
      let errBody = '';
      try { errBody = await response.text(); } catch {}
      let errMsg = errBody.substring(0, 200);
      try {
        const parsed = JSON.parse(errBody);
        if (parsed?.error) errMsg = typeof parsed.error === 'string' ? parsed.error : JSON.stringify(parsed.error);
      } catch {}

      const err = new Error(`HuggingFace API Error: ${response.status} ${response.statusText} - ${errMsg}`);
      (err as any).statusCode = response.status;
      this.recordFailure(err);
      throw err;
    }

    let rawText = '';
    try {
      const data = await response.json();
      rawText = (data?.choices?.[0]?.message?.content || '').trim();
    } catch (parseErr: any) {
      const e = new InvalidResponseError(`HuggingFace returned unparseable body: ${parseErr.message}`);
      this.recordFailure(e);
      throw e;
    }

    const parsed = this.extractJson<T>(rawText);
    this.recordSuccess();
    return parsed;
  }

  /**
   * Robust JSON extractor for open-source models that often include
   * preamble text before or after the JSON object.
   */
  private extractJson<T>(raw: string): T {
    const lowerRaw = raw.toLowerCase();
    const safetyPhrases = ['i cannot', 'i am unable', 'content policy', 'i apologize', 'as an ai'];
    if (safetyPhrases.some(p => lowerRaw.startsWith(p))) {
      const preview = raw.substring(0, 120).replace(/\n/g, ' ');
      throw new InvalidResponseError(`HuggingFace returned safety/non-JSON response. Preview: "${preview}"`);
    }

    // Strip markdown fences
    let text = raw;
    if (text.startsWith('```json')) text = text.replace(/^```json\n?/, '');
    else if (text.startsWith('```'))  text = text.replace(/^```\n?/, '');
    if (text.endsWith('```')) text = text.replace(/\n?```$/, '');
    text = text.trim();

    // Direct parse
    try { return JSON.parse(text) as T; } catch {}

    // Brace-range extraction (open-source models often prepend explanation text)
    const first = text.indexOf('{');
    const last  = text.lastIndexOf('}');
    if (first !== -1 && last > first) {
      try { return JSON.parse(text.substring(first, last + 1)) as T; } catch {}
    }

    const preview = raw.substring(0, 120).replace(/\n/g, ' ');
    throw new InvalidResponseError(`HuggingFace returned invalid JSON. Preview: "${preview}"`);
  }
}
