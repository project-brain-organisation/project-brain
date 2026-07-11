export class CreateThoughtDto {
  projectId!: string;
  body!: string;
  title?: string;
  color?: string;
  canvasX?: number | null;
  canvasY?: number | null;
  width?: number | null;
  height?: number | null;
}
