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
    console.log("✅ PDF.js cargado localmente");
  } catch (error) {
    console.warn("⚠️ No se pudo cargar PDF.js local:", error);
  }
}

class PDFMerger {
  constructor() {
    this.currentFiles = [];

    this.selectedFiles = [];
    this.dropZone = document.getElementById("dropZone");
    this.fileInput = document.getElementById("pdf_files");
    this.fileList = document.getElementById("fileList");
    this.filesContainer = document.getElementById("filesContainer");
    this.submitBtn = document.getElementById("submitBtn");
    this.uploadForm = document.getElementById("uploadForm");
    this.messages = document.getElementById("messages");

    this.bindEvents();
  }

  bindEvents() {
    // Drag & Drop
    this.dropZone.addEventListener("dragover", (e) => this.handleDragOver(e));
    this.dropZone.addEventListener("dragleave", (e) => this.handleDragLeave(e));
    this.dropZone.addEventListener("drop", (e) => this.handleDrop(e));

    // Click en drop zone → input
    this.dropZone.addEventListener("click", () => this.fileInput.click());

    // Selección de archivos
    this.fileInput.addEventListener("change", (e) => this.handleFileSelect(e));

    // Envío de formulario
    this.uploadForm.addEventListener("submit", (e) => this.handleFormSubmit(e));
  }

async handleFileSelect(e) {
    const newFiles = Array.from(e.target.files);
    if (!newFiles.length) return;

    const maxFiles = 10;
    const totalFilesAfterAdd = this.selectedFiles.length + newFiles.length;

    if (totalFilesAfterAdd > maxFiles) {
        this.showMessage(`Solo puedes subir un máximo de ${maxFiles} archivos PDF.`, "error");
        e.target.value = "";
        return;
    }

    const pdfFiles = newFiles.filter((f) => f.type === "application/pdf");
    if (pdfFiles.length !== newFiles.length) {
        this.showMessage(
            "Algunos archivos no son PDFs válidos y fueron omitidos",
            "warning"
        );
    }

    const validFiles = [];
    for (let file of pdfFiles) {
        const valid = await this.validatePdf(file);
        if (valid) {
            validFiles.push(file);
        } else {
            this.showMessage(`El archivo ${file.name} está corrupto`, "error");
        }
    }

    if (validFiles.length) {
        this.selectedFiles.push(...validFiles); 
        this.addFiles(validFiles);
    }
}


