import { IsOptional, IsString, IsInt, IsUUID } from 'class-validator';

export class UpdateThoughtDto {
  @IsString()
  @IsOptional()
  body?: string;

  @IsString()
  @IsOptional()
  title?: string;

  @IsUUID()
  @IsOptional()
  parentId?: string;

  @IsInt()
  @IsOptional()
  canvasX?: number;

  @IsInt()
  @IsOptional()
  canvasY?: number;

  @IsInt()
  @IsOptional()
  width?: number;

  @IsInt()
  @IsOptional()
  height?: number;
}
