export const ICEBREAKERS = [
  {
    id: "small-win",
    text: "What’s one small thing that went well for you today?",
  },
  {
    id: "local-life",
    text: "What’s something you enjoy about where you live?",
  },
  {
    id: "curiosity",
    text: "What’s something you’d love to learn?",
  },
  {
    id: "language",
    text: "Teach me a phrase you like in a language you speak.",
  },
  {
    id: "listening",
    text: "Would you rather share a story, ask a question, or just chat?",
  },
] as const;

export type IcebreakerId = (typeof ICEBREAKERS)[number]["id"];

export function isIcebreakerId(value: unknown): value is IcebreakerId {
  return ICEBREAKERS.some((card) => card.id === value);
}
