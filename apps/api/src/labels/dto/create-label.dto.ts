import { IsString, IsOptional, IsUUID, MaxLength, Matches } from 'class-validator';

export class CreateLabelDto {
  @IsString()
  @MaxLength(100)
  name: string;

  @IsString()
  @IsOptional()
  @Matches(/^#[0-9a-fA-F]{6}$/)
  color?: string;

  @IsUUID()
  @IsOptional()
  projectId?: string;
}
