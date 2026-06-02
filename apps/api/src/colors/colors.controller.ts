import {
  Controller,
  Get,
  Put,
  Delete,
  Param,
  Body,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ColorsService } from './colors.service';

@Controller('colors')
@UseGuards(JwtAuthGuard)
export class ColorsController {
  constructor(private readonly colorsService: ColorsService) {}

  @Get()
  getThoughtColors(@Req() req: Request) {
    const { userId } = req.user as { userId: string };
    return this.colorsService.getThoughtColors(userId);
  }

  @Put('thought/:thoughtId')
  setThoughtColor(
    @Req() req: Request,
    @Param('thoughtId') thoughtId: string,
    @Body() body: { hex: string },
  ) {
    const { userId } = req.user as { userId: string };
    return this.colorsService.setThoughtColor(userId, thoughtId, body.hex);
  }

  @Delete('thought/:thoughtId')
  clearThoughtColor(
    @Req() req: Request,
    @Param('thoughtId') thoughtId: string,
  ) {
    const { userId } = req.user as { userId: string };
    return this.colorsService.clearThoughtColor(userId, thoughtId);
  }
}
