/**
 * Cloudflare Workers AI caller (server-side only — the API token never
 * reaches the browser). Model + credentials come from env:
 *   CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN (or CLOUDFLARE_AUTH_TOKEN),
 *   CLOUDFLARE_MODEL (default @cf/zai-org/glm-4.7-flash)
 */

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

const DEFAULT_MODEL = "@cf/zai-org/glm-4.7-flash";

function credentials(): { accountId: string; token: string; model: string } {
  const accountId = (process.env.CLOUDFLARE_ACCOUNT_ID ?? "").trim();
  const token = (
    process.env.CLOUDFLARE_API_TOKEN ??
    process.env.CLOUDFLARE_AUTH_TOKEN ??
    ""
  ).trim();
  if (!accountId || !token) {
    throw new Error(
      "Cloudflare credentials are missing. Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN in .env.",
    );
  }
  const model = (process.env.CLOUDFLARE_MODEL ?? DEFAULT_MODEL).trim();
  return { accountId, token, model };
}

export async function callCloudflare(
  messages: ChatMessage[],
): Promise<string> {
  const { accountId, token, model } = credentials();
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messages,
      temperature: 0.1,
      max_completion_tokens: 200,
      chat_template_kwargs: { enable_thinking: false },
    }),
    signal: AbortSignal.timeout(25_000),
  });

  const result = (await res.json().catch(() => null)) as {
    success?: boolean;
    errors?: unknown;
    result?: { choices?: Array<{ message?: { content?: string } }> };
  } | null;

  if (!res.ok || !result?.success) {
    throw new Error(
      `Cloudflare AI request failed: ${JSON.stringify(result?.errors ?? res.status)}`,
    );
  }
  const answer = result.result?.choices?.[0]?.message?.content?.trim();
  if (!answer) throw new Error("Cloudflare returned no answer.");
  return answer;
}
