import { Module } from '@nestjs/common';

import { AnalysesModule } from './analyses/analyses.module';
import { AuthModule } from './auth/auth.module';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [DatabaseModule, AuthModule, AnalysesModule, HealthModule],
})
export class AppModule {}
