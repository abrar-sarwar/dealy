// src/admin/admin.controller.spec.ts
import { AdminController } from './admin.controller';

describe('AdminController moderation routes', () => {
  const moderation = {
    queue: jest.fn(async () => [{ id: 'd1' }]),
    approve: jest.fn(async () => ({ id: 'd1', status: 'published' })),
    reject: jest.fn(async () => ({ id: 'd1', status: 'archived' })),
    edit: jest.fn(async () => ({ id: 'd1' })),
  };
  const ctrl = new AdminController({} as any, {} as any, {} as any, moderation as any);
  const actor = { id: 'admin' } as any;

  it('queue delegates with filters', async () => {
    await ctrl.moderationQueue({ category: 'food', limit: 10 } as any);
    expect(moderation.queue).toHaveBeenCalledWith({ source: undefined, category: 'food', limit: 10 });
  });
  it('approve delegates', async () => {
    expect(await ctrl.approve(actor, 'd1')).toEqual({ id: 'd1', status: 'published' });
    expect(moderation.approve).toHaveBeenCalledWith('admin', 'd1');
  });
  it('reject delegates the reason', async () => {
    await ctrl.reject(actor, 'd1', { reason: 'spam' } as any);
    expect(moderation.reject).toHaveBeenCalledWith('admin', 'd1', 'spam');
  });
});
