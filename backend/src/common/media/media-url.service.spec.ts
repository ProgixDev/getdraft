import { MediaUrlService } from './media-url.service';

const PROJECT = 'https://icczjnsevyczfllsiamu.supabase.co';

function makeService(signing: string | undefined = undefined) {
  const supabase = {
    storage: {
      from: (bucket: string) => ({
        getPublicUrl: (path: string) => ({
          data: {
            publicUrl: `${PROJECT}/storage/v1/object/public/${bucket}/${path}`,
          },
        }),
      }),
    },
  };
  return new MediaUrlService(
    { getAdminClient: () => supabase } as any,
    { get: () => signing } as any,
  );
}

describe('MediaUrlService.parse', () => {
  const svc = makeService();

  it('reads a public URL', () => {
    expect(
      svc.parse(`${PROJECT}/storage/v1/object/public/photos/abc/1.jpeg`),
    ).toEqual({ bucket: 'photos', path: 'abc/1.jpeg' });
  });

  // The case that silently rots data if missed: the client is served a
  // signed URL and submits it back on the next save.
  it('reads a signed URL, token and all', () => {
    expect(
      svc.parse(
        `${PROJECT}/storage/v1/object/sign/photos/abc/1.jpeg?token=eyJhbGciOi.x.y`,
      ),
    ).toEqual({ bucket: 'photos', path: 'abc/1.jpeg' });
  });

  it('reads a bare storage path', () => {
    expect(svc.parse('videos/abc/clip.mp4')).toEqual({
      bucket: 'videos',
      path: 'abc/clip.mp4',
    });
  });

  it('leaves the public sports bucket alone', () => {
    expect(
      svc.parse(`${PROJECT}/storage/v1/object/public/sports/soccer.png`),
    ).toBeNull();
  });

  it('ignores foreign hosts', () => {
    expect(svc.parse('https://images.unsplash.com/photo-1234?w=600')).toBeNull();
  });

  it('ignores non-media strings', () => {
    expect(svc.parse('Center Back')).toBeNull();
    expect(svc.parse('')).toBeNull();
    expect(svc.parse(null)).toBeNull();
    expect(svc.parse(42)).toBeNull();
  });

  it('decodes an escaped path so the signed path matches the stored object', () => {
    expect(
      svc.parse(`${PROJECT}/storage/v1/object/public/photos/abc/my%20shot.jpeg`),
    ).toEqual({ bucket: 'photos', path: 'abc/my shot.jpeg' });
  });
});

describe('MediaUrlService.normalizeForStorage', () => {
  const svc = makeService();

  it('turns a signed URL back into the canonical public one', () => {
    expect(
      svc.normalizeForStorage(
        `${PROJECT}/storage/v1/object/sign/photos/abc/1.jpeg?token=xyz`,
      ),
    ).toBe(`${PROJECT}/storage/v1/object/public/photos/abc/1.jpeg`);
  });

  it('leaves an already-canonical URL untouched', () => {
    const url = `${PROJECT}/storage/v1/object/public/photos/abc/1.jpeg`;
    expect(svc.normalizeForStorage(url)).toBe(url);
  });

  it('passes through anything that is not our storage', () => {
    expect(svc.normalizeForStorage('Center Back')).toBe('Center Back');
    expect(svc.normalizeForStorage(7)).toBe(7);
  });
});

describe('MediaUrlService kill switch', () => {
  it('signs nothing when MEDIA_SIGNING=off', async () => {
    const svc = makeService('off');
    expect(svc.enabled).toBe(false);
    const out = await svc.signAll([
      `${PROJECT}/storage/v1/object/public/photos/abc/1.jpeg`,
    ]);
    expect(out.size).toBe(0);
  });

  it('is on by default', () => {
    expect(makeService(undefined).enabled).toBe(true);
  });
});
