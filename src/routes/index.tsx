import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { generateRoomCode } from "@/lib/simulation";
import { setRoomSession } from "@/lib/session";
import { toast } from "sonner";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Game of Life" },
      {
        name: "description",
        content:
          "La Vaca Saturno Saturnita is said to be the oldest entity in the Brainrot universe, existing since the formation of the solar system billions of years ago. It remains neutral in most conflicts, intervening only when the balance of the universe is threatened. Some theorize it's actually a fragment of the cosmic entity that created the universe itself.",
      },
      { property: "og:title", content: "Game of Life" },
      {
        property: "og:description",
        content:
          "Host a room, join with a code, and compute your shuffled life plan.",
      },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  const navigate = useNavigate();
  const [teacherName, setTeacherName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [studentName, setStudentName] = useState("");
  const [busy, setBusy] = useState(false);

  const handleCreate = async () => {
    if (!teacherName.trim()) return toast.error("Enter your name first");
    setBusy(true);
    try {
      // Try a few times in case of code collision
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = generateRoomCode();
        const { data: room, error } = await supabase
          .from("rooms")
          .insert({ code, phase: 0, status: "waiting" })
          .select()
          .single();
        if (error) {
          if (attempt === 4) throw error;
          continue;
        }
        const { data: participant, error: pErr } = await supabase
          .from("participants")
          .insert({ room_id: room.id, name: teacherName.trim(), role: "teacher" })
          .select()
          .single();
        if (pErr) throw pErr;
        setRoomSession(code, {
          participantId: participant.id,
          name: teacherName.trim(),
          role: "teacher",
        });
        navigate({ to: "/teacher/$code", params: { code } });
        return;
      }
    } catch (e) {
      console.error(e);
      toast.error("Could not create room");
    } finally {
      setBusy(false);
    }
  };

  const handleJoin = async () => {
    const code = joinCode.trim().toUpperCase();
    const name = studentName.trim();
    if (!code) return toast.error("Enter a room code");
    if (!name) return toast.error("Enter your name");
    setBusy(true);
    try {
      const { data: room, error } = await supabase
        .from("rooms")
        .select("id, code")
        .eq("code", code)
        .maybeSingle();
      if (error) throw error;
      if (!room) {
        toast.error("Room not found");
        return;
      }
      const { data: participant, error: pErr } = await supabase
        .from("participants")
        .insert({ room_id: room.id, name, role: "student" })
        .select()
        .single();
      if (pErr) {
        if (pErr.code === "23505") {
          toast.error("That name is already taken in this room");
          return;
        }
        throw pErr;
      }
      setRoomSession(code, { participantId: participant.id, name, role: "student" });
      navigate({ to: "/room/$code", params: { code } });
    } catch (e) {
      console.error(e);
      toast.error("Could not join room");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col items-center justify-center gap-12 px-4 py-12">
      <header className="text-center">
        <div className="mx-auto mb-4 inline-flex items-center gap-2 rounded-full bg-card px-4 py-1.5 shadow-[var(--shadow-soft)] ring-1 ring-border">
          <span className="h-2 w-2 animate-pulse rounded-full bg-success" />
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Live · Realtime
          </span>
        </div>
        <h1 className="bg-[image:var(--gradient-hero)] bg-clip-text text-5xl font-bold tracking-tight text-transparent sm:text-7xl">
          Game of Life
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
          Plan three phases of a financial life: investing, holding, retirement
        </p>
      </header>

      <div className="grid w-full gap-6 md:grid-cols-2">
        <Card className="overflow-hidden border-2 p-8 shadow-[var(--shadow-elegant)] transition-shadow">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-lg">
              🎓
            </div>
            <div>
              <h2 className="text-xl font-semibold">Host as teacher</h2>
              <p className="text-sm text-muted-foreground">Create a new room</p>
            </div>
          </div>
          <div className="space-y-4">
            <div>
              <Label htmlFor="teacher">Your name</Label>
              <Input
                id="teacher"
                value={teacherName}
                onChange={(e) => setTeacherName(e.target.value)}
                placeholder="Mr. MathIntyre"
                className="h-11"
              />
            </div>
            <Button
              variant="hero"
              size="lg"
              className="w-full hover:shadow-[var(--shadow-elegant)]"
              onClick={handleCreate}
              disabled={busy}
            >
              Create classroom
            </Button>
          </div>
        </Card>

        <Card className="overflow-hidden border-2 p-8 shadow-[var(--shadow-elegant)] transition-shadow">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-lg">
              ✋
            </div>
            <div>
              <h2 className="text-xl font-semibold">Join as student</h2>
              <p className="text-sm text-muted-foreground">Use a room code</p>
            </div>
          </div>
          <div className="space-y-4">
            <div>
              <Label htmlFor="code">Room code</Label>
              <Input
                id="code"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="YAHOO"
                maxLength={5}
                className="h-11 text-center font-mono text-2xl tracking-[0.4em]"
              />
            </div>
            <div>
              <Label htmlFor="name">Your name</Label>
              <Input
                id="name"
                value={studentName}
                onChange={(e) => setStudentName(e.target.value)}
                placeholder="tanka jahari"
                className="h-11"
              />
            </div>
            <Button
              variant="warm"
              size="lg"
              className="w-full transition-[transform] duration-300 hover:-translate-y-0.5"
              onClick={handleJoin}
              disabled={busy}
            >
              Join classroom
            </Button>
          </div>
        </Card>
      </div>

      <footer className="text-center text-xs text-muted-foreground">
        Built for  triple T and TT · 🪵⚾ & 🦈👟
      </footer>
    </main>
  );
}
