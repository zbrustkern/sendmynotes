export type PostPurchaseEnvironment = "staging" | "production";
export type FollowupStage = "check_in" | "offer";
export type CliCommand = "preview" | "candidates" | "enroll" | "dispatch" | "reconcile";

export interface PostPurchaseCliArgs {
  command: CliCommand;
  environment: PostPurchaseEnvironment;
  apply: boolean;
  orderId?: string;
  messageId?: string;
  stage?: FollowupStage;
  limit: number;
}

const usage = "Usage: post-purchase <preview|candidates|enroll|dispatch|reconcile> --environment <staging|production> [--order <id>] [--stage check-in|offer] [--message <id>] [--limit 1..100] [--apply]";

export function parsePostPurchaseArgs(argv: string[]): PostPurchaseCliArgs {
  const [commandRaw, ...rest] = argv;
  const commands = new Set<CliCommand>(["preview", "candidates", "enroll", "dispatch", "reconcile"]);
  if (!commands.has(commandRaw as CliCommand)) throw new Error(usage);
  const values = new Map<string, string>();
  let apply = false;
  for (let i = 0; i < rest.length; i++) {
    const item = rest[i];
    if (item === "--apply") {
      if (apply) throw new Error("Duplicate --apply flag");
      apply = true;
      continue;
    }
    if (!new Set(["--environment", "--order", "--stage", "--message", "--limit"]).has(item)) throw new Error(`Unknown option: ${item}`);
    if (values.has(item)) throw new Error(`Duplicate option: ${item}`);
    const value = rest[++i];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${item}`);
    values.set(item, value);
  }
  const environment = values.get("--environment");
  if (environment !== "staging" && environment !== "production") throw new Error("Set --environment staging or production explicitly");
  const command = commandRaw as CliCommand;
  const orderId = values.get("--order");
  const messageId = values.get("--message");
  const stageInput = values.get("--stage");
  const stage = stageInput === "check-in" ? "check_in" : stageInput === "offer" ? "offer" : undefined;
  if ((command === "preview" || command === "enroll") && !orderId) throw new Error(`${command} requires --order`);
  if (command === "preview" && !stage) throw new Error("preview requires --stage check-in or offer");
  if (stageInput && !stage) throw new Error("--stage must be check-in or offer");
  if (command === "reconcile" && !messageId) throw new Error("reconcile requires --message");
  if (command !== "reconcile" && messageId) throw new Error("--message is only valid for reconcile");
  if (command !== "preview" && stageInput) throw new Error("--stage is only valid for preview");
  if (!["candidates", "dispatch"].includes(command) && values.has("--limit")) throw new Error("--limit is only valid for candidates or dispatch");
  if (apply && !["enroll", "dispatch"].includes(command)) throw new Error("--apply is only valid for enroll or dispatch");
  const limit = Number(values.get("--limit") ?? 25);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("--limit must be an integer from 1 to 100");
  return { command, environment, apply, orderId, messageId, stage, limit };
}
