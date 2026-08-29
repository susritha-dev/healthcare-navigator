const uploadForm = document.getElementById("uploadForm");
const documentInput = document.getElementById("documentInput");
const statusMessage = document.getElementById("statusMessage");
const results = document.getElementById("results");

const documentType = document.getElementById("documentType");
const providerResult = document.getElementById("providerResult");
const dateResult = document.getElementById("dateResult");
const serviceResult = document.getElementById("serviceResult");
const patientResult = document.getElementById("patientResult");
const summaryResult = document.getElementById("summaryResult");

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

  statusMessage.textContent = "Analyzing your document...";
  results.classList.add("hidden");

  try {
    const fileBuffer = await file.arrayBuffer();

    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: {
        "Content-Type": "application/pdf"
      },
      body: fileBuffer
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Something went wrong.");
    }

    statusMessage.textContent = "Document analyzed successfully.";

    results.classList.remove("hidden");

    documentType.textContent = formatDocumentType(
      data.documentType || "UNKNOWN"
    );

    providerResult.textContent =
      data.provider || "Not found";

    dateResult.textContent =
      data.date || "Not found";

    serviceResult.textContent =
      data.service || "Not found";

    patientResult.textContent =
      data.patientResponsibility || "Not found";

    summaryResult.textContent =
      data.summary || "No summary was generated.";
  } catch (error) {
    console.error(error);

    statusMessage.textContent =
      error.message || "Could not analyze the document.";

    results.classList.add("hidden");
  }
});

function formatDocumentType(type) {
  const labels = {
    BILL: "Medical Bill",
    EOB: "Explanation of Benefits",
    LAB_RESULT: "Lab Result",
    VISIT_SUMMARY: "Visit Summary",
    DISCHARGE_SUMMARY: "Discharge Summary",
    UNKNOWN: "Healthcare Document"
  };

  return labels[type] || "Healthcare Document";
}
