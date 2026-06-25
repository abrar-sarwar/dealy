import { Test } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { SearchIndexer } from '../src/search/search-indexer.service';

interface Hit {
  id: string;
  title: string;
  category: string;
  isOnline: boolean;
  currentPrice: number;
}
interface SearchRes {
  items: Hit[];
  total: number;
  backend: 'meili' | 'postgres';
}

describe('Search (e2e, public)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    configureApp(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    // Populate the index from the seeded deals.
    const indexer = app.get(SearchIndexer);
    if (indexer.enabled) {
      await indexer.reindexAll();
      // Meilisearch is eventually consistent: a task can report success before the
      // documents are queryable. Wait until the index actually serves results so
      // the assertions below are deterministic across CI runners.
      for (let i = 0; i < 40; i++) {
        const res = await app
          .getHttpAdapter()
          .getInstance()
          .inject({ method: 'GET', url: '/v1/search?q=pizza&limit=1' });
        if (res.statusCode === 200 && (JSON.parse(res.body).items?.length ?? 0) > 0) break;
        await new Promise((r) => setTimeout(r, 500));
      }
    }
  });

  afterAll(async () => {
    await app.close();
  });

  const search = (qs: string) => app.inject({ method: 'GET', url: `/v1/search?${qs}` });

  it('full-text finds pizza deals', async () => {
    const res = await search('q=pizza&limit=50');
    expect(res.statusCode).toBe(200);
    const body = res.json() as SearchRes;
    expect(body.items.length).toBeGreaterThan(0);
    expect(body.items.some((d) => d.title.toLowerCase().includes('pizza'))).toBe(true);
  });

  it('is typo tolerant (pizzza → pizza) when Meili is the backend', async () => {
    // Meili applies one-typo tolerance only to words >= 5 chars by default.
    const body = (await search('q=pizzza&limit=50')).json() as SearchRes;
    if (body.backend === 'meili') {
      expect(body.items.some((d) => d.title.toLowerCase().includes('pizza'))).toBe(true);
    }
  });

  it('filters by category', async () => {
    const body = (await search('category=food&limit=50')).json() as SearchRes;
    expect(body.items.length).toBeGreaterThan(0);
    expect(body.items.every((d) => d.category === 'food')).toBe(true);
  });

  it('filters online-only deals', async () => {
    const body = (await search('online=true&limit=50')).json() as SearchRes;
    expect(body.items.length).toBeGreaterThan(0);
    expect(body.items.every((d) => d.isOnline === true)).toBe(true);
  });

  it('sorts by price ascending', async () => {
    const body = (await search('sort=priceLow&limit=30')).json() as SearchRes;
    for (let i = 1; i < body.items.length; i++) {
      expect(body.items[i].currentPrice).toBeGreaterThanOrEqual(body.items[i - 1].currentPrice);
    }
  });

  it('rejects an unsafe category (filter-injection guard)', async () => {
    const res = await search(`category=${encodeURIComponent('food";DROP')}`);
    expect(res.statusCode).toBe(400);
  });
});
