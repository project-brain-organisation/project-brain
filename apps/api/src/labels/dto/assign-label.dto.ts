import { IsUUID } from 'class-validator';

export class AssignLabelDto {
  @IsUUID()
  labelId: string;
}
