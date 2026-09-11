import type { ObjectId } from 'mongodb';

export interface GroupDoc {
  _id: string;               // WhatsApp group / conversation id
  name: string;
  monitored: boolean;
  department?: string | null;
  joinedAt: Date | null;     // never ingest messages older than this
  lastTs: Date | null;       // cursor
  lastMsgId: string | null;
  lastRunAt: Date | null;
  lastRunStatus: 'ok' | 'error' | null;
  lastRunError: string | null;
}

export interface MessageDoc {
  msgId: string;             // unique
  groupId: string;
  senderId: string | null;
  senderName: string | null;
  ts: Date;                  // when WhatsApp says it was sent
  receivedAt: Date;          // when we ingested it (TTL anchor)
  text: string;
  type: string;
  mediaUrl: string | null;
  quotedMsgId: string | null;
  fromMe: boolean;
  classified: boolean;
}

export interface RunDoc {
  _id?: ObjectId;
  startedAt: Date;
  finishedAt: Date | null;
  groupsPolled: number;
  messagesIngested: number;
  concernsRaised: number;
  errors: { groupId?: string; scope: string; message: string }[];
}
