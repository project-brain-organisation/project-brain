export class CreateRelationshipDto {
  projectId!: string;
  sourceId!: string;
  targetId!: string;
  kind!: 'hierarchy' | 'tag' | 'edge';
  labelId?: string;
}
