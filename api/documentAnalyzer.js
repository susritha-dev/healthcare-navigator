function normalizeText(text) {
  return text
    .replace(/[^\x20-\x7E\n]/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function classifyDocument(text) {
  const lower = text.toLowerCase();

  const scores = {
    BILL: 0,
    EOB: 0,
    LAB_RESULT: 0,
    VISIT_SUMMARY: 0,
    DISCHARGE_SUMMARY: 0
  };

  const indicators = {
    BILL: [
      "amount due",
      "balance due",
      "patient responsibility",
      "total charges",
      "you owe",
      "statement balance",
      "payment due",
      "patient balance"
    ],

    EOB: [
      "explanation of benefits",
      "allowed amount",
      "plan paid",
      "insurance paid",
      "member responsibility",
      "claim number",
      "claim status"
    ],

    LAB_RESULT: [
      "reference range",
      "lab result",
      "laboratory",
      "specimen",
      "hemoglobin",
      "glucose",
      "cholesterol",
      "wbc",
      "rbc"
    ],

    VISIT_SUMMARY: [
      "visit summary",
      "reason for visit",
      "clinical summary",
      "office visit",
      "assessment",
      "visit diagnosis"
    ],

    DISCHARGE_SUMMARY: [
      "discharge instructions",
      "discharge summary",
      "follow up",
      "return precautions",
      "discharged",
      "after visit instructions"
    ]
  };

  for (const [type, words] of Object.entries(indicators)) {
    for (const word of words) {
      if (lower.includes(word)) {
        scores[type] += 1;
      }
    }
  }

  let documentType = "UNKNOWN";
  let bestScore = 0;

  for (const [type, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      documentType = type;
    }
  }

  let confidence = "LOW";

  if (bestScore >= 4) {
    confidence = "HIGH";
  } else if (bestScore >= 2) {
    confidence = "MEDIUM";
  }

  return {
    documentType,
    classificationConfidence: confidence,
    classificationScore: bestScore
  };
}

function findFirst(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);

    if (match) {
      return match[1] ? match[1].trim() : match[0].trim();
    }
  }

  return null;
}

function cleanProviderName(value) {
  if (!value) return null;

  return value
    .replace(/^write to us at\s+/i, "")
    .replace(/^contact\s+/i, "")
    .replace(/\s{2,}/g, " ")
    .replace(/[,:;.\-]+$/, "")
    .trim();
}

function extractProvider(text) {
  const lower = text.toLowerCase();

  if (
    lower.includes("kaiser") &&
    lower.includes("permanente")
  ) {
    return "Kaiser Permanente";
  }

  if (lower.includes("unitedhealthcare")) {
    return "UnitedHealthcare";
  }

  if (
    lower.includes("blue cross") &&
    lower.includes("blue shield")
  ) {
    return "Blue Cross Blue Shield";
  }

  if (lower.includes("aetna")) {
    return "Aetna";
  }

  if (lower.includes("cigna")) {
    return "Cigna";
  }

  if (lower.includes("humana")) {
    return "Humana";
  }

  if (lower.includes("anthem")) {
    return "Anthem";
  }

  const lines = text
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean);

  const providerWords =
    /(hospital|medical center|clinic|health system|health plan|healthcare|medical group|laboratory|physicians)/i;

  for (const line of lines.slice(0, 25)) {
    if (
      providerWords.test(line) &&
      line.length >= 4 &&
      line.length <= 70 &&
      !/write to us|questions|phone|address|language|customer service|important notices/i.test(
        line
      )
    ) {
      return cleanProviderName(line);
    }
  }

  return null;
}

function isReasonableDate(dateString) {
  const date = new Date(dateString);

  if (Number.isNaN(date.getTime())) {
    return false;
  }

  const year = date.getFullYear();

  return year >= 2000 && year <= 2100;
}

