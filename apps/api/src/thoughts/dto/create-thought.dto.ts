import { IsOptional, IsString, IsUUID, IsInt, IsBoolean } from 'class-validator';

export class CreateThoughtDto {
  @IsString()
  @IsOptional()
  body?: string;

  @IsString()
  @IsOptional()
  title?: string;

  @IsUUID()
  @IsOptional()
  parentId?: string;

  @IsBoolean()
  @IsOptional()
  isRoot?: boolean;

  @IsInt()
  @IsOptional()
  canvasX?: number;

  @IsInt()
  @IsOptional()
  canvasY?: number;
}
