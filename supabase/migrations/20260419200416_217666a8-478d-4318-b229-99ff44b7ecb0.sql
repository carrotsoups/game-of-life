-- Rooms
CREATE TABLE public.rooms (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  teacher_id UUID,
  phase INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'waiting',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Participants
CREATE TABLE public.participants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'student',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(room_id, name)
);

-- Responses
CREATE TABLE public.responses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  participant_id UUID NOT NULL REFERENCES public.participants(id) ON DELETE CASCADE,
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  phase INT NOT NULL,
  answer JSONB NOT NULL,
  submitted BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(participant_id, phase)
);

-- Assignments (final shuffled life plan per student)
CREATE TABLE public.assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  participant_id UUID NOT NULL REFERENCES public.participants(id) ON DELETE CASCADE,
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  assigned_plan JSONB NOT NULL,
  correct_value NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(participant_id)
);

-- Final submissions (calculation attempts)
CREATE TABLE public.final_submissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  participant_id UUID NOT NULL REFERENCES public.participants(id) ON DELETE CASCADE,
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  user_value NUMERIC NOT NULL,
  is_correct BOOLEAN NOT NULL DEFAULT false,
  attempts INT NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(participant_id)
);

-- Enable RLS
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.final_submissions ENABLE ROW LEVEL SECURITY;

-- Open policies (no auth: classroom is gated by knowledge of the room code)
CREATE POLICY "rooms_select" ON public.rooms FOR SELECT USING (true);
CREATE POLICY "rooms_insert" ON public.rooms FOR INSERT WITH CHECK (true);
CREATE POLICY "rooms_update" ON public.rooms FOR UPDATE USING (true);

CREATE POLICY "participants_select" ON public.participants FOR SELECT USING (true);
CREATE POLICY "participants_insert" ON public.participants FOR INSERT WITH CHECK (true);
CREATE POLICY "participants_delete" ON public.participants FOR DELETE USING (true);

CREATE POLICY "responses_select" ON public.responses FOR SELECT USING (true);
CREATE POLICY "responses_insert" ON public.responses FOR INSERT WITH CHECK (true);
CREATE POLICY "responses_update" ON public.responses FOR UPDATE USING (true);

CREATE POLICY "assignments_select" ON public.assignments FOR SELECT USING (true);
CREATE POLICY "assignments_insert" ON public.assignments FOR INSERT WITH CHECK (true);

CREATE POLICY "final_select" ON public.final_submissions FOR SELECT USING (true);
CREATE POLICY "final_insert" ON public.final_submissions FOR INSERT WITH CHECK (true);
CREATE POLICY "final_update" ON public.final_submissions FOR UPDATE USING (true);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE public.participants;
ALTER PUBLICATION supabase_realtime ADD TABLE public.responses;
ALTER PUBLICATION supabase_realtime ADD TABLE public.assignments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.final_submissions;

ALTER TABLE public.rooms REPLICA IDENTITY FULL;
ALTER TABLE public.participants REPLICA IDENTITY FULL;
ALTER TABLE public.responses REPLICA IDENTITY FULL;
ALTER TABLE public.assignments REPLICA IDENTITY FULL;
ALTER TABLE public.final_submissions REPLICA IDENTITY FULL;