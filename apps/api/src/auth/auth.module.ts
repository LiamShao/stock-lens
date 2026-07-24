import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { DatabaseModule } from '../database/database.module';
import { AccessTokenGuard } from './access-token.guard';
import { AUTH_CONFIG, getAuthConfig } from './auth.config';
import { AuthController } from './auth.controller';
import { AuthRepository } from './auth.repository';
import { AuthService } from './auth.service';
import { PasswordHasher } from './password-hasher';
import { TokenService } from './token.service';

@Module({
  controllers: [AuthController],
  exports: [AccessTokenGuard, AuthService],
  imports: [DatabaseModule, JwtModule.register({})],
  providers: [
    { provide: AUTH_CONFIG, useFactory: getAuthConfig },
    AccessTokenGuard,
    AuthRepository,
    AuthService,
    PasswordHasher,
    TokenService,
  ],
})
export class AuthModule {}
