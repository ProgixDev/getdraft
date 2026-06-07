-- Migration 012: open 1-on-1 DM conversations (independent of matches)
CREATE TABLE IF NOT EXISTS public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  user_b_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  last_message TEXT,
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (user_a_id < user_b_id),
  UNIQUE (user_a_id, user_b_id)
);
CREATE INDEX IF NOT EXISTS idx_conv_a ON public.conversations(user_a_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_conv_b ON public.conversations(user_b_id, last_message_at DESC);

CREATE TABLE IF NOT EXISTS public.direct_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  read_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_dm_conv ON public.direct_messages(conversation_id, created_at);

CREATE OR REPLACE FUNCTION public.touch_conversation() RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.conversations
  SET last_message = NEW.text, last_message_at = NEW.created_at
  WHERE id = NEW.conversation_id;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
DROP TRIGGER IF EXISTS trg_touch_conversation ON public.direct_messages;
CREATE TRIGGER trg_touch_conversation AFTER INSERT ON public.direct_messages
  FOR EACH ROW EXECUTE FUNCTION public.touch_conversation();

ALTER TABLE public.conversations    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.direct_messages  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS conv_sel ON public.conversations;
CREATE POLICY conv_sel ON public.conversations FOR SELECT TO authenticated
  USING (user_a_id = auth.uid() OR user_b_id = auth.uid());

DROP POLICY IF EXISTS dm_sel ON public.direct_messages;
CREATE POLICY dm_sel ON public.direct_messages FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = conversation_id
      AND (c.user_a_id = auth.uid() OR c.user_b_id = auth.uid())
  ));
