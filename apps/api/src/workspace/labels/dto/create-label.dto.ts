export class CreateLabelDto {
  projectId!: string;
  name!: string;
  color?: string;
  isEdge?: boolean;
}
