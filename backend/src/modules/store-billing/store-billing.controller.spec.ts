import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PurchasePlatform } from './dto/validate-purchase.dto';
import { StoreBillingController } from './store-billing.controller';
import { StoreBillingService } from './store-billing.service';
import type { ReceiptVerifierService } from './receipt-verifier.service';

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

function setup(
  verified: Record<string, unknown>,
  opts: {
    owner?: string | null;
    otherUserExists?: boolean;
    applyResult?: Record<string, unknown>;
  } = {},
) {
  const verifier = {
    verifyApple: jest.fn().mockResolvedValue({ ok: true, ...verified }),
    verifyAppleNotification: jest.fn(),
  };
  const storeBilling = {
    ownerOfStoreSubscription: jest.fn().mockResolvedValue(opts.owner ?? null),
    userExists: jest.fn().mockResolvedValue(opts.otherUserExists ?? true),
    applyStoreSubscription: jest
      .fn()
      .mockResolvedValue(
        opts.applyResult ?? { plan_id: 'pro', applied: true, current: true },
      ),
    creditStorePack: jest.fn().mockResolvedValue({
      credited: true,
      duplicate: false,
      bonus_swipes: 10,
    }),
    applyAppleNotification: jest.fn(),
  };
  const controller = new StoreBillingController(
    verifier as unknown as ReceiptVerifierService,
    storeBilling as unknown as StoreBillingService,
  );
  return { controller, verifier, storeBilling };
}

const iosDto = (productId: string) => ({
  platform: PurchasePlatform.IOS,
  productId,
  transactionId: 'client-txn',
  purchaseToken: 'jws',
});

