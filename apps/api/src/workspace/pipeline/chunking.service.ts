import { Injectable } from '@nestjs/common';

@Injectable()
export class ChunkingService {
  private static readonly MAX_CHARS = 200;
  private static readonly OVERLAP_RATIO = 0.1;

  chunk(text: string): string[] {
    const maxChars = ChunkingService.MAX_CHARS;
    const trimmed = text.trim();
    if (!trimmed) return [];
    if (trimmed.length <= maxChars) return [trimmed];

    // Tier 1: split on double newlines (paragraph boundaries)
    const paragraphs = trimmed.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
    const result: string[] = [];

    for (const para of paragraphs) {
      if (para.length <= maxChars) {
        result.push(para);
        continue;
      }

      // Tier 2: split on sentence-ending punctuation
      const sentences = this.splitSentences(para);
      let buffer = '';

      for (const sentence of sentences) {
        if (buffer && (buffer + ' ' + sentence).length > maxChars) {
          result.push(buffer.trim());
          buffer = sentence;
        } else {
          buffer = buffer ? buffer + ' ' + sentence : sentence;
        }
      }

      if (buffer.trim()) result.push(buffer.trim());
    }

    // Tier 3: any chunk still over max gets fixed-width split with overlap
    const final: string[] = [];
    for (const chunk of result) {
      if (chunk.length <= maxChars) {
        final.push(chunk);
      } else {
        final.push(...this.fixedWidthSplit(chunk, maxChars));
      }
    }

    return final;
  }

  private splitSentences(text: string): string[] {
    return text.split(/(?<=[.!?;:])\s+/).filter(Boolean);
  }

  private fixedWidthSplit(text: string, maxChars: number): string[] {
    const overlap = Math.floor(maxChars * ChunkingService.OVERLAP_RATIO);
    const step = maxChars - overlap;
    const parts: string[] = [];
    let i = 0;

    while (i < text.length) {
      parts.push(text.slice(i, i + maxChars).trim());
      i += step;
    }

    return parts.filter(Boolean);
  }
}
