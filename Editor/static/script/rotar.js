let pdfjsLib = null;

async function loadPDFJS() {
  try {
    if (typeof window.pdfjsLib === "undefined") {
      const script = document.createElement("script");
      script.type = "module"; 
      script.src = "/static/pdfjs/build/pdf.js"; 
      document.head.appendChild(script);

      await new Promise((resolve, reject) => {
        script.onload = resolve;
        script.onerror = reject;
      });
    }

    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      "/static/pdfjs/build/pdf.worker.js";
    pdfjsLib = window.pdfjsLib;
    console.log("PDF.js cargado localmente");
  } catch (error) {
    console.warn("No se pudo cargar PDF.js local:", error);
  }
}

class PDFRotator {
  constructor() {
    this.pdfDoc = null;
    this.pdfFile = null;
    this.currentPageNum = 1;
    this.currentScale = 1.0;
    this.renderScale = 1.5;
    this.pageRotations = {};
    this.originalPdfFile = null;

    this.initializeElements();
    this.bindEvents();
    this.csrftoken = this.getCSRFToken();
  }

  initializeElements() {
    this.selectBtn = document.getElementById("selectBtn");
    this.pdfFileInput = document.getElementById("pdf-file-input");
    this.uploadArea = document.getElementById("uploadArea");
    this.viewerSection = document.getElementById("viewer-section");
    this.pdfCanvas = document.getElementById("pdf-render-canvas");

    if (this.pdfCanvas) {
      this.pdfCtx = this.pdfCanvas.getContext("2d");
    }

    this.prevPageBtn = document.getElementById("prev-page-btn");
    this.nextPageBtn = document.getElementById("next-page-btn");
    this.currentPageSpan = document.getElementById("current-page");
    this.totalPagesSpan = document.getElementById("total-pages");
    this.zoomInBtn = document.getElementById("zoom-in-btn");
    this.zoomOutBtn = document.getElementById("zoom-out-btn");
    this.rotateLeftBtn = document.getElementById("rotate-left-btn");
    this.rotateRightBtn = document.getElementById("rotate-right-btn");
    this.downloadBtn = document.getElementById("download-btn");
    this.loadingDiv = document.getElementById("loading");
    this.messages = document.getElementById("messages");
  }

  bindEvents() {
    if (this.selectBtn) {
      this.selectBtn.addEventListener("click", () => this.pdfFileInput.click());
    }

    if (this.pdfFileInput) {
      this.pdfFileInput.addEventListener("change", (e) =>
        this.handleFileUpload(e)
      );
    }

    if (this.prevPageBtn) {
      this.prevPageBtn.addEventListener("click", () => this.changePage(-1));
    }

    if (this.nextPageBtn) {
      this.nextPageBtn.addEventListener("click", () => this.changePage(1));
    }

    if (this.zoomInBtn) {
      this.zoomInBtn.addEventListener("click", () => this.changeZoom(0.2));
    }

    if (this.zoomOutBtn) {
      this.zoomOutBtn.addEventListener("click", () => this.changeZoom(-0.2));
    }

    if (this.rotateLeftBtn) {
      this.rotateLeftBtn.addEventListener("click", () =>
        this.rotateCurrentPage(-90)
      );
    }

    if (this.rotateRightBtn) {
      this.rotateRightBtn.addEventListener("click", () =>
        this.rotateCurrentPage(90)
      );
    }

    if (this.downloadBtn) {
      this.downloadBtn.addEventListener("click", () => this.saveRotatedPDF());
    }

    this.setupDragAndDrop();
  }

  setupDragAndDrop() {
    if (!this.uploadArea) return;

    this.uploadArea.addEventListener("dragover", (e) => {
      e.preventDefault();
      this.uploadArea.classList.add("drag-over");
    });

    this.uploadArea.addEventListener("dragleave", (e) => {
      e.preventDefault();
      this.uploadArea.classList.remove("drag-over");
    });

    this.uploadArea.addEventListener("drop", (e) => {
      e.preventDefault();
      this.uploadArea.classList.remove("drag-over");

      const files = Array.from(e.dataTransfer.files).filter(
        (file) => file.type === "application/pdf"
      );
      if (files.length > 0) {
        this.pdfFileInput.files = this.createFileList([files[0]]);
        this.handleFileUpload({ target: { files: [files[0]] } });
      }
    });
  }

