export interface AIProvider {
  name: string;
  generateObject<T>(prompt: string, schemaName: string, systemPrompt?: string): Promise<T>;
}
