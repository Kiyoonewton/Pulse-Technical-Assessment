export const INTENTIONS = [
  {
    id: "CHAT",
    label: "Just chatting",
    description: "Meet someone and see where the conversation goes.",
  },
  {
    id: "GOOD_NEWS",
    label: "Sharing something good",
    description: "A small win, a happy moment, or something worth sharing.",
  },
  {
    id: "LANGUAGE",
    label: "Practising a language",
    description: "Learn through a relaxed conversation.",
  },
  {
    id: "LISTEN",
    label: "Listening",
    description: "Make space for someone else's story.",
  },
] as const;

export type Intention = (typeof INTENTIONS)[number]["id"];

export const DEFAULT_INTENTION: Intention = "CHAT";

export function isIntention(value: unknown): value is Intention {
  return INTENTIONS.some((intention) => intention.id === value);
}
