const axios = require("axios");
const config = require("../config/config");
const { logAiRequest } = require("./aiLogger.service");

class AiServiceError extends Error {
  constructor(message, { statusCode = 500, code = "AI_SERVICE_ERROR", isRetryable = false, cause = null } = {}) {
    super(message);
    this.name = "AiServiceError";
    this.statusCode = statusCode;
    this.code = code;
    this.isRetryable = isRetryable;
    this.cause = cause;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isRetryableError = (error) => {
  if (!error) return false;
  const status = error.response?.status || error.status;
  if (status && [429, 500, 502, 503, 504].includes(status)) return true;
  const code = error.code;
  if (code && ["ETIMEDOUT", "ECONNRESET", "ENOTFOUND", "ECONNREFUSED"].includes(code)) return true;
  if (error.message && (error.message.includes("timeout") || error.message.includes("network"))) return true;
  return false;
};

const executeWithRetry = async (fn, maxAttempts = 3, initialDelayMs = 1000) => {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts && isRetryableError(error)) {
        const jitter = Math.random() * 200;
        const delay = initialDelayMs * Math.pow(2, attempt - 1) + jitter;
        console.warn(`[aiService] Attempt ${attempt} failed with ${error.message}. Retrying in ${Math.round(delay)}ms...`);
        await sleep(delay);
      } else {
        break;
      }
    }
  }
  throw lastError;
};

/**
 * Centralized AI Call Generator supporting Gemini and Groq
 */
const generateContent = async (
  systemInstruction,
  prompt,
  options = {},
  userId = null,
  endpoint = "unknown"
) => {
  const useGroq = config.aiProvider === "groq";
  const apiKey = useGroq ? config.groq.apiKey : config.gemini.apiKey;
  const model = options.model || (useGroq ? config.groq.model : config.gemini.model);

  if (!apiKey) {
    throw new AiServiceError(
      `${useGroq ? "Groq" : "Gemini"} API key is not configured`,
      { statusCode: 500, code: "CONFIGURATION_ERROR", isRetryable: false }
    );
  }

  const temperature = options.temperature ?? config.gemini.temperature ?? 0.3;
  const maxOutputTokens = options.maxOutputTokens ?? config.gemini.maxTokens ?? 2000;
  const responseMimeType = options.responseMimeType || (options.json ? "application/json" : undefined);
  const timeout = options.timeout || 20000;

  const startTime = Date.now();

  try {
    const result = await executeWithRetry(async (attempt) => {
      if (useGroq) {
        const messages = [
          ...(systemInstruction ? [{ role: "system", content: systemInstruction }] : []),
          { role: "user", content: prompt },
        ];
        const payload = {
          model,
          messages,
          temperature,
          max_tokens: maxOutputTokens,
        };
        if (options.json) {
          payload.response_format = { type: "json_object" };
          const hasJsonWord = messages.some((m) => m.content && m.content.toLowerCase().includes("json"));
          if (!hasJsonWord) {
            if (messages.length > 0) {
              messages[0].content += " Return output in valid JSON format.";
            } else {
              messages.push({ role: "system", content: "Return output in valid JSON format." });
            }
          }
        }
        const response = await axios.post(
          "https://api.groq.com/openai/v1/chat/completions",
          payload,
          {
            headers: { Authorization: `Bearer ${apiKey}` },
            timeout,
          }
        );

        const text = response.data?.choices?.[0]?.message?.content;
        if (!text) throw new Error("Groq returned no content");
        const usage = response.data.usage || {};
        return {
          text,
          usage: {
            promptTokenCount: usage.prompt_tokens || 0,
            candidatesTokenCount: usage.completion_tokens || 0,
            totalTokenCount: usage.total_tokens || 0,
          },
        };
      } else {
        const payload = {
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature,
            maxOutputTokens,
            ...(responseMimeType ? { responseMimeType } : {}),
          },
        };
        if (systemInstruction) {
          payload.systemInstruction = { parts: [{ text: systemInstruction }] };
        }

        const response = await axios.post(
          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
          payload,
          {
            headers: { "x-goog-api-key": apiKey },
            timeout,
          }
        );

        const text = response.data?.candidates?.[0]?.content?.parts
          ?.map((part) => part.text || "")
          .join("");
        if (!text) throw new Error("Gemini returned no content");
        const rawUsage = response.data.usageMetadata || {};
        return {
          text,
          usage: {
            promptTokenCount: rawUsage.promptTokenCount || 0,
            candidatesTokenCount: rawUsage.candidatesTokenCount || 0,
            totalTokenCount: rawUsage.totalTokenCount || 0,
          },
        };
      }
    });

    const latencyMs = Date.now() - startTime;
    logAiRequest({
      userId,
      endpoint,
      model,
      promptTokens: result.usage.promptTokenCount,
      completionTokens: result.usage.candidatesTokenCount,
      totalTokens: result.usage.totalTokenCount,
      latencyMs,
      status: "success",
    });

    return result;
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    logAiRequest({
      userId,
      endpoint,
      model,
      latencyMs,
      status: "failed",
      errorMessage: error.message,
    });

    const status = error.response?.status || error.status || 500;
    let code = "AI_GENERATION_FAILED";
    if (status === 429) code = "API_RATE_LIMIT";
    if ([400, 401, 403].includes(status)) code = "CONFIGURATION_ERROR";

    throw new AiServiceError(
      error.message || "AI generation failed after retries",
      { statusCode: status >= 500 || status === 429 ? 503 : status, code, isRetryable: isRetryableError(error), cause: error }
    );
  }
};

/**
 * Generate JSON response from AI
 */
const generateJson = async (
  systemInstruction,
  prompt,
  options = {},
  userId = null,
  endpoint = "unknown"
) => {
  const completion = await generateContent(
    systemInstruction,
    prompt,
    { ...options, json: true, responseMimeType: "application/json" },
    userId,
    endpoint
  );

  try {
    return JSON.parse(completion.text);
  } catch (err) {
    throw new AiServiceError(`Failed to parse AI JSON response: ${err.message}`, {
      statusCode: 500,
      code: "INVALID_AI_RESPONSE",
      isRetryable: false,
    });
  }
};

module.exports = {
  generateContent,
  generateJson,
  AiServiceError,
};
