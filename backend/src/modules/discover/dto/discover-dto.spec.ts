import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { DiscoverQueryDto } from './discover-query.dto';
import { SwipeDto } from './swipe.dto';

// The same options the global ValidationPipe uses (main.ts). Implicit
// conversion is what made the string "false" read as true.
const pipe = { enableImplicitConversion: true };

describe('Discover DTO booleans', () => {
  it('reads "false" in the feed query as false', () => {
    const dto = plainToInstance(
      DiscoverQueryDto,
      { includeInternational: 'false', verifiedRecruitersOnly: 'false' },
      pipe,
    );
    expect(dto.includeInternational).toBe(false);
    expect(dto.verifiedRecruitersOnly).toBe(false);
    expect(validateSync(dto)).toHaveLength(0);
  });

  it('reads "true" in the feed query as true', () => {
    const dto = plainToInstance(
      DiscoverQueryDto,
      { includeInternational: 'true', verifiedRecruitersOnly: 'true' },
      pipe,
    );
    expect(dto.includeInternational).toBe(true);
    expect(dto.verifiedRecruitersOnly).toBe(true);
  });

  it('caps the feed page size', () => {
    const tooMany = plainToInstance(DiscoverQueryDto, { limit: '100000' }, pipe);
    expect(validateSync(tooMany).map((e) => e.property)).toContain('limit');
    const fine = plainToInstance(DiscoverQueryDto, { limit: '20' }, pipe);
    expect(validateSync(fine)).toHaveLength(0);
  });

  it('does not spend a Super Draft on the string "false"', () => {
    const base = {
      targetUserId: '11111111-1111-4111-8111-111111111111',
      direction: 'draft',
    };
    expect(plainToInstance(SwipeDto, { ...base, isSuper: 'false' }, pipe).isSuper).toBe(false);
    expect(plainToInstance(SwipeDto, { ...base, isSuper: false }, pipe).isSuper).toBe(false);
    // Not sent at all (older builds): left undefined, which is not a Super Draft.
    expect(plainToInstance(SwipeDto, base, pipe).isSuper).toBeUndefined();
    expect(plainToInstance(SwipeDto, { ...base, isSuper: true }, pipe).isSuper).toBe(true);
    expect(plainToInstance(SwipeDto, { ...base, isSuper: 'true' }, pipe).isSuper).toBe(true);
  });
});
