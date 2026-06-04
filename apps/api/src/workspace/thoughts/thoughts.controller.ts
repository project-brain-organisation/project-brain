import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ThoughtsService } from './thoughts.service';
import {
  ZodValidationPipe,
  createThoughtSchema,
  type CreateThoughtRequest,
} from '../validation';
import { UpdateThoughtDto } from './dto/update-thought.dto';

@Controller('workspace/thoughts')
@UseGuards(JwtAuthGuard)
export class ThoughtsController {
  constructor(private readonly thoughtsService: ThoughtsService) {}

  @Post()
  create(
    @Req() req: any,
    @Body(new ZodValidationPipe(createThoughtSchema)) dto: CreateThoughtRequest,
  ) {
    return this.thoughtsService.create(req.user.sub, dto);
  }

  @Get(':id')
  findOne(@Req() req: any, @Param('id') id: string) {
    return this.thoughtsService.findOne(req.user.sub, id);
  }

  @Patch(':id/color')
  setColor(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateThoughtDto) {
    return this.thoughtsService.setColor(req.user.sub, id, dto.color!);
  }

  @Delete(':id/color')
  clearColor(@Req() req: any, @Param('id') id: string) {
    return this.thoughtsService.clearColor(req.user.sub, id);
  }

  @Delete(':id')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.thoughtsService.remove(req.user.sub, id);
  }
}
