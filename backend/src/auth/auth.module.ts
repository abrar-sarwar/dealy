import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { jwksResolverProvider } from './jwks.provider';
import { JwtVerifierService } from './jwt-verifier.service';
import { UserSyncService } from './user-sync.service';
import { AuthGuard } from './auth.guard';
import { RolesGuard } from './roles.guard';

@Global()
@Module({
  providers: [
    jwksResolverProvider,
    JwtVerifierService,
    UserSyncService,
    // Order matters: authenticate first, then authorize by role.
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [JwtVerifierService, UserSyncService],
})
export class AuthModule {}
