// src/admin/moderation.service.spec.ts
import { ModerationService } from './moderation.service';

function make() {
  const updates: any[] = [];
  const audits: any[] = [];
  const prisma = {
    deal: {
      findMany: async () => [{ id: 'd1', confidenceScore: 90 }],
      findUnique: async () => ({ id: 'd1', title: 'old', latitude: 1, status: 'draft' }),
      update: async ({ where, data }: any) => { updates.push({ id: where.id, data }); return { id: where.id, ...data }; },
    },
  };
  const search = { upsertDeals: async () => {}, removeDeal: async () => {} };
  const audit = { log: async (...a: any[]) => { audits.push(a); } };
  return { svc: new ModerationService(prisma as any, search as any, audit as any), updates, audits };
}

describe('ModerationService', () => {
  it('approve publishes + approves + audits', async () => {
    const { svc, updates, audits } = make();
    const r = await svc.approve('admin', 'd1');
    expect(r).toEqual({ id: 'd1', status: 'published' });
    expect(updates[0].data).toMatchObject({ status: 'published', moderationStatus: 'approved' });
    expect(audits[0][1]).toBe('deal.moderate.approve');
  });
  it('reject archives + rejects + audits the reason', async () => {
    const { svc, updates, audits } = make();
    await svc.reject('admin', 'd1', 'spam');
    expect(updates[0].data).toMatchObject({ status: 'archived', moderationStatus: 'rejected' });
    expect(audits[0][3]).toMatchObject({ reason: 'spam' });
  });
  it('edit patches only provided fields and audits a diff', async () => {
    const { svc, updates, audits } = make();
    await svc.edit('admin', 'd1', { title: 'new' });
    expect(updates[0].data).toEqual({ title: 'new' });
    expect(audits[0][1]).toBe('deal.moderate.edit');
  });
});
