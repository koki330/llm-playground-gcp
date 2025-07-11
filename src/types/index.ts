export interface ContentPart {
  type: 'text' | 'image';
  text?: string;
  image?: {
    gcsUri: string;
    mediaType: string;
  };
}

export interface Message {
  id: string;
  role: 'user' | 'model' | 'system';
  content: ContentPart[];
}
