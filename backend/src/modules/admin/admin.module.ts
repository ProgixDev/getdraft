import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { ChatModule } from '../chat/chat.module';

@Module({
  // ChatModule: a ban has to drop the user's open chat sockets too.
  imports: [ChatModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
