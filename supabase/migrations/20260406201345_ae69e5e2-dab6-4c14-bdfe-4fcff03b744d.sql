
-- Create user_plans table for quota tracking
CREATE TABLE public.user_plans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  plan_name TEXT NOT NULL DEFAULT 'free',
  generations_limit INTEGER NOT NULL DEFAULT 5,
  generations_used INTEGER NOT NULL DEFAULT 0,
  exports_limit INTEGER NOT NULL DEFAULT 3,
  exports_used INTEGER NOT NULL DEFAULT 0,
  follow_ups_limit INTEGER NOT NULL DEFAULT 10,
  follow_ups_used INTEGER NOT NULL DEFAULT 0,
  period_start TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  period_end TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '30 days'),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.user_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own plan" ON public.user_plans FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own plan" ON public.user_plans FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own plan" ON public.user_plans FOR UPDATE USING (auth.uid() = user_id);

CREATE TRIGGER update_user_plans_updated_at BEFORE UPDATE ON public.user_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Function to check quota and increment usage atomically (service role only)
CREATE OR REPLACE FUNCTION public.check_and_increment_quota(
  p_user_id UUID,
  p_action_type TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan user_plans%ROWTYPE;
BEGIN
  SELECT * INTO v_plan FROM user_plans WHERE user_id = p_user_id FOR UPDATE;
  
  IF NOT FOUND THEN
    INSERT INTO user_plans (user_id, plan_name) VALUES (p_user_id, 'free');
    SELECT * INTO v_plan FROM user_plans WHERE user_id = p_user_id FOR UPDATE;
  END IF;

  -- Reset if period expired
  IF now() > v_plan.period_end THEN
    UPDATE user_plans SET 
      generations_used = 0, exports_used = 0, follow_ups_used = 0,
      period_start = now(), period_end = now() + interval '30 days'
    WHERE user_id = p_user_id;
    v_plan.generations_used := 0;
    v_plan.exports_used := 0;
    v_plan.follow_ups_used := 0;
  END IF;

  IF p_action_type = 'generation' THEN
    IF v_plan.generations_used >= v_plan.generations_limit THEN RETURN FALSE; END IF;
    UPDATE user_plans SET generations_used = generations_used + 1 WHERE user_id = p_user_id;
  ELSIF p_action_type = 'export' THEN
    IF v_plan.exports_used >= v_plan.exports_limit THEN RETURN FALSE; END IF;
    UPDATE user_plans SET exports_used = exports_used + 1 WHERE user_id = p_user_id;
  ELSIF p_action_type = 'follow_up' THEN
    IF v_plan.follow_ups_used >= v_plan.follow_ups_limit THEN RETURN FALSE; END IF;
    UPDATE user_plans SET follow_ups_used = follow_ups_used + 1 WHERE user_id = p_user_id;
  END IF;

  RETURN TRUE;
END;
$$;
