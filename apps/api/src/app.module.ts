import { Controller, Get, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthGuard } from './common/auth.guard';
import { Public } from './common/context';
import { CoreModule } from './common/core';
import { DbModule } from './db/db';
import { AdminModule } from './modules/admin/admin.module';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { AuthModule } from './modules/auth/auth.module';
import { BillingModule } from './modules/billing/billing.module';
import { ClaimsModule } from './modules/claims/claims.module';
import { CompanyModule } from './modules/company/company.module';
import { EmployeesModule } from './modules/employees/employees.module';
import { FeedModule } from './modules/feed/feed.module';
import { HomeModule } from './modules/home/home.module';
import { LeaveModule } from './modules/leave/leave.module';
import { MeetingsModule } from './modules/meetings/meetings.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { OnboardingModule } from './modules/onboarding/onboarding.module';
import { PayrollModule } from './modules/payroll/payroll.module';
import { PerformanceModule } from './modules/performance/performance.module';
import { RecruitmentModule } from './modules/recruitment/recruitment.module';
import { ReportsModule } from './modules/reports/reports.module';
import { ServicesModule } from './modules/services/services.module';
import { ShiftsModule } from './modules/shifts/shifts.module';
import { SurveysModule } from './modules/surveys/surveys.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { TeamModule } from './modules/team/team.module';
import { TimesheetsModule } from './modules/timesheets/timesheets.module';
import { TrainingModule } from './modules/training/training.module';

@Controller()
class HealthController {
  @Public() @Get('health') health() { return { ok: true, time: new Date().toISOString() }; }
}

@Module({
  imports: [
    DbModule, CoreModule,
    JwtModule.register({ global: true, secret: process.env.JWT_SECRET, signOptions: { expiresIn: (process.env.JWT_EXPIRES_IN || '7d') as any } }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    AuthModule, CompanyModule, TeamModule, EmployeesModule, AttendanceModule, LeaveModule, TimesheetsModule, ShiftsModule,
    PayrollModule, ClaimsModule, RecruitmentModule, OnboardingModule, PerformanceModule, TrainingModule,
    FeedModule, SurveysModule, ServicesModule, TasksModule, MeetingsModule, NotificationsModule, ReportsModule,
    BillingModule, AdminModule, HomeModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule {}
