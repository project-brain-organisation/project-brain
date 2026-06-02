import { Module } from '@nestjs/common';
import { ThoughtsController } from './thoughts.controller';
import { ThoughtsService } from './thoughts.service';
import { EmbeddingModule } from '../embedding/embedding.module';
import { ChunkingModule } from '../chunking/chunking.module';

@Module({
  imports: [EmbeddingModule, ChunkingModule],
  controllers: [ThoughtsController],
  providers: [ThoughtsService],
  exports: [ThoughtsService],
})
export class ThoughtsModule {}
