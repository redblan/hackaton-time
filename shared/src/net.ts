/**
 * Сетевые сообщения клиент ↔ сервер (Socket.IO). ВЛАДЕЛЕЦ: лид.
 * Для справки остальным: так ваши модули связаны по сети.
 *
 * Авторизация: POST /api/login { name, password } → { token }.
 * Сокет подключается с auth: { token }; без токена сервер рвёт соединение.
 */
import type { ChunkData, ChunkId, Vec3 } from "./world";
import type { Effect, GameEvent, RunSummary } from "./scenario/types";
import type { Mode, NpcId, PlayerId, Role } from "./ids";

export interface PlayerPublic {
  id: PlayerId;
  name: string;
  role: Role | null;
  pos: Vec3;
  rotY: number;
  anim: "idle" | "walk" | "run" | "crouch" | "carry";
}

/** NPC, которого двигает сервер (сопровождение Валентины). Статичные NPC — в чанках. */
export interface NpcPublic {
  npcId: NpcId;
  pos: Vec3;
  rotY: number;
  /** За кем идёт; null — стоит на месте */
  following: PlayerId | null;
}

export interface ClientToServer {
  /** Лобби */
  "room:join": (p: { mode: Mode }) => void;
  "room:ready": (p: { role: Role }) => void;
  /** Движение, ~15 раз в секунду */
  "player:move": (p: { pos: Vec3; rotY: number; anim: PlayerPublic["anim"] }) => void;
  /** Подгрузка мира: клиент сообщает, какие чанки хочет (по своей позиции) */
  "chunk:want": (p: { ids: ChunkId[] }) => void;
  /** Игровые события, которые порождает клиент (interact, enterZone, minigameResult) */
  "game:event": (e: Extract<GameEvent, { type: "interact" | "enterZone" | "minigameResult" }>) => void;
  /** Игрок пишет NPC */
  "npc:talk": (p: { npcId: NpcId; text: string }) => void;
  /** Чат между игроками (рация) */
  "chat:send": (p: { text: string }) => void;
}

export interface ServerToClient {
  "room:state": (p: { roomId: string; mode: Mode; players: PlayerPublic[]; started: boolean }) => void;
  /** Позиции всех игроков в комнате, ~10 раз в секунду */
  "players:update": (p: { players: PlayerPublic[] }) => void;
  /** Подвижные NPC комнаты, ~10 раз в секунду. Клиент рисует их вместо одноимённых NPC из чанков */
  "npcs:update": (p: { npcs: NpcPublic[] }) => void;
  "chunk:data": (p: { chunk: ChunkData }) => void;
  /** Чанки, которые клиент должен выгрузить */
  "chunk:drop": (p: { ids: ChunkId[] }) => void;
  /** Флаги прохождения для мира (what is on fire etc.) */
  "run:flags": (p: { flags: string[] }) => void;
  /** Эффекты сценария, адресованные этому клиенту */
  "game:effect": (e: Effect) => void;
  /** Реплика NPC, стримом: сначала токены, потом done */
  "npc:token": (p: { npcId: NpcId; token: string }) => void;
  "npc:done": (p: { npcId: NpcId; text: string; source: "llm" | "template" }) => void;
  "chat:msg": (p: { from: string; text: string; at: number }) => void;
  "run:end": (p: { summary: RunSummary; debrief: string }) => void;
}
