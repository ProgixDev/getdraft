import { BadRequestException } from '@nestjs/common';
import { PurchasePlatform } from './dto/validate-purchase.dto';
import { StoreBillingController } from './store-billing.controller';
import { StoreBillingService } from './store-billing.service';
import type { ReceiptVerifierService } from './receipt-verifier.service';

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

function setup(verified: Record<string, unknown>, owner: string | null = null) {
  const verifier = {
    verifyApple: jest.fn().mockResolvedValue({ ok: true, ...verified }),
    verifyAppleNotification: jest.fn(),
  };
  const storeBilling = {
    ownerOfStoreSubscription: jest.fn().mockResolvedValue(owner),
    applyStoreSubscription: jest.fn().mockResolvedValue({ plan_id: 'pro' }),
    creditStorePack: jest.fn().mockResolvedValue({ credited: true }),
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
    });
    const res = await controller.validate(USER, iosDto('pro_monthly'));
    expect(res.granted).toBe(true);
    expect(storeBilling.applyStoreSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER, transactionId: '1000' }),
    );
  });

  it('refuses a purchase the app attached to another account', async () => {
    const { controller, storeBilling } = setup({
      productId: 'pro_monthly',
      transactionId: '1000',
      appAccountToken: OTHER,
    });
    const res = await controller.validate(USER, iosDto('pro_monthly'));
    expect(res).toMatchObject({ granted: false, ownedElsewhere: true });
    expect(storeBilling.applyStoreSubscription).not.toHaveBeenCalled();
  });

  it('refuses a subscription already recorded against another account', async () => {
    const { controller, storeBilling } = setup(
      {
        productId: 'pro_monthly',
        transactionId: '1000',
        appAccountToken: null,
      },
      OTHER,
    );
    const res = await controller.validate(USER, iosDto('pro_monthly'));
    expect(res).toMatchObject({ granted: false, ownedElsewhere: true });
    expect(storeBilling.applyStoreSubscription).not.toHaveBeenCalled();
  });

  it('refuses a refunded Draft pack', async () => {
    const { controller, storeBilling } = setup({
      productId: 'drafts_10',
      transactionId: '2000',
      active: false,
    });
    const res = await controller.validate(USER, iosDto('drafts_10'));
    expect(res.granted).toBe(false);
    expect(storeBilling.creditStorePack).not.toHaveBeenCalled();
  });

  it('credits a Draft pack', async () => {
    const { controller, storeBilling } = setup({
      productId: 'drafts_10',
      transactionId: '2000',
      active: true,
    });
    const res = await controller.validate(USER, iosDto('drafts_10'));
    expect(res.granted).toBe(true);
    expect(storeBilling.creditStorePack).toHaveBeenCalled();
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

describe('StoreBillingService.applyAppleNotification', () => {
  function service(owner: string | null) {
    const svc = new StoreBillingService({} as never);
    jest.spyOn(svc, 'ownerOfStoreSubscription').mockResolvedValue(owner);
    const apply = jest
      .spyOn(svc, 'applyStoreSubscription')
      .mockResolvedValue({ plan_id: 'basic' } as never);
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

  it('downgrades the owner when the subscription expires', async () => {
    const { svc, apply } = service(USER);
    await svc.applyAppleNotification({
      notificationType: 'EXPIRED',
      subtype: 'VOLUNTARY',
      purchase: purchase({ active: false }),
    });
    expect(apply).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER, active: false }),
    );
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
    });
    await svc.applyAppleNotification({
      notificationType: 'REFUND',
      subtype: null,
      purchase: purchase({ active: false, appAccountToken: OTHER }),
    });
    expect(apply).not.toHaveBeenCalled();
  });

  it('ignores notifications with no transaction or no account', async () => {
    const { svc, apply } = service(null);
    await svc.applyAppleNotification({
      notificationType: 'TEST',
      subtype: null,
      purchase: null,
    });
    await svc.applyAppleNotification({
      notificationType: 'DID_RENEW',
      subtype: null,
      purchase: purchase({ active: true, appAccountToken: null }),
    });
    expect(apply).not.toHaveBeenCalled();
  });
});
