export interface WritingMessage {
  author: string;
  text: string;
}

/** Local-only parsing. Nothing is uploaded until the owner selects and reviews their own text. */
export const parseWhatsAppText = (input: string): WritingMessage[] => {
  if (input.length > 100_000)
    throw new Error(
      'Choose a text export smaller than 100 KB, or paste a few of your own messages.',
    );
  const messages: WritingMessage[] = [];
  let current: WritingMessage | undefined;
  for (const raw of input.split(/\r?\n/u)) {
    const line = raw.replace(/[\u200e\u200f\ufeff]/gu, '');
    const start = /^(?:\[([^\]]+)\]\s*|([\d/.,:\sAPMapm-]+)\s-\s)(.*)$/u.exec(line);
    if (start !== null) {
      current = undefined;
      const payload = /^([^:]{1,100}):\s(.*)$/u.exec(start[3] ?? '');
      if (payload !== null && !/omitted|attached|deleted this message/iu.test(payload[2] ?? '')) {
        current = { author: (payload[1] ?? '').trim(), text: payload[2] ?? '' };
        messages.push(current);
      }
    } else if (current !== undefined && line.trim().length > 0) {
      current.text += `\n${line}`;
    }
  }
  return messages;
};

export const ownWritingExamples = (messages: readonly WritingMessage[], author: string): string[] =>
  messages
    .filter((message) => message.author === author && message.text.trim().length > 0)
    .slice(-12)
    .map((message) =>
      message.text
        .slice(0, 1000)
        .replace(/\b[^\s@]+@[^\s@]+\.[^\s@]+\b/gu, '[email]')
        .replace(/https?:\/\/\S+/gu, '[link]')
        .replace(/\+?\d[\d\s().-]{7,}\d/gu, '[number]'),
    );
