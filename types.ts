
export enum SenderType {
  USER = 'USER',
  AGENT = 'AGENT',
  SYSTEM = 'SYSTEM'
}

export interface Message {
  id: string;
  text: string;
  sender: SenderType;
  timestamp: number;
  metadata?: {
    isError?: boolean;
    workflowStatus?: string;
  };
}

export interface ChatSession {
  id: string;
  name: string;
  messages: Message[];
  createdAt: number;
}

export interface N8nConfig {
  webhookUrl: string;
}
