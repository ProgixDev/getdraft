import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PostsService } from './posts.service';

const ME = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const HOST = 'https://project.supabase.co';
const own = (uid: string, file = 'a.jpg') =>
  `${HOST}/storage/v1/object/public/posts/${uid}/${file}`;

type Tables = Record<string, any[]>;

/**
 * A tiny stand-in for the supabase-js query builder: enough of the chain the
 * service uses, resolving against in-memory tables.
 */
function fakeSupabase(tables: Tables) {
  const inserted: Array<{ table: string; row: any }> = [];
  const deleted: Array<{ table: string; id: unknown }> = [];

  const from = (table: string) => {
    const rows = tables[table] ?? [];
    const filters: Array<(r: any) => boolean> = [];
    let op: 'select' | 'insert' | 'delete' = 'select';
    let payload: any = null;

    const run = () => {
      if (op === 'insert') {
        const row = { id: `new-${inserted.length + 1}`, ...payload };
        inserted.push({ table, row });
        return { data: row, error: null };
      }
      const hit = rows.filter((r) => filters.every((f) => f(r)));
      if (op === 'delete') {
        hit.forEach((r) => deleted.push({ table, id: r.id }));
        return { data: null, error: null };
      }
      return { data: hit, error: null };
    };

    const builder: any = {
      select: () => builder,
      insert: (row: any) => ((op = 'insert'), (payload = row), builder),
      delete: () => ((op = 'delete'), builder),
      eq: (col: string, val: unknown) => (filters.push((r) => r[col] === val), builder),
      in: (col: string, vals: unknown[]) => (filters.push((r) => vals.includes(r[col])), builder),
      not: () => builder,
      or: (expr: string) => {
        // Only the blocks lookup uses .or(): "blocker_id.eq.X,blocked_id.eq.X"
        const id = expr.split('.eq.')[1].split(',')[0];
        filters.push((r) => r.blocker_id === id || r.blocked_id === id);
        return builder;
      },
      order: () => builder,
      range: () => builder,
      limit: () => builder,
      single: async () => {
        const res = run();
        return { data: Array.isArray(res.data) ? (res.data[0] ?? null) : res.data, error: null };
      },
      maybeSingle: async () => {
        const res = run();
        return { data: Array.isArray(res.data) ? (res.data[0] ?? null) : res.data, error: null };
      },
      then: (resolve: (v: any) => void) => resolve(run()),
    };
    return builder;
  };

  return { client: { from }, inserted, deleted };
}

function setup(tables: Tables) {
  const fake = fakeSupabase(tables);
  const service = new PostsService({ getAdminClient: () => fake.client } as never);
  return { service, ...fake };
}

describe('PostsService', () => {
  const envUrl = process.env.SUPABASE_URL;
  beforeEach(() => {
    process.env.SUPABASE_URL = HOST;
  });
  afterAll(() => {
    process.env.SUPABASE_URL = envUrl;
  });

  describe('create', () => {
    const post = (mediaUrl: string, thumbnailUrl?: string) => ({
      kind: 'post' as const,
      mediaType: 'image' as const,
      mediaUrl,
      thumbnailUrl,
    });

    it('accepts a file the author uploaded to the posts bucket', async () => {
      const { service, inserted } = setup({ users: [{ id: ME, name: 'Me' }] });
      await service.create(ME, post(own(ME)));
      expect(inserted.map((i) => i.table)).toEqual(['posts']);
    });

    it('accepts the signed form of the same file', async () => {
      const { service, inserted } = setup({ users: [{ id: ME }] });
      await service.create(
        ME,
        post(`${HOST}/storage/v1/object/sign/posts/${ME}/a.jpg?token=abc`),
      );
      expect(inserted).toHaveLength(1);
    });

    it.each([
      ['an outside host', 'https://attacker.example/p.jpg'],
      ["someone else's folder", own(OTHER)],
      ['another bucket', `${HOST}/storage/v1/object/public/photos/${ME}/a.jpg`],
      ['the right path on another host', own(ME).replace('project', 'evil')],
      ['a path that only starts like the folder', `${HOST}/storage/v1/object/public/posts/${ME}`],
    ])('refuses %s', async (_what, url) => {
      const { service, inserted } = setup({ users: [{ id: ME }] });
      await expect(service.create(ME, post(url))).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(inserted).toHaveLength(0);
    });

    it('holds the thumbnail to the same rule', async () => {
      const { service } = setup({ users: [{ id: ME }] });
      await expect(
        service.create(ME, post(own(ME), 'https://attacker.example/t.jpg')),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('blocks', () => {
    const tables = (): Tables => ({
      posts: [{ id: 'p1', user_id: OTHER }],
      blocks: [{ blocker_id: OTHER, blocked_id: ME }],
      post_comments: [{ id: 'c1', user_id: ME, post_id: 'p1' }],
    });

    it('refuses a like and a comment across a block', async () => {
      const { service, inserted } = setup(tables());
      await expect(service.like(ME, 'p1')).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        service.addComment(ME, 'p1', { text: 'hi' } as never),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(inserted).toHaveLength(0);
    });

    it('hides a blocked user\'s posts on their profile', async () => {
      const { service } = setup(tables());
      await expect(service.getUserPosts(ME, OTHER)).resolves.toEqual({ posts: [] });
    });

    it('lets the author of a post delete a comment under it', async () => {
      const { service, deleted } = setup(tables());
      await service.deleteComment(OTHER, 'c1');
      expect(deleted).toEqual([{ table: 'post_comments', id: 'c1' }]);
    });

    it('still refuses a stranger deleting someone else\'s comment', async () => {
      const { service, deleted } = setup(tables());
      await expect(
        service.deleteComment('33333333-3333-4333-8333-333333333333', 'c1'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(deleted).toHaveLength(0);
    });
  });
});