  async validatePdf(file) {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      await pdfDoc.getPage(1);
      return true;
    } catch {
      return false;
    }
  }

  addFiles(newFiles) {
    const uniqueFiles = newFiles.filter(
      (newFile) =>
        !this.currentFiles.some(
          (f) => f.name === newFile.name && f.size === newFile.size
        )
    );

    if (!uniqueFiles.length) {
      this.showMessage(
        "Los archivos seleccionados ya están en la lista",
        "warning"
      );
      return;
    }

    this.currentFiles.push(...uniqueFiles);
    this.updateDisplay();
    this.updateFileInput();
    this.showMessage(`${uniqueFiles.length} archivo(s) agregado(s)`, "success");
  }

  updateFileInput() {
    const dt = new DataTransfer();
    this.currentFiles.forEach((file) => dt.items.add(file));
    this.fileInput.files = dt.files;
  }

  updateDisplay() {
    if (!this.currentFiles.length) {
      this.fileList.style.display = "none";
      this.submitBtn.style.display = "none";
      this.submitBtn.disabled = true;
      return;
    }

    this.fileList.style.display = "block";
    this.submitBtn.style.display = "block";
    this.submitBtn.disabled = false;

    this.renderFileList();
  }

  renderFileList() {
    this.filesContainer.innerHTML = "";
    this.currentFiles.forEach((file, index) => {
      const fileItem = this.createFileItem(file, index);
      this.filesContainer.appendChild(fileItem);
      this.generatePreview(file, index);
    });
  }

  createFileItem(file, index) {
    const fileItem = document.createElement("div");
    fileItem.className = "file-item";
    fileItem.draggable = true;
    fileItem.dataset.index = index;

    fileItem.innerHTML = `
            <div class="drag-handle">☰</div>
            <div class="file-order-number">${index + 1}</div>
            <div class="file-preview">
                <canvas class="pdf-thumbnail"></canvas>
                <div class="preview-loading">⏳</div>
            </div>
            <div class="file-info">
                <div class="file-details">
                    <span class="file-name">${file.name}</span>
                    <span class="file-size">${this.formatFileSize(
                      file.size
                    )}</span>
                </div>
            </div>
            <button type="button" class="remove-file" onclick="merger.removeFile(${index})">❌</button>
        `;

    fileItem.addEventListener("dragstart", (e) => this.handleFileDragStart(e));
    fileItem.addEventListener("dragover", (e) => this.handleFileDragOver(e));
    fileItem.addEventListener("drop", (e) => this.handleFileDrop(e));
    fileItem.addEventListener("dragend", (e) => this.handleFileDragEnd(e));

    return fileItem;
  }

  async generatePreview(file, index) {
    const fileItem = document.querySelector(`[data-index="${index}"]`);
    if (!fileItem || !pdfjsLib) return;

    const canvas = fileItem.querySelector(".pdf-thumbnail");
    const loading = fileItem.querySelector(".preview-loading");
    const ctx = canvas.getContext("2d");

    try {
      loading.style.display = "flex";
      canvas.style.display = "none";

      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const page = await pdf.getPage(1);

      const targetWidth = 160;
      const targetHeight = 190;
      const viewport = page.getViewport({ scale: 1 });

      const scaleX = (targetWidth * 2) / viewport.width;
      const scaleY = (targetHeight * 2) / viewport.height;
      const scale = Math.min(scaleX, scaleY);

      const scaledViewport = page.getViewport({ scale });
      canvas.width = scaledViewport.width;
      canvas.height = scaledViewport.height;
      canvas.style.width = `${targetWidth}px`;
      canvas.style.height = `${targetHeight}px`;

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";

      await page.render({ canvasContext: ctx, viewport: scaledViewport })
        .promise;

      loading.style.display = "none";
      canvas.style.display = "block";
    } catch (error) {
      console.warn(`Error generando preview para ${file.name}:`, error);
      loading.textContent = "⚠️";
      canvas.style.display = "none";
    }
  }

  removeFile(index) {
    const fileName = this.currentFiles[index].name;
    this.currentFiles.splice(index, 1);
    this.updateDisplay();
    this.updateFileInput();
    this.showMessage(`Archivo "${fileName}" eliminado`, "success");
  }

  clearFiles() {
    this.currentFiles = [];
    this.fileInput.value = "";
    this.updateDisplay();
    this.showMessage("Todos los archivos han sido eliminados", "success");
  }

  handleDragOver(e) {
    e.preventDefault();
    this.dropZone.classList.add("drag-over");
  }

  handleDragLeave(e) {
    e.preventDefault();
    this.dropZone.classList.remove("drag-over");
  }

  handleDrop(e) {
    e.preventDefault();
    this.dropZone.classList.remove("drag-over");

    const droppedFiles = Array.from(e.dataTransfer.files).filter(
      (file) => file.type === "application/pdf"
    );

    if (droppedFiles.length) {
      this.handleFileSelect({ target: { files: droppedFiles } });
    } else {
      this.showMessage("Solo se permiten archivos PDF", "error");
    }
  }

  handleFormSubmit(e) {
    if (this.currentFiles.length < 2) {
      e.preventDefault();
      this.showMessage("Selecciona al menos 2 archivos PDF para unir", "error");
      return;
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

  showMessage(message, type = "info") {
    // Crear contenedor de mensajes si no existe
    if (!this.messages) {
      this.messages = document.createElement("div");
      this.messages.id = "messages";
      this.messages.className = "messages";
      document.body.appendChild(this.messages);
    }

    const messageEl = document.createElement("div");
    messageEl.className = `message ${type}`;

    // Agregar icono según el tipo
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
}

let merger;
document.addEventListener("DOMContentLoaded", async () => {
  await loadPDFJS();
  merger = new PDFMerger();
});
