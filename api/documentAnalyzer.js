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

function cleanService(value) {
  if (!value) return null;

  const cleaned = value
    .replace(/\s{2,}/g, " ")
    .replace(/[,:;.\-]+$/, "")
    .trim();

  const badContent =
    /address|avenue|street|road|boulevard|suite|phone|fax|language|questions|customer service|write to us|zip code|member services|website|www\.|http|payment address/i;

  if (badContent.test(cleaned)) {
    return null;
  }

  if (cleaned.length < 4 || cleaned.length > 90) {
    return null;
  }

  return cleaned;
}

function extractService(text) {
  const labeledPatterns = [
    /(?:Service Description|Description of Service|Procedure Description|Description)\s*[:#]?\s*([^\n$]{4,90})/i,

    /(?:Reason for Visit|Visit Reason)\s*[:#]?\s*([^\n$]{4,90})/i,

    /(?:Procedure Name|Procedure)\s*[:#]?\s*([^\n$]{4,90})/i,

    /(?:Service|Services Rendered|Type of Service)\s*[:#]?\s*([^\n$]{4,90})/i,

    /(?:CPT|HCPCS|Procedure Code)\s*[:#]?\s*[A-Z0-9\-]+\s*(?:[-–—:]\s*)?([A-Za-z][^\n$]{3,90})/i
  ];

  for (const pattern of labeledPatterns) {
    const match = text.match(pattern);

    if (match) {
      const cleaned = cleanService(match[1]);

      if (cleaned) {
        return cleaned;
      }
    }
  }

  const lines = text
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean);

  const likelyServiceWords =
    /(office visit|emergency|emergency room|laboratory|lab test|x-ray|radiology|imaging|consultation|therapy|surgery|procedure|vaccination|injection|exam|diagnostic|blood test|ambulance)/i;

  for (const line of lines) {
    if (
      likelyServiceWords.test(line) &&
      !/address|phone|questions|customer service|language|payment|mail|website/i.test(
        line
      )
    ) {
      const cleaned = cleanService(line);

      if (cleaned) {
        return cleaned;
      }
    }
  }

  return null;
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

  if (data.service) {
    parts.push(`The main service appears to be ${data.service}.`);
  }

  if (data.patientResponsibility) {
    parts.push(
      `The document appears to list ${data.patientResponsibility} as the patient's responsibility.`
    );
  }

  if (
    !data.provider &&
    !data.date &&
    !data.service &&
    !data.patientResponsibility
  ) {
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
