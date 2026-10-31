/**
 * Сетевые сообщения клиент ↔ сервер (Socket.IO). ВЛАДЕЛЕЦ: лид.
 * Для справки остальным: так ваши модули связаны по сети.
 *
 * Авторизация (D-65): POST /api/register или /api/login { name, password } → { token, playerId, name };
 * POST /api/logout (Authorization: Bearer <token>). Сессия живёт 7 дней.
 * Сокет подключается с auth: { token }; без токена сервер рвёт соединение. Всё снаружи — по HTTPS.
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
  /** Выйти из комнаты в лобби (в коопе напарник играет дальше) */
  "room:leave": () => void;
  /** Движение, ~15 раз в секунду */
  "player:move": (p: { pos: Vec3; rotY: number; anim: PlayerPublic["anim"] }) => void;
  /** Подгрузка мира: клиент сообщает, какие чанки хочет (по своей позиции) */
  "chunk:want": (p: { ids: ChunkId[] }) => void;
  /** Игровые события, которые порождает клиент (interact, enterZone, minigameResult) */
  "game:event": (e: Extract<GameEvent, { type: "interact" | "enterZone" | "minigameResult" }>) => void;
  /** Игрок пишет NPC */
  "npc:talk": (p: { npcId: NpcId; text: string }) => void;
  /** Игрок сам завершил разговор кнопкой (звонок 112, D-62) → dialogOutcome `call_ended` */
  "npc:hangup": (p: { npcId: NpcId }) => void;
  /**
   * Голос (D-69): WAV 16 кГц, моно, 16 бит, не длиннее 15 с. `to` — NPC или "radio".
   * Сервер распознаёт (whisper.cpp) и дальше — как npc:talk / chat:send; текст возвращает в voice:text.
   */
  "voice:say": (p: { to: NpcId | "radio"; wav: ArrayBuffer }) => void;
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
  /** Что распознано из голоса (или почему не получилось) */
  /** Озвучка реплики NPC (D-70): WAV Piper, только адресату, приходит после npc:done */
  "npc:audio": (p: { npcId: NpcId; wav: ArrayBuffer }) => void;
  "voice:text": (p: { to: NpcId | "radio"; text: string } | { to: NpcId | "radio"; error: string }) => void;
  "run:end": (p: { summary: RunSummary; debrief: string }) => void;
}
