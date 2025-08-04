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
      "/static/pdfjs/build/pdf.worker.js"; // O .js
    pdfjsLib = window.pdfjsLib;
    console.log("PDF.js cargado localmente");
  } catch (error) {
    console.warn("No se pudo cargar PDF.js local:", error);
  }
}

class PDFCompressor {
  constructor() {
    this.pdfFile = null;
    this.initElements();
    this.bindEvents();
    this.csrfToken = this.getCSRFToken();
  }

  initElements() {
    this.fileInput = document.getElementById("pdf_file");
    this.selectBtn = document.getElementById("selectBtn");
    this.uploadArea = document.getElementById("uploadArea");
    this.compressOptions = document.getElementById("compressOptions");
    this.compressForm = document.querySelector(".compress-form");
    this.submitBtn = this.compressForm.querySelector('button[type="submit"]');
    this.loading = document.getElementById("loading");
    this.messages = document.getElementById("messages");
  }

  bindEvents() {
    this.selectBtn.addEventListener("click", () => this.fileInput.click());
    this.fileInput.addEventListener("change", (e) => this.handleFileSelect(e));
    this.compressForm.addEventListener("submit", (e) => this.handleSubmit(e));

    // Drag and drop functionality
    this.setupDragAndDrop();
  }

  setupDragAndDrop() {
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
        this.fileInput.files = this.createFileList([files[0]]); // Solo el primer PDF
        this.handleFileSelect({ target: { files: [files[0]] } });
      }
    });
  }

  createFileList(files) {
    const dt = new DataTransfer();
    files.forEach((file) => dt.items.add(file));
    return dt.files;
  }

  async handleFileSelect(event) {
    const file = event.target.files[0];

    if (!file) {
      this.clearFile();
      return;
    }

    if (file.type !== "application/pdf") {
      this.showMessage("Por favor selecciona un archivo PDF válido", "error");
      this.clearFile();
      return;
    }

    // Validar tamaño (50MB máximo)
    const maxSize = 50 * 1024 * 1024; // 50MB
    if (file.size > maxSize) {
      this.showMessage(
        "El archivo es demasiado grande. Máximo 50MB permitido",
        "error"
      );
      this.clearFile();
      return;
    }

    this.pdfFile = file;
    this.updateFileDisplay(file);

    try {
      this.showMessage(
        `PDF cargado exitosamente`,
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

  updateFileDisplay(file) {
    // Ocultar upload area y mostrar archivo seleccionado
    this.uploadArea.style.display = "none";

    // Crear display del archivo seleccionado
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
    <button type="button" class="remove-file" onclick="compressor.clearFile()">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="18" y1="6" x2="6" y2="18"/>
        <line x1="6" y1="6" x2="18" y2="18"/>
      </svg>
    </button>
  `;
    fileDisplay.style.display = "flex";

    // Mostrar opciones de compresión
    this.compressOptions.style.display = "block";
  }

  async handleSubmit(event) {
    event.preventDefault();

    if (!this.pdfFile) {
      this.showMessage("Selecciona un archivo PDF primero", "warning");
      return;
    }

    this.showLoading(true);

    // Deshabilitar el botón de submit si existe
    if (this.submitBtn) {
      this.submitBtn.disabled = true;
    }

    const formData = new FormData();
    formData.append("pdf_file", this.pdfFile);

    try {
      const response = await fetch(window.location.href, {
        method: "POST",
        headers: {
          "X-CSRFToken": this.csrfToken,
        },
        body: formData,
      });

      if (response.ok) {
        // Obtener información del archivo comprimido
        const contentDisposition = response.headers.get("Content-Disposition");
        let filename = this.getCompressedFilename();

        if (contentDisposition) {
          const filenameMatch = contentDisposition.match(
            /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/
          );
          if (filenameMatch) {
            filename = filenameMatch[1].replace(/['"]/g, "");
          }
        }

        const blob = await response.blob();

        // Mostrar información de compresión
        const originalSize = this.pdfFile.size;
        const compressedSize = blob.size;
        const reduction = (
          ((originalSize - compressedSize) / originalSize) *
          100
        ).toFixed(1);

        this.downloadBlob(blob, filename);
        this.showMessage(
          `PDF comprimido exitosamente. Reducción: ${reduction}% (${this.formatFileSize(
            originalSize
          )} → ${this.formatFileSize(compressedSize)})`,
          "success"
        );

        // Limpiar después de un momento
        setTimeout(() => this.clearFile(), 2000);
      } else {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Error al comprimir el PDF");
      }
    } catch (error) {
      console.error("Error:", error);
      this.showMessage(`Error: ${error.message}`, "error");
    } finally {
      this.showLoading(false);
      // Rehabilitar el botón de submit si existe
      if (this.submitBtn) {
        this.submitBtn.disabled = false;
      }
    }
  }

  downloadBlob(blob, filename) {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }

  getCompressedFilename() {
    const baseName = this.pdfFile.name.replace(".pdf", "");
    return `${baseName}_comprimido.pdf`;
  }

  clearFile() {
    this.pdfFile = null;
    this.fileInput.value = "";

    // Mostrar upload area
    this.uploadArea.style.display = "block";

    // Ocultar opciones
    this.compressOptions.style.display = "none";

    // Remover display del archivo
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
    // Buscar en cookies
    const cookies = document.cookie.split(";");
    for (const cookie of cookies) {
      const [name, value] = cookie.trim().split("=");
      if (name === "csrftoken") {
        return decodeURIComponent(value);
      }
    }

    // Buscar en input hidden
    const csrfInput = document.querySelector(
      'input[name="csrfmiddlewaretoken"]'
    );
    return csrfInput ? csrfInput.value : null;
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

    // Auto-remover después de 5 segundos
    setTimeout(() => {
      if (messageEl.parentNode) {
        messageEl.remove();
      }
    }, 3000);
  }

  showLoading(show) {
    if (!this.loading) {
      // Crear loading si no existe
      this.loading = document.createElement("div");
      this.loading.id = "loading";
      this.loading.className = "loading";
      this.loading.innerHTML = `
        <div class="spinner"></div>
        <p>Comprimiendo PDF...</p>
      `;
      document.body.appendChild(this.loading);
    }

    this.loading.style.display = show ? "flex" : "none";
  }
}

// Inicializar cuando el DOM esté listo
let compressor;
document.addEventListener("DOMContentLoaded", async () => {
  await loadPDFJS();
  compressor = new PDFCompressor();
});
