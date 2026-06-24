// src/admin/admin.controller.spec.ts
import { AdminController } from './admin.controller';
import type { AdminService } from './admin.service';
import type { AuditService } from './audit.service';
import type { CoverageService } from '../coverage/coverage.service';
import type { ModerationService } from './moderation.service';
import type { AuthUser } from '../auth/auth.types';
import type { ModerationQueueQuery, RejectDto } from './moderation.dto';

describe('AdminController moderation routes', () => {
  const moderation = {
    queue: jest.fn(async () => [{ id: 'd1' }]),
    approve: jest.fn(async () => ({ id: 'd1', status: 'published' })),
    reject: jest.fn(async () => ({ id: 'd1', status: 'archived' })),
    edit: jest.fn(async () => ({ id: 'd1' })),
  };
  const ctrl = new AdminController(
    {} as unknown as AdminService,
    {} as unknown as AuditService,
    {} as unknown as CoverageService,
    moderation as unknown as ModerationService,
  );
  const actor = { id: 'admin' } as unknown as AuthUser;

  it('queue delegates with filters', async () => {
    await ctrl.moderationQueue({ category: 'food', limit: 10 } as unknown as ModerationQueueQuery);
    expect(moderation.queue).toHaveBeenCalledWith({
      source: undefined,
      category: 'food',
      limit: 10,
    });
  });
  it('approve delegates', async () => {
    expect(await ctrl.approve(actor, 'd1')).toEqual({ id: 'd1', status: 'published' });
    expect(moderation.approve).toHaveBeenCalledWith('admin', 'd1');
  });
  it('reject delegates the reason', async () => {
    await ctrl.reject(actor, 'd1', { reason: 'spam' } as unknown as RejectDto);
    expect(moderation.reject).toHaveBeenCalledWith('admin', 'd1', 'spam');
  });
});
