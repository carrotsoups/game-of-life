// Browser-only session helpers for storing the current participant per room
// and a teacher-token marker (best-effort access control by URL knowledge).

const KEY = "classroom-sim::session";

export interface SessionState {
  // Map room code -> participant info
  rooms: Record<
    string,
    {
      participantId: string;
      name: string;
      role: "teacher" | "student";
    }
  >;
}

function read(): SessionState {
  if (typeof window === "undefined") return { rooms: {} };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { rooms: {} };
    return JSON.parse(raw) as SessionState;
  } catch {
    return { rooms: {} };
  }
}

function write(s: SessionState) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(s));
}

export function setRoomSession(
  code: string,
  data: { participantId: string; name: string; role: "teacher" | "student" },
) {
  const s = read();
  s.rooms[code] = data;
  write(s);
}

export function getRoomSession(code: string) {
  return read().rooms[code];
}

export function clearRoomSession(code: string) {
  const s = read();
  delete s.rooms[code];
  write(s);
}