  createFileList(files) {
    const dt = new DataTransfer();
    files.forEach((file) => dt.items.add(file));
    return dt.files;
  }

async renderPage(pageNum) {
  if (!this.pdfDoc) return;
  this.showLoading(true);

  try {
    const page = await this.pdfDoc.getPage(pageNum);

    const baseRotation = page.rotate || 0; 
    const extraRotation = this.pageRotations[pageNum - 1] || 0;
    const rotationAngle = (baseRotation + extraRotation) % 360;

    const viewport = page.getViewport({
      scale: this.renderScale,
      rotation: rotationAngle,
    });

    this.pdfCanvas.width = viewport.width;
    this.pdfCanvas.height = viewport.height;

    const renderContext = {
      canvasContext: this.pdfCtx,
      viewport: viewport,
    };

    await page.render(renderContext).promise;

    this.pdfCanvas.style.transform = `scale(${this.currentScale})`;
    this.pdfCanvas.style.transformOrigin = "top left";

    this.currentPageSpan.textContent = pageNum;
    this.prevPageBtn.disabled = this.currentPageNum <= 1;
    this.nextPageBtn.disabled = this.currentPageNum >= this.pdfDoc.numPages;
  } catch (error) {
    console.error("Error rendering page:", error);
    this.showMessage("Error al renderizar la página", "error");
  } finally {
    this.showLoading(false);
  }
}

  async handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (file.type !== "application/pdf") {
      this.showMessage("Por favor selecciona un archivo PDF válido", "error");
      return;
    }

    // Validar tamaño (50MB máximo)
    const maxSize = 50 * 1024 * 1024;
    if (file.size > maxSize) {
      this.showMessage(
        "El archivo es demasiado grande. Máximo 50MB permitido",
        "error"
      );
      return;
    }

    this.showLoading(true);
    this.showFileSelected(file);

    try {
      const arrayBuffer = await file.arrayBuffer();
      this.pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      this.totalPagesSpan.textContent = this.pdfDoc.numPages;
      this.currentPageNum = 1;
      this.currentScale = 1.0;
      this.renderScale = 1.5;
      this.pageRotations = {};

      this.originalPdfFile = file;

      await this.renderPage(this.currentPageNum);
      this.viewerSection.style.display = "block";
      this.showMessage(
        `PDF cargado exitosamente (${this.pdfDoc.numPages} páginas)`,
        "success"
      );
    } catch (error) {
      console.error("Error loading PDF:", error);
      this.showMessage("Error al cargar el PDF", "error");
      this.clearFile();
    } finally {
      this.showLoading(false);
    }
  }

  showFileSelected(file) {
    this.uploadArea.style.display = "none";

    let fileDisplay = document.querySelector(".selected-file-display");
    if (!fileDisplay) {
      fileDisplay = document.createElement("div");
      fileDisplay.className = "selected-file-display";
      this.uploadArea.parentNode.insertBefore(
        fileDisplay,
        this.uploadArea.nextSibling
      );
    }

    fileDisplay.innerHTML = `
      <div class="file-info">
        <svg class="file-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14,2 14,8 20,8"/>
        </svg>
        <div class="file-details">
          <span class="file-name">${file.name}</span>
          <span class="file-size">${this.formatFileSize(file.size)}</span>
        </div>
      </div>
      <button type="button" class="remove-file" onclick="rotator.clearFile()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    `;
    fileDisplay.style.display = "flex";
  }

  changePage(direction) {
    const newPage = this.currentPageNum + direction;
    if (newPage >= 1 && newPage <= this.pdfDoc.numPages) {
      this.currentPageNum = newPage;
      this.renderPage(this.currentPageNum);
    }
  }

  changeZoom(delta) {
    this.currentScale = Math.min(Math.max(this.currentScale + delta, 0.5), 3.0);
    this.renderPage(this.currentPageNum);
  }

  rotateCurrentPage(angleDelta) {
    const pageIndex = this.currentPageNum - 1;
    let currentAngle = this.pageRotations[pageIndex] || 0;

    currentAngle = (currentAngle + angleDelta) % 360;
    if (currentAngle < 0) currentAngle += 360;

    this.pageRotations[pageIndex] = currentAngle;
    this.renderPage(this.currentPageNum);

    const direction = angleDelta > 0 ? "derecha" : "izquierda";
    this.showMessage(
      `Página ${this.currentPageNum} rotada hacia la ${direction}`,
      "info"
    );
  }

