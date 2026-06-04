/**
 * Step 04-01 — Validation Layer 1: drizzle-zod request schemas + ZodValidationPipe
 *
 * Scenario: "drizzle-zod schemas reject invalid payloads and export for MCP reuse"
 *
 * PORT-TO-PORT: this suite enters through TWO public boundaries that the system
 * actually exposes, never a private helper:
 *   1. The exported request schemas' public `.safeParse(...)` API — the SAME schemas
 *      the internal-mcp layer imports in step 05-01 (single source of truth).
 *   2. The ZodValidationPipe.transform(...) — the controller validation path that
 *      converts an invalid payload into a clean NestJS 400 (BadRequestException).
 *
 * Litmus: if the schema wiring under workspace/validation/ were removed, every
 * assertion here goes RED. None of these pass on fixture state alone.
 *
 * Test Budget: 5 distinct observable behaviors × 2 = 10 max.
 * Behaviors:
 *   B1: valid payload parses; invalid payload is rejected (schema is real, not pass-through)
 *   B2: color fields validated against /^#[0-9a-fA-F]{6}$/ on create-thought + create-label
 *   B3: relationship schema rejects source_id === target_id (.refine)
 *   B4: relationship schema constrains label_id to kind='edge' only (shape rule)
 *   B5: ZodValidationPipe turns an invalid payload into a NestJS 400 (BadRequestException)
 */

import { BadRequestException } from '@nestjs/common';
import {
  createThoughtSchema,
  createLabelSchema,
  createRelationshipSchema,
  createProjectSchema,
} from '../../../src/workspace/validation';
import { ZodValidationPipe } from '../../../src/workspace/validation/zod-validation.pipe';

const PROJECT_ID = '11111111-1111-1111-1111-111111111111';
const SOURCE_ID = '22222222-2222-2222-2222-222222222222';
const TARGET_ID = '33333333-3333-3333-3333-333333333333';
const LABEL_ID = '44444444-4444-4444-4444-444444444444';

describe('workspace/validation — drizzle-zod request schemas (Layer 1, stateless)', () => {
  // ── B1: schemas are real (accept valid, reject invalid) ────────────
  describe('createThoughtSchema', () => {
    it('accepts a minimal valid create-thought payload', () => {
      const result = createThoughtSchema.safeParse({
        projectId: PROJECT_ID,
        body: 'a real thought',
      });
      expect(result.success).toBe(true);
    });

    it('rejects a payload missing the required projectId', () => {
      const result = createThoughtSchema.safeParse({ body: 'orphan thought' });
      expect(result.success).toBe(false);
    });

    // ── B2: color regex on create-thought ──────────────────────────
    it.each([
      ['#ff0000', true],
      ['#FFFFFF', true],
      ['#abc', false],
      ['ff0000', false],
      ['#gggggg', false],
      ['#1234567', false],
    ])('validates color %s against the hex pattern → success=%s', (color, ok) => {
      const result = createThoughtSchema.safeParse({
        projectId: PROJECT_ID,
        body: 'x',
        color,
      });
      expect(result.success).toBe(ok);
    });

    it('permits create-thought with no color (color is optional)', () => {
      const result = createThoughtSchema.safeParse({ projectId: PROJECT_ID, body: 'x' });
      expect(result.success).toBe(true);
    });
  });

  describe('createLabelSchema', () => {
    it('accepts a minimal valid create-label payload', () => {
      const result = createLabelSchema.safeParse({ projectId: PROJECT_ID, name: 'todo' });
      expect(result.success).toBe(true);
    });

    it('rejects an empty / whitespace-only label name', () => {
      const result = createLabelSchema.safeParse({ projectId: PROJECT_ID, name: '   ' });
      expect(result.success).toBe(false);
    });

    // ── B2: color regex on create-label ─────────────────────────────
    it.each([
      ['#999999', true],
      ['#AABBCC', true],
      ['red', false],
      ['#12', false],
    ])('validates label color %s against the hex pattern → success=%s', (color, ok) => {
      const result = createLabelSchema.safeParse({ projectId: PROJECT_ID, name: 'tag', color });
      expect(result.success).toBe(ok);
    });
  });

  describe('createRelationshipSchema', () => {
    it('accepts a valid hierarchy relationship (distinct endpoints, no labelId)', () => {
      const result = createRelationshipSchema.safeParse({
        projectId: PROJECT_ID,
        sourceId: SOURCE_ID,
        targetId: TARGET_ID,
        kind: 'hierarchy',
      });
      expect(result.success).toBe(true);
    });

    // ── B3: .refine() rejects self-reference ────────────────────────
    it('rejects source_id === target_id via refine', () => {
      const result = createRelationshipSchema.safeParse({
        projectId: PROJECT_ID,
        sourceId: SOURCE_ID,
        targetId: SOURCE_ID,
        kind: 'edge',
      });
      expect(result.success).toBe(false);
    });

    it('rejects an unknown relationship kind', () => {
      const result = createRelationshipSchema.safeParse({
        projectId: PROJECT_ID,
        sourceId: SOURCE_ID,
        targetId: TARGET_ID,
        kind: 'mention',
      });
      expect(result.success).toBe(false);
    });

    // ── B4: labelId is shape-permitted only for kind='edge' ─────────
    it('accepts labelId when kind is edge', () => {
      const result = createRelationshipSchema.safeParse({
        projectId: PROJECT_ID,
        sourceId: SOURCE_ID,
        targetId: TARGET_ID,
        kind: 'edge',
        labelId: LABEL_ID,
      });
      expect(result.success).toBe(true);
    });

    it('rejects labelId when kind is tag (label_id permitted on edge only)', () => {
      const result = createRelationshipSchema.safeParse({
        projectId: PROJECT_ID,
        sourceId: SOURCE_ID,
        targetId: TARGET_ID,
        kind: 'tag',
        labelId: LABEL_ID,
      });
      expect(result.success).toBe(false);
    });
  });

  // ── B6: create-project schema (also wired to the projects controller) ──
  describe('createProjectSchema', () => {
    it('accepts a minimal valid create-project payload', () => {
      const result = createProjectSchema.safeParse({ name: 'My Brain' });
      expect(result.success).toBe(true);
    });

    it('rejects an empty / whitespace-only project name', () => {
      const result = createProjectSchema.safeParse({ name: '   ' });
      expect(result.success).toBe(false);
    });
  });
});

describe('ZodValidationPipe — controller boundary produces a clean 400', () => {
  // ── B5: invalid payload → NestJS BadRequestException (HTTP 400) ────
  it('throws BadRequestException for an invalid payload', () => {
    const pipe = new ZodValidationPipe(createThoughtSchema);
    expect(() => pipe.transform({ body: 'missing project id' })).toThrow(BadRequestException);
  });

  it('returns the parsed value for a valid payload', () => {
    const pipe = new ZodValidationPipe(createThoughtSchema);
    const value = pipe.transform({ projectId: PROJECT_ID, body: 'ok' });
    expect(value).toMatchObject({ projectId: PROJECT_ID, body: 'ok' });
  });
});
