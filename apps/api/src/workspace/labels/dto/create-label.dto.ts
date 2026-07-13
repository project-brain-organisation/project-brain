export class CreateLabelDto {
  /** Optional client-generated uuid (optimistic UI inserts). */
  id?: string;
  projectId!: string;
  name!: string;
  color?: string;
  isEdge?: boolean;
}