async saveRotatedPDF() { 
    if (!this.originalPdfFile) {
        this.showMessage("No hay archivo para procesar", "warning");
        return;
    }

    this.showLoading(true);

    try {
        const finalRotations = {};
        for (let i = 0; i < this.pdfDoc.numPages; i++) {
            const page = await this.pdfDoc.getPage(i + 1);
            const baseRotation = page.rotate || 0; 
            const extraRotation = this.pageRotations[i] || 0; 
            finalRotations[i] = (baseRotation + extraRotation) % 360;
        }

        const formData = new FormData();
        formData.append("pdf_file", this.originalPdfFile);
        formData.append("page_rotations", JSON.stringify(finalRotations));

        const response = await fetch(window.location.href, {
            method: "POST",
            headers: {
                "X-CSRFToken": this.csrftoken,
            },
            body: formData,
        });

        if (response.ok) {
            const contentDisposition = response.headers.get("Content-Disposition");
            let filename = this.getRotatedFilename();

            if (contentDisposition) {
                const filenameMatch = contentDisposition.match(
                    /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/
                );
                if (filenameMatch) {
                    filename = filenameMatch[1].replace(/['"]/g, "");
                }
            }

            const blob = await response.blob();
            this.downloadBlob(blob, filename);
            this.showMessage("PDF rotado y descargado exitosamente", "success");
        } else {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || "Error al procesar el PDF");
        }
    } catch (error) {
        console.error("Error durante la descarga:", error);
        this.showMessage(`Error: ${error.message}`, "error");
    } finally {
        this.showLoading(false);
    }
}


  downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  getRotatedFilename() {
    const baseName = this.originalPdfFile.name.replace(".pdf", "");
    return `${baseName}_rotado.pdf`;
  }

  clearFile() {
    this.pdfDoc = null;
    this.originalPdfFile = null;
    this.pdfFileInput.value = "";
    this.currentPageNum = 1;
    this.pageRotations = {};

    this.uploadArea.style.display = "block";
    this.viewerSection.style.display = "none";

    const fileDisplay = document.querySelector(".selected-file-display");
    if (fileDisplay) {
      fileDisplay.remove();
    }
  }

  formatFileSize(bytes) {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return (
      Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
    );
  }

  getCSRFToken() {
    const cookies = document.cookie.split(";");
    for (const cookie of cookies) {
      const [name, value] = cookie.trim().split("=");
      if (name === "csrftoken") {
        return decodeURIComponent(value);
      }
    }

    const csrfInput = document.querySelector(
      'input[name="csrfmiddlewaretoken"]'
    );
    return csrfInput ? csrfInput.value : null;
  }

  showMessage(message, type = "info") {
    if (!this.messages) {
      this.messages = document.createElement("div");
      this.messages.id = "messages";
      this.messages.className = "messages";
      document.body.appendChild(this.messages);
    }

    const messageEl = document.createElement("div");
    messageEl.className = `message ${type}`;

    const icons = {
      success:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20,6 9,17 4,12"/></svg>',
      error:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
      warning:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
      info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
    };

    messageEl.innerHTML = `
      <div class="message-icon">${icons[type] || icons.info}</div>
      <span>${message}</span>
    `;

    this.messages.appendChild(messageEl);

    setTimeout(() => {
      if (messageEl.parentNode) {
        messageEl.remove();
      }
    }, 3000);
  }

  showLoading(show) {
    if (!this.loadingDiv) {
      this.loadingDiv = document.createElement("div");
      this.loadingDiv.id = "loading";
      this.loadingDiv.className = "loading";
      this.loadingDiv.innerHTML = `
        <div class="spinner"></div>
        <p>Procesando PDF...</p>
      `;
      document.body.appendChild(this.loadingDiv);
    }

    this.loadingDiv.style.display = show ? "flex" : "none";
  }
}

// Inicializar
let rotator;
document.addEventListener("DOMContentLoaded", async () => {
  await loadPDFJS();
  rotator = new PDFRotator();
});

