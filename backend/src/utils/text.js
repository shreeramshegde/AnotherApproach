function normalizeText(value) {
  if (!value) {
    return "";
  }

  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return [];
  }

  return normalized.split(" ").filter(Boolean);
}

function jaccardSimilarity(a, b) {
  const setA = new Set(tokenize(a));
  const setB = new Set(tokenize(b));

  if (setA.size === 0 && setB.size === 0) {
    return 1;
  }

  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) {
      intersection += 1;
    }
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function detectLikelySpam(text) {
  const tokens = tokenize(text);
  if (tokens.length === 0) {
    return { isLikelySpam: true, reason: "Empty review text." };
  }

  const uniqueTokenCount = new Set(tokens).size;
  const uniqueRatio = uniqueTokenCount / tokens.length;

  const repeatedChars = /(.)\1{5,}/.test(text);
  const hasPromoSpamWords =
    /buy now|click here|discount|promo code|follow me|subscribe/i.test(text);

  if (tokens.length > 8 && uniqueRatio < 0.35) {
    return {
      isLikelySpam: true,
      reason: "Highly repetitive token pattern.",
    };
  }

  if (repeatedChars) {
    return {
      isLikelySpam: true,
      reason: "Unnatural repeated character sequence.",
    };
  }

  if (hasPromoSpamWords) {
    return {
      isLikelySpam: true,
      reason: "Contains promotional spam terms.",
    };
  }

  return { isLikelySpam: false, reason: "" };
}

function detectLikelyBot(text) {
  const tokens = tokenize(text);
  if (tokens.length === 0) {
    return { isLikelyBot: true, score: 1, reason: "Empty review text." };
  }

  const uniqueRatio = new Set(tokens).size / tokens.length;
  const repeatedBigramCount = (() => {
    const seen = new Map();
    for (let i = 0; i < tokens.length - 1; i += 1) {
      const bigram = `${tokens[i]} ${tokens[i + 1]}`;
      seen.set(bigram, (seen.get(bigram) || 0) + 1);
    }

    let repeats = 0;
    for (const count of seen.values()) {
      if (count > 1) {
        repeats += count - 1;
      }
    }
    return repeats;
  })();

  const punctuationSpam = /[!?]{4,}/.test(text);
  const scoreRaw =
    (uniqueRatio < 0.4 ? 0.45 : 0) +
    (repeatedBigramCount >= 2 ? 0.35 : 0) +
    (punctuationSpam ? 0.2 : 0);
  const score = Math.max(0, Math.min(1, scoreRaw));

  if (score >= 0.65) {
    return {
      isLikelyBot: true,
      score,
      reason: "Highly repetitive structure suggests automated generation.",
    };
  }

  return { isLikelyBot: false, score, reason: "" };
}

module.exports = {
  normalizeText,
  tokenize,
  jaccardSimilarity,
  detectLikelySpam,
  detectLikelyBot,
};
