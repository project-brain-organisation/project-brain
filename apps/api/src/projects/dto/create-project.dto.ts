export class CreateProjectDto {
  name!: string;
  emoji?: string;
  color?: string | null;
  isPublic?: boolean;
}
