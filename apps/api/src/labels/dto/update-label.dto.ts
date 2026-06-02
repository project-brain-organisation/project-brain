import { IsString, IsOptional, IsBoolean, MaxLength, Matches } from 'class-validator';

export class UpdateLabelDto {
  @IsString()
  @IsOptional()
  @MaxLength(100)
  name?: string;

  @IsString()
  @IsOptional()
  @Matches(/^#[0-9a-fA-F]{6}$/)
  color?: string;

  @IsBoolean()
  @IsOptional()
  isEdge?: boolean;
}
