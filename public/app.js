const uploadForm = document.getElementById("uploadForm");
const documentInput = document.getElementById("documentInput");
const statusMessage = document.getElementById("statusMessage");
const results = document.getElementById("results");

const fieldConfigs = [
  { key: "documentType", valueId: "documentType", btnId: "documentTypeExplain", panelId: "documentTypeExplanation" },
  { key: "provider", valueId: "providerResult", btnId: "providerExplain", panelId: "providerExplanation" },
  { key: "serviceDate", valueId: "dateResult", btnId: "dateExplain", panelId: "dateExplanation" },
  { key: "service", valueId: "serviceResult", btnId: "serviceExplain", panelId: "serviceExplanation" },
  { key: "billedAmount", valueId: "billedAmountResult", btnId: "billedAmountExplain", panelId: "billedAmountExplanation" },
  { key: "insuranceAdjustment", valueId: "insuranceAdjustmentResult", btnId: "insuranceAdjustmentExplain", panelId: "insuranceAdjustmentExplanation" },
  { key: "insurancePaid", valueId: "insurancePaidResult", btnId: "insurancePaidExplain", panelId: "insurancePaidExplanation" },
  { key: "patientResponsibility", valueId: "patientResult", btnId: "patientExplain", panelId: "patientExplanation" },
];

function formatMoney(value) {
  if (value == null) return null;
  const num = typeof value === "number" ? value : parseFloat(String(value).replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(num)) return null;
  return `$${num.toFixed(2)}`;
}

function moneyKeys() {
  return new Set(["billedAmount", "insuranceAdjustment", "insurancePaid", "patientResponsibility"]);
}

function setField(config, fields, explanations) {
  const valueEl = document.getElementById(config.valueId);
  const btnEl = document.getElementById(config.btnId);
  const panelEl = document.getElementById(config.panelId);
  const field = fields[config.key];
  const explanation = explanations[config.key];

  if (!field) {
    valueEl.textContent = "—";
    btnEl.hidden = true;
    panelEl.hidden = true;
    panelEl.textContent = "";
    return;
  }

  let display = field.value;
  if (display == null || display === "") {
    display = "Not found";
  } else if (moneyKeys().has(config.key) && typeof display === "string" && /[0-9]/.test(display)) {
    const formatted = formatMoney(display);
    if (formatted) display = formatted;
  }
  valueEl.textContent = display;

  if (explanation && explanation.question && explanation.answer) {
    btnEl.textContent = explanation.question;
    btnEl.hidden = false;
    panelEl.hidden = true;
    panelEl.textContent = "";

    const answerEl = document.createElement("p");
    answerEl.className = "explanation-answer";
    answerEl.textContent = explanation.answer;
    panelEl.appendChild(answerEl);

    if (field.source) {
      const sourceEl = document.createElement("p");
      sourceEl.className = "explanation-source";
      sourceEl.textContent = `"${field.source}"`;
      panelEl.appendChild(sourceEl);
    }

    btnEl.onclick = () => {
      const isOpen = !panelEl.hidden;
      panelEl.hidden = isOpen;
      btnEl.setAttribute("aria-expanded", String(!isOpen));
    };
    btnEl.setAttribute("aria-expanded", "false");
  } else {
    btnEl.hidden = true;
    panelEl.hidden = true;
    panelEl.textContent = "";
  }
}

function renderLineItems(lineItems, explanations) {
  const container = document.getElementById("lineItems");
  container.innerHTML = "";

  if (!lineItems || lineItems.length === 0) {
    const empty = document.createElement("p");
    empty.className = "line-items-empty";
    empty.textContent =
      "No individual line items were detected. The summary above still reflects what was found.";
    container.appendChild(empty);
    return;
  }

  lineItems.forEach((item, index) => {
    const wrap = document.createElement("div");
    wrap.className = "line-item";

    const head = document.createElement("div");
    head.className = "line-item-head";

    const desc = document.createElement("span");
    desc.className = "line-item-desc";
    desc.textContent = item.description;

    const amt = document.createElement("strong");
    amt.className = "line-item-amount";
    const formatted = formatMoney(item.amount);
    amt.textContent = formatted || item.amount;

    head.appendChild(desc);
    head.appendChild(amt);
    wrap.appendChild(head);

    const explanation = explanations.lineItems && explanations.lineItems[index];
    if (explanation && explanation.question && explanation.answer) {
      const btn = document.createElement("button");
      btn.className = "explain-toggle";
      btn.type = "button";
      btn.textContent = explanation.question;
      btn.setAttribute("aria-expanded", "false");

      const panel = document.createElement("div");
      panel.className = "explanation-panel";
      panel.hidden = true;

      const answerEl = document.createElement("p");
      answerEl.className = "explanation-answer";
      answerEl.textContent = explanation.answer;
      panel.appendChild(answerEl);

      if (explanation.source || item.source) {
        const sourceEl = document.createElement("p");
        sourceEl.className = "explanation-source";
        sourceEl.textContent = `"${explanation.source || item.source}"`;
        panel.appendChild(sourceEl);
      }

      btn.onclick = () => {
        const isOpen = !panel.hidden;
        panel.hidden = isOpen;
        btn.setAttribute("aria-expanded", String(!isOpen));
      };

      wrap.appendChild(btn);
      wrap.appendChild(panel);
    }

    container.appendChild(wrap);
  });
}

uploadForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const file = documentInput.files[0];

  if (!file) {
    statusMessage.textContent = "Please choose a PDF first.";
    results.classList.add("hidden");
    return;
  }

  if (file.type !== "application/pdf") {
    statusMessage.textContent = "Please upload a PDF document.";
    results.classList.add("hidden");
    return;
  }

  statusMessage.textContent =
    "Reading and analyzing your document... Scanned documents may take a little longer.";
  results.classList.add("hidden");

  try {
    const fileBuffer = await file.arrayBuffer();

    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: {
        "Content-Type": "application/pdf",
      },
      body: fileBuffer,
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Something went wrong.");
    }

    statusMessage.textContent = data.message || "Document analyzed successfully.";
    if (data.usedOcr) {
      statusMessage.textContent += " This scanned document was read using OCR.";
    }
    results.classList.remove("hidden");

    if (data.fields && data.explanations) {
      fieldConfigs.forEach((config) => {
        setField(config, data.fields, data.explanations);
      });
      renderLineItems(data.fields.lineItems, data.explanations);
    } else {
      fieldConfigs.forEach((config) => {
        const valueEl = document.getElementById(config.valueId);
        const btnEl = document.getElementById(config.btnId);
        const panelEl = document.getElementById(config.panelId);
        valueEl.textContent = "—";
        btnEl.hidden = true;
        panelEl.hidden = true;
        panelEl.textContent = "";
      });
      renderLineItems([], {});
    }

    const summaryResult = document.getElementById("summaryResult");
    summaryResult.textContent =
      data.textPreview || "Text was extracted, but no preview was returned.";
  } catch (error) {
    console.error(error);
    statusMessage.textContent = error.message || "Could not analyze the PDF.";
    results.classList.add("hidden");
  }
});
