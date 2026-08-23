function normalizeText(text) {
  return text
    .replace(/\s+/g, " ")
    .replace(/[^\x20-\x7E]/g, " ")
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
      "statement balance"
    ],

    EOB: [
      "explanation of benefits",
      "allowed amount",
      "plan paid",
      "insurance paid",
      "member responsibility",
      "claim number"
    ],

    LAB_RESULT: [
      "reference range",
      "lab result",
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
      "assessment"
    ],

    DISCHARGE_SUMMARY: [
      "discharge instructions",
      "discharge summary",
      "follow up",
      "return precautions",
      "discharged"
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

function extractProvider(text) {
  const patterns = [
    /([A-Z][A-Za-z&.'\-\s]{2,60}(?:Hospital|Medical Center|Clinic|Health System|Health Plan|Healthcare|Laboratory))/i,
    /(Kaiser Permanente)/i,
    /(Blue Cross[^,\n]*)/i,
    /(UnitedHealthcare[^,\n]*)/i,
    /(Aetna[^,\n]*)/i,
    /(Cigna[^,\n]*)/i
  ];

  return findFirst(text, patterns);
}

function extractDate(text) {
  const patterns = [
    /(?:Date of Service|Service Date|Visit Date|Statement Date|DOS|Date)\s*[:#]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,

    /(?:Date of Service|Service Date|Visit Date|Statement Date|Date)\s*[:#]?\s*((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4})/i,

    /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/
  ];

  return findFirst(text, patterns);
}

function extractAmount(text, labels) {
  for (const label of labels) {
    const pattern = new RegExp(
      `${label}\\s*[:#]?\\s*\\$?\\s*([\\d,]+\\.\\d{2})`,
      "i"
    );

    const match = text.match(pattern);

    if (match) {
      return `$${match[1]}`;
    }
  }

  return null;
}

function extractService(text) {
  const patterns = [
    /(?:Service Description|Description of Service|Procedure Description|Reason for Visit)\s*[:#]?\s*([^$\n]{4,100})/i,

    /(?:Service|Procedure)\s*[:#]?\s*([^$\n]{4,100})/i
  ];

  return findFirst(text, patterns);
}

function buildSummary(data) {
  const parts = [];

  if (data.provider) {
    parts.push(`This document appears to be from ${data.provider}.`);
  } else {
    parts.push("This appears to be a healthcare document.");
  }

  if (data.documentType !== "UNKNOWN") {
    parts.push(
      `The system classified it as a ${data.documentType
        .replaceAll("_", " ")
        .toLowerCase()}.`
    );
  }

  if (data.patientResponsibility) {
    parts.push(
      `The document appears to list ${data.patientResponsibility} as the patient's responsibility.`
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
    "Total Billed"
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
    "Member Responsibility"
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
