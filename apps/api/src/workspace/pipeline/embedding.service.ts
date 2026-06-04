import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);
  private static readonly BATCH_SIZE = 64;
  private static readonly MODEL = 'sentence-transformers/all-mpnet-base-v2';

  async embed(texts: string[]): Promise<number[][]> {
    const results: number[][] = [];

    for (let i = 0; i < texts.length; i += EmbeddingService.BATCH_SIZE) {
      const batch = texts.slice(i, i + EmbeddingService.BATCH_SIZE);
      const response = await fetch(
        'https://openrouter.ai/api/v1/embeddings',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          },
          body: JSON.stringify({
            model: EmbeddingService.MODEL,
            input: batch,
          }),
        },
      );

      if (!response.ok) {
        const body = await response.text();
        this.logger.error(`OpenRouter embedding failed: ${response.status} ${body}`);
        throw new Error(`Embedding request failed: ${response.status}`);
      }

      const json = await response.json();
      for (const item of json.data) {
        results.push(item.embedding);
      }
    }

    return results;
  }
}
