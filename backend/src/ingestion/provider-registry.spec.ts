import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.schema';
import { ProviderRegistry } from './provider-registry';
import { FixtureProvider } from './providers/fixture.provider';
import { TicketmasterProvider } from './providers/ticketmaster.provider';
import { EditorialProvider } from './providers/editorial.provider';
import { StudentProgramsProvider } from './providers/student-programs.provider';

function makeRegistry(fixturesOn: boolean): ProviderRegistry {
  const config = {
    get: (key: string) => (key === 'APP_ENV' ? (fixturesOn ? 'development' : 'production') : false),
  } as unknown as ConfigService<Env, true>;
  return new ProviderRegistry(
    new FixtureProvider(),
    new TicketmasterProvider(config),
    new EditorialProvider(),
    new StudentProgramsProvider(),
    config,
  );
}

describe('ProviderRegistry', () => {
  it('always registers student-programs, even with fixtures disabled', () => {
    const reg = makeRegistry(false);
    const provider = reg.get('student-programs');
    expect(provider).toBeDefined();
    expect(provider!.trust).toBe('editorial');
  });

  it('keeps the dev-only editorial provider gated behind fixtures', () => {
    expect(makeRegistry(false).get('editorial')).toBeUndefined();
    expect(makeRegistry(true).get('editorial')).toBeDefined();
  });
});
