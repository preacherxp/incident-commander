import { z } from "zod";

export type PlayCardCommand = { type: "play_card"; cardId: string; handIndex: number };
export type EndTurnCommand = { type: "end_turn" };
export type DraftPickCommand = { type: "draft_pick"; cardId: string };
export type Command = PlayCardCommand | EndTurnCommand | DraftPickCommand;

export type InputSource = "button" | "command";

export type RunInput = Command & {
  inputId: string;
  seq: number;
  tick: number;
  source: InputSource;
};

const inputBase = {
  inputId: z.string().uuid(),
  seq: z.number().int().positive().max(10_000),
  tick: z.number().int().nonnegative().max(10_000),
  source: z.enum(["button", "command"]),
};

const playCardSchema = z
  .object({
    type: z.literal("play_card"),
    cardId: z.string().min(1).max(64),
    handIndex: z.number().int().min(0).max(23),
  })
  .strict();

const endTurnSchema = z.object({ type: z.literal("end_turn") }).strict();

const draftPickSchema = z
  .object({ type: z.literal("draft_pick"), cardId: z.string().min(1).max(64) })
  .strict();

export const commandSchema = z.discriminatedUnion("type", [playCardSchema, endTurnSchema, draftPickSchema]);

export const runInputSchema = z.discriminatedUnion("type", [
  playCardSchema.extend(inputBase).strict(),
  endTurnSchema.extend(inputBase).strict(),
  draftPickSchema.extend(inputBase).strict(),
]);

export function toCommand(input: RunInput): Command {
  switch (input.type) {
    case "play_card":
      return { type: "play_card", cardId: input.cardId, handIndex: input.handIndex };
    case "end_turn":
      return { type: "end_turn" };
    case "draft_pick":
      return { type: "draft_pick", cardId: input.cardId };
  }
}

export function describeCommand(command: Command): string {
  switch (command.type) {
    case "play_card":
      return `play ${command.cardId}`;
    case "end_turn":
      return "end turn";
    case "draft_pick":
      return `draft ${command.cardId}`;
  }
}
