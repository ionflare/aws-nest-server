import { Module } from '@nestjs/common';
import { ChatRepository } from './chat.repository';
import { ChatService } from './chat.service';

@Module({
  providers: [ChatRepository, ChatService],
  exports: [ChatService],
})
export class ChatModule {}