describe('StoreBillingController.validate', () => {
  it('grants a subscription bought by this account', async () => {
    const { controller, storeBilling } = setup({
      productId: 'pro_monthly',
      transactionId: '1000',
      active: true,
      appAccountToken: USER.toUpperCase(),
      signedAt: '2026-10-15T20:00:00.000Z',
    });
    const res = await controller.validate(USER, iosDto('pro_monthly'));
    expect(res).toMatchObject({ granted: true, settled: true });
    expect(storeBilling.applyStoreSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER,
        transactionId: '1000',
        signedAt: '2026-10-15T20:00:00.000Z',
      }),
    );
  });

  it('refuses a subscription the app attached to another account', async () => {
    const { controller, storeBilling } = setup({
      productId: 'pro_monthly',
      transactionId: '1000',
      appAccountToken: OTHER,
    });
    const res = await controller.validate(USER, iosDto('pro_monthly'));
    expect(res).toMatchObject({
      granted: false,
      ownedElsewhere: true,
      settled: true,
    });
    expect(storeBilling.applyStoreSubscription).not.toHaveBeenCalled();
  });

  it("lets the signed-in account claim a deleted account's subscription", async () => {
    const { controller, storeBilling } = setup(
      {
        productId: 'pro_monthly',
        transactionId: '1000',
        appAccountToken: OTHER,
      },
      { otherUserExists: false },
    );
    const res = await controller.validate(USER, iosDto('pro_monthly'));
    expect(res.granted).toBe(true);
    expect(storeBilling.applyStoreSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER }),
    );
  });

  it('refuses a subscription already recorded against another account', async () => {
    const { controller, storeBilling } = setup(
      {
        productId: 'pro_monthly',
        transactionId: '1000',
        appAccountToken: null,
      },
      { owner: OTHER },
    );
    const res = await controller.validate(USER, iosDto('pro_monthly'));
    expect(res).toMatchObject({ granted: false, ownedElsewhere: true });
    expect(storeBilling.applyStoreSubscription).not.toHaveBeenCalled();
  });

  it('leaves a subscription unsettled while a Stripe plan is in force', async () => {
    const { controller } = setup(
      { productId: 'pro_monthly', transactionId: '1000', active: true },
      {
        applyResult: {
          plan_id: 'elite',
          applied: false,
          reason: 'stripe',
          current: false,
        },
      },
    );
    const res = await controller.validate(USER, iosDto('pro_monthly'));
    expect(res).toMatchObject({ granted: false, settled: false });
  });

  it('settles a stale subscription without granting it', async () => {
    const { controller } = setup(
      { productId: 'pro_monthly', transactionId: '1000', active: true },
      {
        applyResult: {
          plan_id: 'basic',
          applied: false,
          reason: 'stale',
          current: true,
        },
      },
    );
    const res = await controller.validate(USER, iosDto('pro_monthly'));
    expect(res).toMatchObject({ granted: false, settled: true });
  });

  it('refuses a refunded Draft pack but settles it', async () => {
    const { controller, storeBilling } = setup({
      productId: 'drafts_10',
      transactionId: '2000',
      active: false,
    });
    const res = await controller.validate(USER, iosDto('drafts_10'));
    expect(res).toMatchObject({ granted: false, settled: true });
    expect(storeBilling.creditStorePack).not.toHaveBeenCalled();
  });

  it('credits a Draft pack', async () => {
    const { controller, storeBilling } = setup({
      productId: 'drafts_10',
      transactionId: '2000',
      active: true,
    });
    const res = await controller.validate(USER, iosDto('drafts_10'));
    expect(res).toMatchObject({ granted: true, settled: true });
    expect(storeBilling.creditStorePack).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER }),
    );
  });

  it('credits a pack bought by another existing account to that account', async () => {
    const { controller, storeBilling } = setup({
      productId: 'drafts_10',
      transactionId: '2000',
      active: true,
      appAccountToken: OTHER.toUpperCase(),
    });
    const res = await controller.validate(USER, iosDto('drafts_10'));
    expect(res).toMatchObject({
      granted: false,
      ownedElsewhere: true,
      settled: true,
    });
    expect(storeBilling.creditStorePack).toHaveBeenCalledTimes(1);
    expect(storeBilling.creditStorePack).toHaveBeenCalledWith(
      expect.objectContaining({ userId: OTHER }),
    );
  });

  it('does not settle a pack whose credit failed', async () => {
    const { controller, storeBilling } = setup({
      productId: 'drafts_10',
      transactionId: '2000',
      active: true,
    });
    storeBilling.creditStorePack.mockRejectedValue(
      new ServiceUnavailableException(),
    );
    await expect(
      controller.validate(USER, iosDto('drafts_10')),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});

describe('StoreBillingController.appleNotification', () => {
  it('rejects a notification that fails verification', async () => {
    const { controller, verifier, storeBilling } = setup({});
    verifier.verifyAppleNotification.mockResolvedValue({
      ok: false,
      reason: 'Chain does not terminate at Apple',
    });
    await expect(
      controller.appleNotification({ signedPayload: 'forged' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(storeBilling.applyAppleNotification).not.toHaveBeenCalled();
  });
});

// ------------------------------------------------- the real service, fake DB

type Row = Record<string, unknown>;

/**
 * Just enough of the Supabase client for StoreBillingService: reads end in
 * maybeSingle(), writes are awaited, rpc() returns a canned result.
 */
function fakeDb(opts: {
  row?: Row | null;
  readError?: { message: string } | null;
  written?: Row[];
  rpc?: { data: unknown; error: { message: string } | null };
  usersFound?: boolean;
}) {
  const calls = {
    updates: [] as { table: string; payload: Row }[],
    ors: [] as string[],
    rpc: [] as { name: string; args: Row }[],
  };
  const client = {
    from(table: string) {
      let isUpdate = false;
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        in: () => chain,
        or: (filter: string) => {
          calls.ors.push(filter);
          return chain;
        },
        update: (payload: Row) => {
          isUpdate = true;
          calls.updates.push({ table, payload });
          return chain;
        },
        maybeSingle: () =>
          Promise.resolve(
            table === 'users'
              ? {
                  data: opts.usersFound === false ? null : { id: 'x' },
                  error: null,
                }
              : { data: opts.row ?? null, error: opts.readError ?? null },
          ),
        then: (
          resolve: (v: unknown) => unknown,
          reject: (e: unknown) => unknown,
        ) =>
          Promise.resolve(
            isUpdate && table === 'subscriptions'
              ? { data: opts.written ?? [{ user_id: USER }], error: null }
              : { data: null, error: null },
          ).then(resolve, reject),
      };
      return chain;
    },
    rpc: (name: string, args: Row) => {
      calls.rpc.push({ name, args });
      return Promise.resolve(
        opts.rpc ?? {
          data: { credited: true, bonus_swipes: 10 },
          error: null,
        },
      );
    },
  };
  const svc = new StoreBillingService({
    getAdminClient: () => client,
  } as never);
  return { svc, calls };
}

const freeRow: Row = {
  plan_id: 'basic',
  status: 'active',
  store: 'stripe',
  store_transaction_id: null,
  stripe_subscription_id: null,
  store_signed_at: null,
  current_period_end: null,
};

const appleProRow: Row = {
  plan_id: 'pro',
  status: 'active',
  store: 'apple',
  store_transaction_id: '1000',
  stripe_subscription_id: null,
  store_signed_at: '2026-10-15T20:00:00.000Z',
  current_period_end: '2026-11-15T20:00:00.000Z',
};

const subParams = (extra: Row = {}) => ({
  userId: USER,
  store: 'apple' as const,
  productId: 'pro_monthly',
  transactionId: '1000',
  periodStart: '2026-10-15T20:00:00.000Z',
  periodEnd: '2026-11-15T20:00:00.000Z',
  active: true,
  signedAt: '2026-10-15T21:00:00.000Z',
  ...extra,
});

describe('StoreBillingService.applyStoreSubscription', () => {
  it('grants a plan, records when Apple signed it, and drops any lapsed Stripe link', async () => {
    const { svc, calls } = fakeDb({ row: freeRow });
    const res = await svc.applyStoreSubscription(subParams());
    expect(res).toMatchObject({ applied: true, plan_id: 'pro', current: true });
    const sub = calls.updates.find((u) => u.table === 'subscriptions')!;
    expect(sub.payload).toMatchObject({
      plan_id: 'pro',
      store: 'apple',
      store_signed_at: '2026-10-15T21:00:00.000Z',
      stripe_subscription_id: null,
    });
    expect(calls.ors[0]).toContain(
      'store_signed_at.lt."2026-10-15T21:00:00.000Z"',
    );
  });

  it('skips data signed before what is stored (late or replayed)', async () => {
    const { svc, calls } = fakeDb({ row: appleProRow, written: [] });
    const res = await svc.applyStoreSubscription(
      subParams({ active: false, signedAt: '2026-10-15T19:00:00.000Z' }),
    );
    expect(res).toMatchObject({ applied: false, reason: 'stale' });
    expect(calls.updates.filter((u) => u.table === 'users')).toHaveLength(0);
  });

  it('never overwrites a Stripe plan in force', async () => {
    const { svc, calls } = fakeDb({
      row: { ...freeRow, plan_id: 'elite', stripe_subscription_id: 'sub_1' },
    });
    const res = await svc.applyStoreSubscription(subParams());
    expect(res).toMatchObject({ applied: false, reason: 'stripe' });
    expect(calls.updates).toHaveLength(0);
  });

  it('never overwrites another store subscription in force', async () => {
    const { svc, calls } = fakeDb({
      row: { ...appleProRow, store_transaction_id: '9999' },
    });
    const res = await svc.applyStoreSubscription(subParams());
    expect(res).toMatchObject({ applied: false, reason: 'other_store' });
    expect(calls.updates).toHaveLength(0);
  });

  it('ignores the end of a subscription that is not the current one', async () => {
    const { svc, calls } = fakeDb({
      row: { ...appleProRow, store_transaction_id: '9999' },
    });
    const res = await svc.applyStoreSubscription(subParams({ active: false }));
    expect(res).toMatchObject({ applied: false, reason: 'not_current' });
    expect(calls.updates).toHaveLength(0);
  });

  it('does not let a refund of an older period downgrade the current one', async () => {
    const { svc, calls } = fakeDb({ row: appleProRow });
    const res = await svc.applyStoreSubscription(
      subParams({ active: false, periodEnd: '2026-10-15T20:00:00.000Z' }),
    );
    expect(res).toMatchObject({ applied: false, reason: 'older_period' });
    expect(calls.updates).toHaveLength(0);
  });

  it('downgrades when the current period is refunded or expires', async () => {
    const { svc, calls } = fakeDb({ row: appleProRow });
    const res = await svc.applyStoreSubscription(subParams({ active: false }));
    expect(res).toMatchObject({ applied: true, plan_id: 'basic' });
    const sub = calls.updates.find((u) => u.table === 'subscriptions')!;
    expect(sub.payload).toMatchObject({ plan_id: 'basic', status: 'canceled' });
    expect(sub.payload).not.toHaveProperty('stripe_subscription_id');
  });

  it('fails, so the caller retries, when the row cannot be read', async () => {
    const { svc } = fakeDb({ row: null, readError: { message: 'reset' } });
    await expect(
      svc.applyStoreSubscription(subParams()),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});

describe('StoreBillingService.creditStorePack', () => {
  const pack = {
    userId: USER,
    store: 'apple' as const,
    productId: 'drafts_50',
    transactionId: '2000',
  };

  it('records and credits the pack in one database call', async () => {
    const { svc, calls } = fakeDb({});
    const res = await svc.creditStorePack(pack);
    expect(res).toEqual({ credited: true, duplicate: false, bonus_swipes: 10 });
    expect(calls.rpc).toEqual([
      {
        name: 'credit_store_pack',
        args: expect.objectContaining({
          p_user_id: USER,
          p_transaction_id: '2000',
          p_swipes: 50,
        }),
      },
    ]);
    expect(calls.updates).toHaveLength(0);
  });

  it('reports a repeat of the same transaction as a duplicate', async () => {
    const { svc } = fakeDb({
      rpc: { data: { credited: false, bonus_swipes: 60 }, error: null },
    });
    await expect(svc.creditStorePack(pack)).resolves.toMatchObject({
      credited: false,
      duplicate: true,
    });
  });

  it('fails with a 5xx when the credit fails, so the purchase is retried', async () => {
    const { svc } = fakeDb({
      rpc: { data: null, error: { message: 'no subscriptions row' } },
    });
    await expect(svc.creditStorePack(pack)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});

describe('StoreBillingService.applyAppleNotification', () => {
  function service(owner: string | null) {
    const svc = new StoreBillingService({} as never);
    jest.spyOn(svc, 'ownerOfStoreSubscription').mockResolvedValue(owner);
    const apply = jest
      .spyOn(svc, 'applyStoreSubscription')
      .mockResolvedValue({ plan_id: 'basic', applied: true, current: true });
    return { svc, apply };
  }

  const purchase = (extra: Record<string, unknown>) => ({
    ok: true,
    productId: 'pro_monthly',
    transactionId: '1000',
    purchasedAt: null,
    expiresAt: '2026-01-01T00:00:00.000Z',
    ...extra,
  });

  it('downgrades the owner when the subscription expires, ordered by the envelope date', async () => {
    const { svc, apply } = service(USER);
    await svc.applyAppleNotification({
      notificationType: 'EXPIRED',
      subtype: 'VOLUNTARY',
      purchase: purchase({ active: false }),
      signedAt: '2026-10-15T22:00:00.000Z',
    });
    expect(apply).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER,
        active: false,
        signedAt: '2026-10-15T22:00:00.000Z',
      }),
    );
  });

  it('ignores notifications that are not about entitlement', async () => {
    const { svc, apply } = service(USER);
    for (const notificationType of ['CONSUMPTION_REQUEST', 'REFUND_DECLINED']) {
      await svc.applyAppleNotification({
        notificationType,
        subtype: null,
        purchase: purchase({ active: false }),
        signedAt: null,
      });
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it('never assigns a purchase to the account named by its token alone', async () => {
    // The buyer's device picks appAccountToken. Trusting it here let a buyer
    // stamp a victim's user id on a purchase, then grant or downgrade the
    // victim's plan through notifications.
    const { svc, apply } = service(null);
    await svc.applyAppleNotification({
      notificationType: 'SUBSCRIBED',
      subtype: 'INITIAL_BUY',
      purchase: purchase({ active: true, appAccountToken: USER.toUpperCase() }),
      signedAt: null,
    });
    await svc.applyAppleNotification({
      notificationType: 'REFUND',
      subtype: null,
      purchase: purchase({ active: false, appAccountToken: OTHER }),
      signedAt: null,
    });
    expect(apply).not.toHaveBeenCalled();
  });

  it('fails, so Apple retries, when the owner lookup itself fails', async () => {
    const { svc } = fakeDb({
      row: null,
      readError: { message: 'connection reset' },
    });
    const apply = jest.spyOn(svc, 'applyStoreSubscription');
    await expect(
      svc.applyAppleNotification({
        notificationType: 'REFUND',
        subtype: null,
        purchase: purchase({ active: false }),
        signedAt: null,
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(apply).not.toHaveBeenCalled();
  });

  it('ignores notifications with no transaction or no account', async () => {
    const { svc, apply } = service(null);
    await svc.applyAppleNotification({
      notificationType: 'DID_RENEW',
      subtype: null,
      purchase: null,
      signedAt: null,
    });
    await svc.applyAppleNotification({
      notificationType: 'DID_RENEW',
      subtype: null,
      purchase: purchase({ active: true, appAccountToken: null }),
      signedAt: null,
    });
    expect(apply).not.toHaveBeenCalled();
  });
});