function extractDate(text) {
  const labeledPatterns = [
    /(?:Date of Service|Service Date|Visit Date|Statement Date|Billing Date|DOS)\s*[:#]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,

    /(?:Date of Service|Service Date|Visit Date|Statement Date|Billing Date)\s*[:#]?\s*((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4})/i,

    /(?:Date of Service|Service Date|Visit Date|Statement Date|Billing Date)\s*[:#]?\s*((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?\s+\d{1,2},?\s+\d{4})/i
  ];

  const labeledDate = findFirst(text, labeledPatterns);

  if (labeledDate && isReasonableDate(labeledDate)) {
    return labeledDate;
  }

  const numericDates = [
    ...text.matchAll(
      /\b(0?[1-9]|1[0-2])[\/\-](0?[1-9]|[12]\d|3[01])[\/\-](20\d{2})\b/g
    )
  ];

  for (const match of numericDates) {
    if (isReasonableDate(match[0])) {
      return match[0];
    }
  }

  const longDatePattern =
    /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+20\d{2}\b/gi;

  const longDates = text.match(longDatePattern) || [];

  for (const date of longDates) {
    if (isReasonableDate(date)) {
      return date;
    }
  }

  const shortMonthPattern =
    /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?\s+\d{1,2},?\s+20\d{2}\b/gi;

  const shortMonthDates = text.match(shortMonthPattern) || [];

  for (const date of shortMonthDates) {
    if (isReasonableDate(date)) {
      return date;
    }
  }

  return null;
}

function extractAmount(text, labels) {
  for (const label of labels) {
    const pattern = new RegExp(
      `${label}\\s*[:#]?\\s*\\$?\\s*([\\d,]+(?:\\.\\d{2})?)`,
      "i"
    );

    const match = text.match(pattern);

    if (match) {
      const amount = match[1];

      return amount.includes(".")
        ? `$${amount}`
        : `$${amount}.00`;
    }
  }

  return null;
}

function extractService(text) {
  const labeledPatterns = [
    /(?:Service Description|Description of Service|Procedure Description)\s*[:#]?\s*([^\n$]{4,80})/i,

    /(?:Reason for Visit)\s*[:#]?\s*([^\n$]{4,80})/i,

    /(?:Procedure)\s*[:#]?\s*([^\n$]{4,80})/i
  ];

  const service = findFirst(text, labeledPatterns);

  if (!service) {
    return null;
  }

  const cleaned = service
    .replace(/\s{2,}/g, " ")
    .trim();

  const badContent =
    /address|avenue|street|road|phone|language|questions|customer service|write to us|zip code/i;

  if (badContent.test(cleaned)) {
    return null;
  }

  return cleaned.length <= 80 ? cleaned : null;
}

function buildSummary(data) {
  const parts = [];

  if (data.documentType !== "UNKNOWN") {
    const label = data.documentType
      .replaceAll("_", " ")
      .toLowerCase();

    parts.push(`This appears to be a ${label}.`);
  } else {
    parts.push("This appears to be a healthcare document.");
  }

  if (data.provider) {
    parts.push(`The document appears to be from ${data.provider}.`);
  }

  if (data.date) {
    parts.push(`The main date found is ${data.date}.`);
  }

  if (data.patientResponsibility) {
    parts.push(
      `The document appears to list ${data.patientResponsibility} as the patient's responsibility.`
    );
  }

  if (!data.provider && !data.date && !data.patientResponsibility) {
    parts.push(
      "Some important details could not be identified confidently from the document text."
    );
  }

  return parts.join(" ");
}

function analyzeDocument(text) {
  const cleanedText = normalizeText(text);

  const classification = classifyDocument(cleanedText);

  const provider = extractProvider(cleanedText);
  const date = extractDate(cleanedText);
  const service = extractService(cleanedText);

  const billedAmount = extractAmount(cleanedText, [
    "Total Charges",
    "Billed Amount",
    "Amount Billed",
    "Total Billed",
    "Original Charges"
  ]);

  const insurancePayment = extractAmount(cleanedText, [
    "Insurance Payment",
    "Insurance Paid",
    "Plan Paid",
    "Paid by Insurance"
  ]);

  const insuranceAdjustment = extractAmount(cleanedText, [
    "Insurance Adjustment",
    "Adjustment",
    "Plan Discount",
    "Contractual Adjustment"
  ]);

  const patientResponsibility = extractAmount(cleanedText, [
    "Patient Responsibility",
    "Amount Due",
    "Balance Due",
    "You Owe",
    "Member Responsibility",
    "Patient Balance"
  ]);

  const data = {
    documentType: classification.documentType,
    classificationConfidence:
      classification.classificationConfidence,
    classificationScore:
      classification.classificationScore,

    provider,
    date,
    service,

    billedAmount,
    insurancePayment,
    insuranceAdjustment,
    patientResponsibility
  };

  return {
    ...data,
    summary: buildSummary(data)
  };
}

module.exports = {
  analyzeDocument
};
