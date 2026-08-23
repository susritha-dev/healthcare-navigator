const uploadForm = document.getElementById("uploadForm");
const documentInput = document.getElementById("documentInput");
const statusMessage = document.getElementById("statusMessage");
const documentList = document.getElementById("documentList");
const results = document.getElementById("results");

const documentType = document.getElementById("documentType");
const providerResult = document.getElementById("providerResult");
const dateResult = document.getElementById("dateResult");
const serviceResult = document.getElementById("serviceResult");
const patientResult = document.getElementById("patientResult");
const summaryResult = document.getElementById("summaryResult");


/*
  Store the uploaded documents in memory.

  Each document will look like:

  {
    id: "...",
    file: File,
    status: "Processing"
  }
*/

let documents = [];


/*
  When the user selects files, create a document
  object for each one.
*/

documentInput.addEventListener("change", () => {

  const selectedFiles = Array.from(documentInput.files);

  if (selectedFiles.length === 0) {
    return;
  }


  selectedFiles.forEach((file) => {

    // Only allow PDFs
    if (file.type !== "application/pdf") {
      return;
    }


    const document = {
      id: crypto.randomUUID(),
      file: file,
      status: "Ready"
    };


    documents.push(document);

  });


  renderDocuments();


  statusMessage.textContent =
    `${selectedFiles.length} document${selectedFiles.length === 1 ? "" : "s"} selected.`;


  // Allow the user to select the same file again later
  documentInput.value = "";

});


/*
  Submit button
*/

uploadForm.addEventListener("submit", async (event) => {

  event.preventDefault();


  if (documents.length === 0) {

    statusMessage.textContent =
      "Please choose at least one PDF.";

    return;
  }


  results.classList.add("hidden");


  statusMessage.textContent =
    "Analyzing your documents...";


  /*
    Analyze every document separately.

    Promise.allSettled means that if one document fails,
    the other documents can still finish processing.
  */

  await Promise.allSettled(
    documents.map((document) => analyzeDocument(document))
  );


  const successfulDocuments = documents.filter(
    (document) => document.status === "Uploaded"
  );

  const failedDocuments = documents.filter(
    (document) => document.status === "Error"
  );


  if (failedDocuments.length === 0) {

    statusMessage.textContent =
      `Successfully analyzed ${successfulDocuments.length} document${successfulDocuments.length === 1 ? "" : "s"}.`;

  } else {

    statusMessage.textContent =
      `${successfulDocuments.length} document${successfulDocuments.length === 1 ? "" : "s"} analyzed, ${failedDocuments.length} failed.`;

  }


  renderDocuments();

});


/*
  Send one document to the backend.
*/

async function analyzeDocument(document) {

  document.status = "Processing";

  renderDocuments();


  try {

    const fileBuffer = await document.file.arrayBuffer();


    const response = await fetch("/api/analyze", {

      method: "POST",

      headers: {
        "Content-Type": "application/pdf"
      },

      body: fileBuffer

    });


    const data = await response.json();


    if (!response.ok) {

      throw new Error(
        data.error || "Something went wrong."
      );

    }


    /*
      The document successfully reached the backend.
    */

    document.status = "Uploaded";

    renderDocuments();


    /*
      For now, display the latest successful
      document's analysis in the existing
      results section.

      Later we can give each document its own
      analysis page/card.
    */

    showResults(document, data);


  } catch (error) {

    console.error(
      `Error analyzing ${document.file.name}:`,
      error
    );


    document.status = "Error";

    document.error =
      error.message || "Could not analyze the PDF.";


    renderDocuments();

  }

}


/*
  Display all document cards.
*/

function renderDocuments() {

  documentList.innerHTML = "";


  documents.forEach((document) => {

    const file = document.file;


    const card = document.createElement("div");

    card.className = "document-card";


    /*
      Left side of the card
    */

    const documentInfo =
      document.createElement("div");

    documentInfo.className = "document-info";


    /*
      PDF icon
    */

    const icon =
      document.createElement("div");

    icon.className = "document-icon";

    icon.textContent = "PDF";


    /*
      File details
    */

    const details =
      document.createElement("div");


    const filename =
      document.createElement("h3");

    filename.textContent = file.name;


    const metadata =
      document.createElement("p");

    metadata.textContent =
      `PDF • ${formatFileSize(file.size)}`;


    details.appendChild(filename);
    details.appendChild(metadata);


    documentInfo.appendChild(icon);
    documentInfo.appendChild(details);


    /*
      Status
    */

    const status =
      document.createElement("div");

    status.className =
      "document-status";


    if (document.status === "Uploaded") {

      status.classList.add("uploaded");

      status.textContent = "Uploaded";

    } else if (document.status === "Processing") {

      status.classList.add("processing");

      status.textContent = "Processing";

    } else if (document.status === "Error") {

      status.classList.add("error");

      status.textContent = "Error";

    } else {

      status.textContent = "Ready";

    }


    /*
      Assemble card
    */

    card.appendChild(documentInfo);
    card.appendChild(status);


    documentList.appendChild(card);

  });

}


/*
  Show the existing analysis results section.
*/

function showResults(document, data) {

  results.classList.remove("hidden");


  documentType.textContent =
    "PDF Read Successfully";


  providerResult.textContent =
    "Coming next";


  dateResult.textContent =
    "Coming next";


  serviceResult.textContent =
    "Coming next";


  patientResult.textContent =
    "Coming next";


  summaryResult.textContent =
    data.textPreview ||
    `Text was extracted successfully from ${document.file.name}.`;

}


/*
  Convert bytes into something readable.
*/

function formatFileSize(bytes) {

  if (bytes === 0) {
    return "0 Bytes";
  }


  const units = [
    "Bytes",
    "KB",
    "MB",
    "GB"
  ];


  const index =
    Math.floor(
      Math.log(bytes) / Math.log(1024)
    );


  return (
    (bytes / Math.pow(1024, index)).toFixed(1)
    + " "
    + units[index]
  );

}