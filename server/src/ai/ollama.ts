import { z } from 'zod';
import { ApiError } from './contracts.js';

export class Ollama {
  constructor(private config: { baseUrl?: string; model?: string; fetch?: typeof fetch } = {}) {}

  async generate<T>(schema: z.ZodType<T>, system: string, prompt: string, image?: Buffer): Promise<T> {
    const format = z.toJSONSchema(schema);
    try {
      const response = await (this.config.fetch ?? fetch)(`${this.config.baseUrl ?? process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434'}/api/chat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(120_000),
        body: JSON.stringify({
          model: this.config.model ?? process.env.OLLAMA_MODEL ?? 'qwen3-vl:4b-instruct',
          stream: false, format,
          options: { temperature: 0, num_predict: 1200, num_ctx: 16384 },
          messages: [
            { role: 'system', content: `${system}\nReturn JSON matching this schema: ${JSON.stringify(format)}` },
            { role: 'user', content: prompt, ...(image ? { images: [image.toString('base64')] } : {}) },
          ],
        }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json() as { message?: { content?: string } };
      return schema.parse(JSON.parse(data.message?.content ?? ''));
    } catch {
      // Do not expose model output, image contents or upstream service details.
      throw new ApiError(502, 'Ollama could not return a valid response. Check the service and vision model.');
    }
  }
}
