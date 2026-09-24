import { AnthropicBedrock } from "@anthropic-ai/bedrock-sdk";

/**
 * The only file in this app that calls out to Bedrock. H2 (CLAUDE.md):
 * "Run inference only on Amazon Bedrock with an Australian geographic
 * inference profile (Sydney and Melbourne). Never call api.anthropic.com
 * or any non-AU LLM endpoint. Read the model ID and profile from env
 * BEDROCK_MODEL_ID. Never hardcode them."
 *
 * AnthropicBedrock (NOT AnthropicBedrockMantle) signs requests with AWS
 * SigV4 and calls bedrock-runtime.<region>.amazonaws.com — the standard AWS
 * Bedrock Runtime service, the same one `aws bedrock-runtime converse`
 * uses — never api.anthropic.com, so there is no first-party Anthropic
 * client anywhere in this app and no ANTHROPIC_API_KEY is read.
 *
 * [A] Deliberately NOT AnthropicBedrockMantle, despite it being the
 * @anthropic-ai/bedrock-sdk package's own recommended default for new code.
 * Mantle targets bedrock-mantle.<region>.api.aws — a separate,
 * Anthropic-operated routing layer with its own IAM action namespace
 * (bedrock-mantle:CreateInference) and its own model/profile resolution,
 * independent of standard AWS Bedrock provisioning. Verified live: the
 * exact same inference-profile ARN that AWS CLI's `bedrock-runtime
 * converse` invokes successfully was rejected by the Mantle endpoint at
 * every layer (auth, permissions, and model lookup) until switching to
 * this client. H2 says "Amazon Bedrock" — this is the literal AWS service
 * by that name; Mantle is not.
 *
 * [A] The AWS region "ap-southeast-2" (Sydney) is a literal from SPEC.md
 * 5.9 ("region ap-southeast-2"), not something H2 asks to be env-derived —
 * H2 only requires the *model ID/profile* to come from BEDROCK_MODEL_ID.
 * Hardcoding the region is what keeps it pinned to an AU region no matter
 * what BEDROCK_MODEL_ID (or a future default) is set to.
 */
const AWS_REGION = "ap-southeast-2";

export interface CallBedrockOptions {
  systemPrompt: string;
  /** SPEC.md 5.9: 60s. Overridable for tests only. */
  timeoutMs?: number;
}

/**
 * SPEC.md 5.9 Bedrock call: temperature 0, max output tokens 3000,
 * timeout 60s, region ap-southeast-2, model/profile from BEDROCK_MODEL_ID.
 */
export async function callBedrock({ systemPrompt, timeoutMs = 60_000 }: CallBedrockOptions): Promise<string> {
  const modelId = process.env.BEDROCK_MODEL_ID;
  if (!modelId) {
    // H2: never hardcode the model ID/profile — if it's missing, fail loudly
    // rather than fall back to a baked-in value.
    throw new Error("BEDROCK_MODEL_ID is not set");
  }

  const client = new AnthropicBedrock({ awsRegion: AWS_REGION });

  const response = await client.messages.create(
    {
      model: modelId,
      max_tokens: 3000,
      temperature: 0,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: "Generate the six-step report now, following every rule in the system prompt exactly.",
        },
      ],
    },
    { timeout: timeoutMs },
  );

  const textBlock = response.content.find(
    (block): block is Extract<typeof block, { type: "text" }> => block.type === "text",
  );
  if (!textBlock) {
    throw new Error("Bedrock response contained no text block");
  }
  return textBlock.text;
}
