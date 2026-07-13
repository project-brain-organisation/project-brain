export class CreateRelationshipDto {
  /** Optional client-generated uuid (optimistic UI inserts). */
  id?: string;
  projectId!: string;
  sourceId!: string;
  targetId!: string;
  kind!: 'hierarchy' | 'tag' | 'edge';
  labelId?: string;
}
