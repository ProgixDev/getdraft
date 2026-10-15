-- 049_store_billing_hardening.sql
--
-- Two fixes for purchases made through the App Store and Google Play
-- (docs/IAP_FIXES_BEFORE_LAUNCH.md, items A1, A2 and A5).
--
--   1. subscriptions.store_signed_at
--      When the store signed the state last written to the row. Apple
--      delivers notifications late, out of order and more than once, and a
--      signed transaction is a snapshot a user can replay. A store write is
--      applied only when it was signed after the one already stored, so an
--      old DID_RENEW cannot undo a refund and an old EXPIRED cannot
--      downgrade someone who resubscribed.
--
--   2. credit_store_pack()
--      Records a Draft pack and adds its Drafts in one transaction. The
--      store path used to insert the ledger row with status 'granted', which
--      the status CHECK refuses, so every store pack failed; then it read and
--      rewrote bonus_swipes in two steps, so two packs credited at once lost
--      one of them, and a failed credit after the ledger insert left the
--      purchase recorded but never paid out.

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS store_signed_at TIMESTAMPTZ;

COMMENT ON COLUMN public.subscriptions.store_signed_at IS
  'When the App Store / Play signed the state last applied to this row. '
  'Older store data is ignored. See migration 049.';

CREATE OR REPLACE FUNCTION public.credit_store_pack(
  p_user_id UUID,
  p_store TEXT,
  p_transaction_id TEXT,
  p_pack_id TEXT,
  p_swipes INTEGER,
  p_amount_cents INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_balance INTEGER;
BEGIN
  IF p_swipes IS NULL OR p_swipes <= 0 THEN
    RAISE EXCEPTION 'credit_store_pack: invalid pack size %', p_swipes;
  END IF;

  -- The unique index on store_transaction_id makes a retried transaction a
  -- no-op instead of a second credit.
  INSERT INTO public.swipe_pack_purchases
    (user_id, store, store_transaction_id, pack_id, swipes_granted,
     amount_cents, status, granted_at)
  VALUES
    (p_user_id, p_store, p_transaction_id, p_pack_id, p_swipes,
     COALESCE(p_amount_cents, 0), 'succeeded', now())
  ON CONFLICT (store_transaction_id) WHERE store_transaction_id IS NOT NULL
  DO NOTHING;

  IF NOT FOUND THEN
    SELECT s.bonus_swipes INTO v_balance
      FROM public.subscriptions s
     WHERE s.user_id = p_user_id;
    RETURN jsonb_build_object(
      'credited', false, 'bonus_swipes', COALESCE(v_balance, 0));
  END IF;

  UPDATE public.subscriptions s
     SET bonus_swipes = COALESCE(s.bonus_swipes, 0) + p_swipes
   WHERE s.user_id = p_user_id
  RETURNING s.bonus_swipes INTO v_balance;

  -- Raising rolls the ledger insert back too, so the purchase stays
  -- unrecorded and the store offers it again.
  IF NOT FOUND THEN
    RAISE EXCEPTION 'credit_store_pack: no subscriptions row for user %',
      p_user_id;
  END IF;

  RETURN jsonb_build_object('credited', true, 'bonus_swipes', v_balance);
END;
$$;

-- Functions in public are callable through the REST API by default. This one
-- grants Drafts, so only the backend's service role may run it.
REVOKE ALL ON FUNCTION public.credit_store_pack(UUID, TEXT, TEXT, TEXT, INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_store_pack(UUID, TEXT, TEXT, TEXT, INTEGER, INTEGER)
  TO service_role;
