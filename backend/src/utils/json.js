function extractFirstJsonObject(input) {
  if (!input || typeof input !== "string") {
    throw new Error("Model response content is empty.");
  }

  const trimmed = input.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return JSON.parse(trimmed);
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("No JSON object found in model response.");
  }

  return JSON.parse(trimmed.slice(start, end + 1));
}

module.exports = { extractFirstJsonObject };
