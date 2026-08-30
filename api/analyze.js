const pdfParse = require("pdf-parse");
const { ocrPdf } = require("./ocr");

// ---------------------------------------------------------------------------
// Field extraction
// ---------------------------------------------------------------------------
// The parser pulls a handful of high-value fields out of the raw text we get
// from pdf-parse: provider, service date, service description, billed amount,
// insurance adjustment, insurance paid, and patient responsibility. Each field
// carries the source text it was derived from so the frontend can show the
// user exactly where the number came from and explain it in plain language.

function clean(text) {
  return (text || "").replace(/\s+/g, " ").trim();
}

function firstMatch(text, regex) {
  const m = text.match(regex);
  return m ? clean(m[1] || m[0]) : null;
}

function moneyValue(text) {
  const m = text.match(/\$?\s*([0-9][0-9,]*\.?[0-9]{0,2})/);
  if (!m) return null;
  const num = parseFloat(m[1].replace(/,/g, ""));
  return Number.isFinite(num) ? num : null;
}

function escapeRe(label) {
  return label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Find the first line that starts with one of `labels`, returning the
// remainder of that line (after the label and an optional colon). Line-based
// matching avoids false hits where a label word appears inside another field.
function firstLineValue(text, labels) {
  const lines = text.split(/\n+/);
  for (const raw of lines) {
    const line = clean(raw);
    for (const label of labels) {
      const re = new RegExp("^" + escapeRe(label) + "[:\\s]+(.+)$", "i");
      const m = line.match(re);
      if (m && m[1].trim()) return clean(m[1]);
    }
  }
  return null;
}

function firstLineSource(text, labels) {
  const lines = text.split(/\n+/);
  for (const raw of lines) {
    const line = clean(raw);
    for (const label of labels) {
      const re = new RegExp("^" + escapeRe(label) + "[:\\s]", "i");
      if (re.test(line)) return line;
    }
  }
  return null;
}

function extractLineItems(text) {
  const items = [];
  const lines = text.split(/\n+/);
  const lineItemRe =
    /([A-Za-z][A-Za-z0-9 \-/().,'&]+?)\s+\$?\s*([0-9][0-9,]*\.[0-9]{2})/;

  for (const raw of lines) {
    const line = clean(raw);
    if (line.length < 6) continue;
    const m = line.match(lineItemRe);
    if (!m) continue;
    const desc = clean(m[1]);
    const amount = moneyValue(m[2]);
    if (!desc || amount == null) continue;
    if (/(total|subtotal|balance due|amount due|insurance|adjustment|payment|tax)/i.test(desc)) {
      continue;
    }
    items.push({ description: desc, amount, source: line });
  }
  return items.slice(0, 8);
}

function extractFields(text) {
  const flat = text.replace(/\s+/g, " ");

  const provider =
    firstLineValue(text, ["Provider", "Facility", "Hospital", "Clinic", "Physician", "From"]) ||
    firstMatch(flat, /([A-Za-z][A-Za-z0-9 .,'&\-()/]+?(?:Hospital|Medical Center|Health System|Clinic|Physicians|LLC|LLP|Inc))/i);

  const providerSource =
    firstLineSource(text, ["Provider", "Facility", "Hospital", "Clinic", "Physician", "From"]) ||
    (provider && provider !== "Not found" ? provider : null);

  const serviceDate =
    firstLineValue(text, ["Date of Service", "Service Date", "Date"]) ||
    firstMatch(flat, /\b([0-9]{1,2}[\/\-][0-9]{1,2}[\/\-][0-9]{2,4})\b/);

  const serviceDateSource = firstLineSource(text, ["Date of Service", "Service Date", "Date"]);

  const service =
    firstLineValue(text, ["Service", "Description", "Procedure"]) ||
    firstMatch(flat, /(?:CPT[:\s]*[0-9A-Z]{4,5})\s+([A-Za-z][A-Za-z0-9 ,'\-()/]{4,60})/i);

  const serviceSource = firstLineSource(text, ["Service", "Description", "Procedure"]);

  const billedAmountRaw =
    firstLineValue(text, ["Billed Amount", "Total Charges", "Total Billed", "Amount Billed", "Total", "Charges"]);
  const billedAmountSource = firstLineSource(text, ["Billed Amount", "Total Charges", "Total Billed", "Amount Billed", "Total", "Charges"]);

  const insuranceAdjustmentRaw =
    firstLineValue(text, ["Insurance Adjustment", "Adjustment", "Discount", "Contractual Adjustment"]);
  const insuranceAdjustmentSource = firstLineSource(text, ["Insurance Adjustment", "Adjustment", "Discount", "Contractual Adjustment"]);

  const insurancePaidRaw =
    firstLineValue(text, ["Insurance Paid", "Insurance Payment", "Paid by Insurance", "Carrier Payment"]);
  const insurancePaidSource = firstLineSource(text, ["Insurance Paid", "Insurance Payment", "Paid by Insurance", "Carrier Payment"]);

  const patientResponsibilityRaw =
    firstLineValue(text, ["Patient Responsibility", "Patient Balance", "Amount Due", "Balance Due", "You Owe", "Your Responsibility", "Patient Pay", "Pay Amount"]);
  const patientResponsibilitySource = firstLineSource(text, ["Patient Responsibility", "Patient Balance", "Amount Due", "Balance Due", "You Owe", "Your Responsibility", "Patient Pay", "Pay Amount"]);

  const lineItems = extractLineItems(text);

  const docTypeGuess = guessDocumentType(flat, {
    hasPatientResp: !!patientResponsibilityRaw,
    hasAdjustment: !!insuranceAdjustmentRaw,
  });

  const fields = {
    documentType: { value: docTypeGuess, source: null },
    provider: { value: provider || "Not found", source: providerSource },
    serviceDate: { value: serviceDate || "Not found", source: serviceDateSource },
    service: { value: service || "Not found", source: serviceSource },
    billedAmount: { value: billedAmountRaw, source: billedAmountSource },
    insuranceAdjustment: { value: insuranceAdjustmentRaw, source: insuranceAdjustmentSource },
    insurancePaid: { value: insurancePaidRaw, source: insurancePaidSource },
    patientResponsibility: { value: patientResponsibilityRaw, source: patientResponsibilitySource },
    lineItems,
  };

  return fields;
}

function guessDocumentType(flat, flags) {
  if (/Explanation of Benefits|EOB|This is not a bill/i.test(flat)) {
    return "Insurance Explanation of Benefits (EOB)";
  }
  if (/Lab(?:oratory)? Results|Test Results|Reference Range|Specimen/i.test(flat)) {
    return "Lab Results";
  }
  if (/Visit Summary|Chief Complaint|History of Present Illness|Assessment and Plan/i.test(flat)) {
    return "Visit Summary";
  }
  if (flags.hasPatientResp || flags.hasAdjustment || /Bill|Invoice|Statement/i.test(flat)) {
    return "Medical Bill";
  }
  return "Healthcare Document";
}

// ---------------------------------------------------------------------------
// Explanations
// ---------------------------------------------------------------------------
// Each field gets a plain-language explanation built from the actual values
// found in the document. The `question` is the clickable prompt shown in the
// UI; the `answer` is what appears when the user clicks it.

function explainDocumentType(fields) {
  const t = fields.documentType.value;
  let answer = "";
  if (/EOB|Explanation of Benefits/i.test(t)) {
    answer =
      "This is an Explanation of Benefits (EOB) from your insurance company. It is not a bill. It shows what your provider charged, what insurance paid, and what (if anything) you may owe. Check it against any bill you receive from the provider to make sure the numbers match.";
  } else if (/Medical Bill/i.test(t)) {
    answer =
      "This looks like a bill from a healthcare provider. It shows what was charged for your visit or service, any payments or adjustments, and the amount you may owe. Compare it to your insurance EOB before paying to confirm the balance is correct.";
  } else if (/Lab Results/i.test(t)) {
    answer =
      "This appears to be a lab results report. It lists tests performed and their results, often with a reference range. Results outside the reference range are flagged but do not always indicate a problem — your doctor is the best person to interpret them.";
  } else if (/Visit Summary/i.test(t)) {
    answer =
      "This looks like a visit summary from a doctor's appointment. It typically includes the reason for your visit, what was examined, and the plan for next steps. Keep it to compare against any later bills or lab results.";
  } else {
    answer =
      "We could not confidently classify this document. It may still contain useful billing or clinical information — review the fields below for the details we were able to find.";
  }
  return {
    question: "What kind of document is this?",
    answer,
  };
}

function explainProvider(fields) {
  const v = fields.provider.value;
  return {
    question: "Why does this provider name matter?",
    answer:
      v === "Not found"
        ? "We could not identify a provider or facility name on this document. If one appears, it tells you who performed or billed for the service — important when matching this against other paperwork."
        : `"${v}" is the healthcare provider or facility shown on this document. This is who performed or billed for your service. Use this name to match this document against related bills or your insurance EOB to make sure they refer to the same visit.`,
  };
}

function explainServiceDate(fields) {
  const v = fields.serviceDate.value;
  return {
    question: "Why is this date important?",
    answer:
      v === "Not found"
        ? "No service date was found. The date tells you when care was given, which helps you match this document to other paperwork for the same visit."
        : `"${v}" is the date the service was performed (not necessarily the date the bill was issued). Matching dates across your bill and EOB is one of the fastest ways to confirm they describe the same visit.`,
  };
}

function explainService(fields) {
  const v = fields.service.value;
  return {
    question: "What is this service?",
    answer:
      v === "Not found"
        ? "No specific service description was found. The service line describes the care you received, such as an office visit or a procedure code."
        : `"${v}" describes the service or procedure shown on this document. Providers often include a CPT code alongside it; you can look up that code to confirm the service matches what you actually received.`,
  };
}

function explainBilledAmount(fields) {
  const raw = fields.billedAmount.value;
  if (!raw) {
    return {
      question: "What is the billed amount?",
      answer:
        "No total billed amount was found. The billed amount (or 'total charges') is the sticker price the provider submitted for the services — before any insurance adjustment or payment. It is usually much higher than what is actually owed.",
    };
  }
  const amt = moneyValue(raw);
  const adj = fields.insuranceAdjustment.value ? moneyValue(fields.insuranceAdjustment.value) : null;
  const paid = fields.insurancePaid.value ? moneyValue(fields.insurancePaid.value) : null;
  const parts = [`The billed amount of $${amt.toFixed(2)} is the total the provider charged for the services listed (the "sticker price," before insurance).`];
  if (adj != null) {
    parts.push(`Your insurance negotiated a reduction of $${adj.toFixed(2)} — this is a contractual adjustment, not something you owe.`);
  }
  if (paid != null) {
    parts.push(`Insurance paid $${paid.toFixed(2)} of the remaining balance.`);
  }
  const remaining = amt - (adj || 0) - (paid || 0);
  if (Number.isFinite(remaining) && remaining > 0.005) {
    parts.push(`That leaves $${remaining.toFixed(2)} which may be your responsibility, but confirm it against the patient-responsibility line before paying.`);
  }
  return {
    question: `Why am I being charged $${amt.toFixed(2)} for this?`,
    answer: parts.join(" "),
  };
}

function explainInsuranceAdjustment(fields) {
  const raw = fields.insuranceAdjustment.value;
  if (!raw) {
    return {
      question: "What is an insurance adjustment?",
      answer:
        "No adjustment was found on this document. An insurance (or contractual) adjustment is the discount your insurer negotiated with the provider — the difference between the billed price and the allowed amount. You do not owe this portion.",
    };
  }
  const amt = moneyValue(raw);
  const billed = fields.billedAmount.value ? moneyValue(fields.billedAmount.value) : null;
  const answer =
    billed != null
      ? `The $${amt.toFixed(2)} adjustment is the amount your insurance company negotiated off the $${billed.toFixed(2)} charged. This is a discount between the provider and the insurer — you are not responsible for paying it.`
      : `The $${amt.toFixed(2)} adjustment is the discount your insurer negotiated with the provider. You do not owe this amount; it is written off under their contract.`;
  return { question: "Why was this amount adjusted?", answer };
}

function explainInsurancePaid(fields) {
  const raw = fields.insurancePaid.value;
  if (!raw) {
    return {
      question: "What did insurance pay?",
      answer:
        "No insurance payment was found on this document. If you have coverage, the 'insurance paid' line shows how much your plan sent to the provider for this service.",
    };
  }
  const amt = moneyValue(raw);
  const billed = fields.billedAmount.value ? moneyValue(fields.billedAmount.value) : null;
  const answer =
    billed != null
      ? `Insurance paid $${amt.toFixed(2)} of the $${billed.toFixed(2)} billed. This payment was sent directly to the provider and is credited toward your bill.`
      : `Insurance paid $${amt.toFixed(2)} toward this service. This was sent to the provider and is already credited — you should not be billed for this portion.`;
  return { question: "What did insurance actually pay?", answer };
}

function explainPatientResponsibility(fields) {
  const raw = fields.patientResponsibility.value;
  if (!raw) {
    return {
      question: "What is patient responsibility?",
      answer:
        "No patient-responsibility amount was found. This is the line that tells you what you owe after insurance has paid and adjustments have been applied. If this document is an EOB, it is not a bill — your provider's bill is what you actually pay.",
    };
  }
  const amt = moneyValue(raw);
  const billed = fields.billedAmount.value ? moneyValue(fields.billedAmount.value) : null;
  const adj = fields.insuranceAdjustment.value ? moneyValue(fields.insuranceAdjustment.value) : null;
  const paid = fields.insurancePaid.value ? moneyValue(fields.insurancePaid.value) : null;

  const breakdown = [];
  if (billed != null) breakdown.push(`Total charged: $${billed.toFixed(2)}`);
  if (adj != null) breakdown.push(`Insurance adjustment: -$${adj.toFixed(2)}`);
  if (paid != null) breakdown.push(`Insurance paid: -$${paid.toFixed(2)}`);

  const computed = billed - (adj || 0) - (paid || 0);
  const matches = Number.isFinite(computed) && Math.abs(computed - amt) < 0.01;

  const lead =
    billed != null
      ? `You are being asked to pay $${amt.toFixed(2)} as your share of this visit.`
      : `The $${amt.toFixed(2)} shown is your patient responsibility — the portion you owe after insurance.`;

  const detail =
    breakdown.length > 0
      ? ` Here is how it was reached: ${breakdown.join(", ")}.`
      : "";

  const caution = matches
    ? " This matches the expected balance after insurance, so the figure looks consistent with the other numbers on this document."
    : " The numbers don't perfectly add up against the billed amount, adjustment, and insurance payment shown — it's worth verifying this amount with your provider before paying.";

  return {
    question: `Why am I being charged $${amt.toFixed(2)} for this?`,
    answer: lead + detail + caution,
  };
}

function explainLineItem(item) {
  const amt = item.amount;
  return {
    question: `Why am I being charged $${amt.toFixed(2)} for "${item.description}"?`,
    answer:
      `"${item.description}" is an individual charge of $${amt.toFixed(2)} listed on this document. Line items add up to the total billed amount. If you do not recognize this service, or if it appears for a visit you did not have, ask your provider for an itemized statement and verify the CPT code. Compare it to your insurance EOB to confirm the charge was approved and not already covered.`,
    source: item.source,
  };
}

function buildExplanations(fields) {
  const explanations = {
    documentType: explainDocumentType(fields),
    provider: explainProvider(fields),
    serviceDate: explainServiceDate(fields),
    service: explainService(fields),
    billedAmount: explainBilledAmount(fields),
    insuranceAdjustment: explainInsuranceAdjustment(fields),
    insurancePaid: explainInsurancePaid(fields),
    patientResponsibility: explainPatientResponsibility(fields),
    lineItems: fields.lineItems.map((item) => explainLineItem(item)),
  };
  return explanations;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    if (!buffer.length) {
      return res.status(400).json({ error: "No PDF data was received." });
    }

    const pdfData = await pdfParse(buffer);
    let text = pdfData.text || "";
    let usedOcr = false;

    if (!text.trim()) {
      usedOcr = true;
      text = await ocrPdf(buffer);
    }

    if (!text.trim()) {
      return res.status(400).json({
        error:
          "We couldn't read any text in that PDF, even with OCR. The file may be blank or corrupted.",
      });
    }

    const fields = extractFields(text);
    const explanations = buildExplanations(fields);

    return res.status(200).json({
      success: true,
      message: usedOcr
        ? "Document analyzed successfully (text recovered via OCR)."
        : "Document analyzed successfully.",
      characterCount: text.length,
      textPreview: text.slice(0, 1500),
      usedOcr,
      fields,
      explanations,
    });
  } catch (error) {
    console.error("PDF analysis error:", error);
    return res.status(500).json({
      error: "Something went wrong while reading the PDF.",
    });
  }
};
