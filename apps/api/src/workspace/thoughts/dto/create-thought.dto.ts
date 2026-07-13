export class CreateThoughtDto {
  /** Optional client-generated uuid (optimistic UI inserts). */
  id?: string;
  projectId!: string;
  body!: string;
  /** Optional parent thought — hierarchy relationship created in the same tx. */
  parentId?: string;
  title?: string;
  color?: string;
  canvasX?: number | null;
  canvasY?: number | null;
  width?: number | null;
  height?: number | null;
}
