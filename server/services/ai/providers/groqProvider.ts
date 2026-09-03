import { BaseAIProvider } from './baseProvider';

class InvalidResponseError extends Error {
  public readonly name = 'InvalidResponseError';
  constructor(message: string) { super(message); }
}

export class GroqProvider extends BaseAIProvider {
  name = 'groq-provider';
  private apiKey: string;
  private model: string;
  private apiUrl = 'https://api.groq.com/openai/v1/chat/completions';

  constructor() {
    super();
    this.apiKey = process.env.GROQ_API_KEY || '';
    this.model = process.env.GROQ_MODEL || 'llama3-70b-8192'; // fallback free model
  }

  isConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  async generateObject<T>(prompt: string, schemaName: string, systemPrompt?: string): Promise<T> {
    if (!this.isConfigured()) {
      throw new Error('Groq API is OFFLINE');
    }

    const messages = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt + '\n\nIMPORTANT: You must return ONLY valid raw JSON matching the required schema. Do NOT wrap it in markdown block quotes like ```json.' });
    }
    messages.push({ role: 'user', content: prompt });

    let response: Response;
    try {
      response = await fetch(this.apiUrl, {
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
    } catch (networkErr: any) {
      this.recordFailure(networkErr);
      const e = new Error(`fetch failed: ${networkErr.message}`);
      (e as any).name = 'NetworkError';
      throw e;
    }

    if (!response.ok) {
        const errText = await response.text();
        let sanitized = errText;
        try {
           const parsedErr = JSON.parse(errText);
           if (parsedErr.error && parsedErr.error.message) {
               sanitized = parsedErr.error.message;
           }
        } catch(e) {}
        const err = new Error(`Groq API Error: ${response.status} ${response.statusText} - ${sanitized}`);
        (err as any).statusCode = response.status;
        this.recordFailure(err);
        throw err;
      }

      const data = await response.json();
      let text = data.choices[0].message.content.trim();
      
      // Cleanup markdown quotes if model ignored instructions
      if (text.startsWith('```json')) text = text.replace(/^```json/, '');
      if (text.startsWith('```')) text = text.replace(/^```/, '');
      if (text.endsWith('```')) text = text.replace(/```$/, '');
      text = text.trim();
      
      let parsed: T;
      try {
        parsed = JSON.parse(text) as T;
      } catch {
        // Attempt brace extraction
        const first = text.indexOf('{'); const last = text.lastIndexOf('}');
        if (first !== -1 && last > first) {
          try { parsed = JSON.parse(text.substring(first, last + 1)) as T; }
          catch {
            const preview = text.substring(0, 100).replace(/\n/g, ' ');
            throw new InvalidResponseError(`Groq returned invalid JSON. Preview: "${preview}"`);
          }
        } else {
          const preview = text.substring(0, 100).replace(/\n/g, ' ');
          throw new InvalidResponseError(`Groq returned non-JSON response. Preview: "${preview}"`);
        }
      }
      this.recordSuccess();
      return parsed;
  }
}
