// Variables globales
let pdfjsLib = null;

// Clase principal para manejar la división de PDFs
class PDFSplitter {
  constructor() {
    this.pdfFile = null;
    this.pdfDoc = null;
    this.totalPages = 0;
    this.selectedPages = new Set();
    this.currentGroup = 0;
    this.pagesPerGroup = 12; // FIJO: 12 páginas por grupo
    this.pageCanvases = new Map();
    this.showAllPages = false; // Flag para saber si estamos mostrando todas las páginas

    this.initElements();
    this.bindEvents();
    this.csrfToken = this.getCSRFToken();
    this.loadPDFJS();
  }

async loadPDFJS() {
  try {
    if (typeof window.pdfjsLib === "undefined") {
      const script = document.createElement("script")
      script.type = "module"
      script.src = "/static/pdfjs/build/pdf.js"
      document.head.appendChild(script)

      await new Promise((resolve, reject) => {
        script.onload = resolve
        script.onerror = reject
      })
    }

    window.pdfjsLib.GlobalWorkerOptions.workerSrc = "/static/pdfjs/build/pdf.worker.js"
    pdfjsLib = window.pdfjsLib
    console.log("PDF.js cargado localmente")
  } catch (error) {
    console.warn("No se pudo cargar PDF.js local:", error)
  }
}

  initElements() {
    // Elementos existentes
    this.fileInput = document.getElementById("pdfFile");
    this.selectBtn = document.getElementById("selectBtn");
    this.removeBtn = document.getElementById("removeBtn");
    this.selectedFile = document.getElementById("selectedFile");
    this.fileName = document.getElementById("fileName");
    this.fileSize = document.getElementById("fileSize");
    this.pageCount = document.getElementById("pageCount");
    this.splitForm = document.getElementById("pdfSplitForm");
    this.splitMethod = document.getElementById("split_method");
    this.pagesPerFileGroup = document.getElementById("pages_per_file_group");
    this.pageRangeGroup = document.getElementById("page_range_group");
    this.loading = document.getElementById("loading");
    this.loadingText = document.getElementById("loadingText");
    this.messages = document.getElementById("messages");
    this.uploadArea = document.getElementById("uploadArea");
    this.splitBtn = document.getElementById("splitBtn");
    this.splitBtnText = document.getElementById("splitBtnText");

    // Elementos para extract_pages
    this.extractPagesGroup = document.getElementById("extract_pages_group");
    this.pagesSpecification = document.getElementById("pages_specification");
    this.previewBtn = document.getElementById("previewBtn");
    this.clearSelectionBtn = document.getElementById("clearSelectionBtn");

    // Elementos de vista previa
    this.previewSection = document.getElementById("previewSection");
    this.pageGrid = document.getElementById("pageGrid");
    this.selectedPagesInfo = document.getElementById("selectedPagesInfo");
    this.selectAllGroupBtn = document.getElementById("selectAllGroupBtn");
    this.deselectAllBtn = document.getElementById("deselectAllBtn");

    // Elementos de navegación
    this.pageNavigation = document.getElementById("pageNavigation");
    this.prevGroupBtn = document.getElementById("prevGroupBtn");
    this.nextGroupBtn = document.getElementById("nextGroupBtn");
    this.groupInfo = document.getElementById("groupInfo");
    this.pageRangeInfo = document.getElementById("pageRangeInfo");

    // Elementos de extracción
    this.extractSelected = document.getElementById("extractSelected");
    this.extractSelectedBtn = document.getElementById("extractSelectedBtn");
    this.selectedCount = document.getElementById("selectedCount");

    // Elementos para sub-opciones de extract_pages
    this.extractMethod = document.getElementById("extract_method");
    this.specificationGroup = document.getElementById("specification_group");
    this.visualSelectionGroup = document.getElementById(
      "visual_selection_group"
    );
    this.loadAllPagesBtn = document.getElementById("loadAllPagesBtn");
    this.selectAllPagesBtn = document.getElementById("selectAllPagesBtn");
    this.clearAllPagesBtn = document.getElementById("clearAllPagesBtn");
  }

  bindEvents() {
    // Eventos existentes
    this.selectBtn.addEventListener("click", () => this.fileInput.click());
    this.removeBtn.addEventListener("click", () => this.clearFile());
    this.fileInput.addEventListener("change", (e) => this.handleFileSelect(e));
    this.splitMethod.addEventListener("change", () =>
      this.toggleMethodFields()
    );
    this.splitForm.addEventListener("submit", (e) => this.handleSubmit(e));

    // Eventos para extract_pages
    if (this.previewBtn) {
      this.previewBtn.addEventListener("click", () => this.generatePreview());
    }
    if (this.clearSelectionBtn) {
      this.clearSelectionBtn.addEventListener("click", () =>
        this.clearSelection()
      );
    }
    if (this.selectAllGroupBtn) {
      this.selectAllGroupBtn.addEventListener("click", () =>
        this.toggleGroupSelection()
      );
    }
    if (this.deselectAllBtn) {
      this.deselectAllBtn.addEventListener("click", () =>
        this.clearSelection()
      );
    }
    if (this.prevGroupBtn) {
      this.prevGroupBtn.addEventListener("click", () => this.navigateGroup(-1));
    }
    if (this.nextGroupBtn) {
      this.nextGroupBtn.addEventListener("click", () => this.navigateGroup(1));
    }
    if (this.extractSelectedBtn) {
      this.extractSelectedBtn.addEventListener("click", () =>
        this.extractSelectedPages()
      );
    }

    // Eventos para sub-opciones de extract_pages
    if (this.extractMethod) {
      this.extractMethod.addEventListener("change", () =>
        this.toggleExtractMethod()
      );
    }
    if (this.loadAllPagesBtn) {
      this.loadAllPagesBtn.addEventListener("click", () => this.loadAllPages());
    }
    if (this.selectAllPagesBtn) {
      this.selectAllPagesBtn.addEventListener("click", () =>
        this.selectAllPages()
      );
    }
    if (this.clearAllPagesBtn) {
      this.clearAllPagesBtn.addEventListener("click", () =>
        this.clearAllPages()
      );
    }
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

    this.showLoading(true, "Cargando PDF...");

    try {
      this.pdfFile = file;
      await this.loadPDF(file);
      this.displayFileInfo();
    } catch (error) {
      console.error("Error loading PDF:", error);
      this.showMessage("Error al cargar el PDF: Archivo corrupto", "error");
      this.clearFile();
    } finally {
      this.showLoading(false);
    }
  }

  async loadPDF(file) {
    try {
      if (!pdfjsLib) {
        await this.loadPDFJS();
      }

      if (!pdfjsLib) {
        throw new Error("PDF.js no está disponible");
      }

      const arrayBuffer = await file.arrayBuffer();
      this.pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      this.totalPages = this.pdfDoc.numPages;

      console.log(`PDF cargado: ${this.totalPages} páginas`);
    } catch (error) {
      console.error("Error cargando PDF:", error);
      throw error;
    }
  }

  displayFileInfo() {
    this.fileName.textContent = this.pdfFile.name;
    this.fileSize.textContent = this.formatFileSize(this.pdfFile.size);

    if (this.totalPages > 0) {
      this.pageCount.textContent = `${this.totalPages} páginas`;
      this.pageCount.style.display = "block";
    }

    this.selectedFile.style.display = "flex";
    this.splitForm.style.display = "block";
    this.uploadArea.style.display = "none";
  }

  toggleMethodFields() {
    const method = this.splitMethod.value;

    // Ocultar todos los grupos
    this.pagesPerFileGroup.style.display = "none";
    this.pageRangeGroup.style.display = "none";
    if (this.extractPagesGroup) {
      this.extractPagesGroup.style.display = "none";
    }

    // Mostrar el grupo correspondiente y actualizar texto del botón
    if (method === "pages_per_file") {
      this.pagesPerFileGroup.style.display = "block";
      this.splitBtnText.textContent = "Dividir PDF";
    } else if (method === "page_range") {
      this.pageRangeGroup.style.display = "block";
      this.splitBtnText.textContent = "Extraer Rango";
    } else if (method === "extract_pages") {
      if (this.extractPagesGroup) {
        this.extractPagesGroup.style.display = "block";
      }
      this.splitBtnText.textContent = "Extraer Páginas";
      this.toggleExtractMethod();
    }

    // Limpiar vista previa si cambia el método
    if (method !== "extract_pages") {
      this.clearSelection();
    }
  }

  async generatePreview() {
    const specification = this.pagesSpecification.value.trim();

    if (!specification) {
      this.showMessage(
        "Por favor ingresa una especificación de páginas",
        "warning"
      );
      return;
    }

    if (!this.pdfDoc) {
      this.showMessage("Cargando PDF...", "info");
      await this.loadPDF(this.pdfFile);
    }

    try {
      const pages = this.parsePageSpecification(specification, this.totalPages);

      if (pages.length === 0) {
        this.showMessage(
          "No se encontraron páginas válidas en la especificación",
          "warning"
        );
        return;
      }

      this.selectedPages = new Set(pages);
      this.currentGroup = 0;
      this.showAllPages = false; // Estamos mostrando páginas seleccionadas

      this.showLoading(true, "Generando vista previa...");
      await this.renderPagePreviews();
      this.showPreviewSection();
      this.updateNavigationInfo();
      this.updateSelectedInfo();

      this.showMessage(
        `Vista previa generada para ${pages.length} páginas`,
        "success"
      );
    } catch (error) {
      console.error("Error generating preview:", error);
      this.showMessage(
        "Error al generar vista previa: " + error.message,
        "error"
      );
    } finally {
      this.showLoading(false);
    }
  }

  parsePageSpecification(spec, totalPages) {
    const pageNumbers = [];
    const parts = spec
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part);

    for (const part of parts) {
      if (part.includes("-")) {
        const [start, end] = part
          .split("-")
          .map((s) => Number.parseInt(s.trim()));
        if (start && end && start <= end && start >= 1 && end <= totalPages) {
          for (let i = start; i <= end; i++) {
            if (!pageNumbers.includes(i)) {
              pageNumbers.push(i);
            }
          }
        } else {
          throw new Error(`Rango inválido: ${part}`);
        }
      } else {
        const pageNum = Number.parseInt(part);
        if (
          pageNum >= 1 &&
          pageNum <= totalPages &&
          !pageNumbers.includes(pageNum)
        ) {
          pageNumbers.push(pageNum);
        } else if (pageNum < 1 || pageNum > totalPages) {
          throw new Error(`Página ${pageNum} fuera de rango (1-${totalPages})`);
        }
      }
    }

    return pageNumbers.sort((a, b) => a - b);
  }

  async renderPagePreviews() {
    if (this.showAllPages) {
      // Si estamos mostrando todas las páginas, cargar solo el grupo actual
      await this.loadCurrentGroupPreviews();
    } else {
      // Si estamos mostrando páginas seleccionadas, cargar todas las seleccionadas
      const selectedPagesArray = Array.from(this.selectedPages).sort(
        (a, b) => a - b
      );
      this.pageCanvases.clear();

      for (const pageNum of selectedPagesArray) {
        try {
          const canvas = await this.generatePagePreview(pageNum);
          this.pageCanvases.set(pageNum, canvas);
        } catch (error) {
          console.error(`Error rendering page ${pageNum}:`, error);
        }
      }
    }

    this.renderCurrentGroup();
  }

  async loadCurrentGroupPreviews() {
    const startPage = this.currentGroup * this.pagesPerGroup + 1;
    const endPage = Math.min(
      startPage + this.pagesPerGroup - 1,
      this.totalPages
    );

    for (let pageNum = startPage; pageNum <= endPage; pageNum++) {
      if (!this.pageCanvases.has(pageNum)) {
        try {
          const canvas = await this.generatePagePreview(pageNum);
          if (canvas) {
            this.pageCanvases.set(pageNum, canvas);
          }
        } catch (error) {
          console.error(`Error rendering page ${pageNum}:`, error);
        }
      }
    }
  }

  async generatePagePreview(pageNum) {
    if (!this.pdfDoc || !pdfjsLib) return null;

    try {
      const page = await this.pdfDoc.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1 });
      const scale = Math.min(120 / viewport.width, 160 / viewport.height);
      const scaledViewport = page.getViewport({ scale });

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");

      canvas.width = scaledViewport.width;
      canvas.height = scaledViewport.height;

      await page.render({
        canvasContext: ctx,
        viewport: scaledViewport,
      }).promise;

      return canvas;
    } catch (error) {
      console.warn(`Error generando preview para página ${pageNum}:`, error);
      return null;
    }
  }

  renderCurrentGroup() {
    this.pageGrid.innerHTML = "";

    if (this.showAllPages) {
      // Mostrar todas las páginas del grupo actual
      const startPage = this.currentGroup * this.pagesPerGroup + 1;
      const endPage = Math.min(
        startPage + this.pagesPerGroup - 1,
        this.totalPages
      );

      for (let pageNum = startPage; pageNum <= endPage; pageNum++) {
        const pageItem = this.createPageItem(pageNum, true); // true = permite selección
        this.pageGrid.appendChild(pageItem);
      }
    } else {
      // Mostrar páginas seleccionadas del grupo actual
      const selectedPagesArray = Array.from(this.selectedPages).sort(
        (a, b) => a - b
      );
      const startIndex = this.currentGroup * this.pagesPerGroup;
      const endIndex = Math.min(
        startIndex + this.pagesPerGroup,
        selectedPagesArray.length
      );
      const currentGroupPages = selectedPagesArray.slice(startIndex, endIndex);

      currentGroupPages.forEach((pageNum) => {
        const pageItem = this.createPageItem(pageNum, false); // false = no permite selección
        this.pageGrid.appendChild(pageItem);
      });
    }
  }

  createPageItem(pageNum, allowSelection = false) {
    const pageItem = document.createElement("div");
    pageItem.className = this.selectedPages.has(pageNum)
      ? "page-item selected"
      : "page-item";
    pageItem.dataset.pageNumber = pageNum;

    const preview = document.createElement("div");
    preview.className = "page-preview";

    const canvas = this.pageCanvases.get(pageNum);
    if (canvas) {
      const clonedCanvas = document.createElement("canvas");
      const clonedCtx = clonedCanvas.getContext("2d");
      clonedCanvas.width = canvas.width;
      clonedCanvas.height = canvas.height;
      clonedCtx.drawImage(canvas, 0, 0);
      preview.appendChild(clonedCanvas);
    } else {
      const placeholder = document.createElement("div");
      placeholder.className = "page-placeholder";
      placeholder.textContent = `Página ${pageNum}`;
      preview.appendChild(placeholder);
    }

    const pageNumber = document.createElement("div");
    pageNumber.className = "page-number";
    pageNumber.textContent = `Página ${pageNum}`;

    const indicator = document.createElement("div");
    indicator.className = "page-selected-indicator";
    indicator.textContent = "✓";

    pageItem.appendChild(preview);
    pageItem.appendChild(pageNumber);
    pageItem.appendChild(indicator);

    if (allowSelection) {
      pageItem.addEventListener("click", () =>
        this.togglePageSelection(pageNum)
      );
    }

    return pageItem;
  }

  togglePageSelection(pageNum) {
    if (this.selectedPages.has(pageNum)) {
      this.selectedPages.delete(pageNum);
    } else {
      this.selectedPages.add(pageNum);
    }

    const sortedPages = Array.from(this.selectedPages).sort((a, b) => a - b);
    this.pagesSpecification.value = this.formatPageSpecification(sortedPages);

    this.renderCurrentGroup();
    this.updateSelectedInfo();
    this.updateExtractButton();
  }

  formatPageSpecification(pages) {
    if (pages.length === 0) return "";

    const ranges = [];
    let start = pages[0];
    let end = pages[0];

    for (let i = 1; i < pages.length; i++) {
      if (pages[i] === end + 1) {
        end = pages[i];
      } else {
        if (start === end) {
          ranges.push(start.toString());
        } else {
          ranges.push(`${start}-${end}`);
        }
        start = end = pages[i];
      }
    }

    if (start === end) {
      ranges.push(start.toString());
    } else {
      ranges.push(`${start}-${end}`);
    }

    return ranges.join(", ");
  }

  toggleGroupSelection() {
    if (this.showAllPages) {
      // Seleccionar/deseleccionar todas las páginas del grupo actual
      const startPage = this.currentGroup * this.pagesPerGroup + 1;
      const endPage = Math.min(
        startPage + this.pagesPerGroup - 1,
        this.totalPages
      );

      let allSelected = true;
      for (let pageNum = startPage; pageNum <= endPage; pageNum++) {
        if (!this.selectedPages.has(pageNum)) {
          allSelected = false;
          break;
        }
      }

      if (allSelected) {
        // Deseleccionar todas las páginas del grupo
        for (let pageNum = startPage; pageNum <= endPage; pageNum++) {
          this.selectedPages.delete(pageNum);
        }
      } else {
        // Seleccionar todas las páginas del grupo
        for (let pageNum = startPage; pageNum <= endPage; pageNum++) {
          this.selectedPages.add(pageNum);
        }
      }
    } else {
      // Comportamiento original para páginas seleccionadas
      const selectedPagesArray = Array.from(this.selectedPages).sort(
        (a, b) => a - b
      );
      const startIndex = this.currentGroup * this.pagesPerGroup;
      const endIndex = Math.min(
        startIndex + this.pagesPerGroup,
        selectedPagesArray.length
      );
      const currentGroupPages = selectedPagesArray.slice(startIndex, endIndex);

      const allSelected = currentGroupPages.every((pageNum) =>
        this.selectedPages.has(pageNum)
      );

      if (allSelected) {
        currentGroupPages.forEach((pageNum) =>
          this.selectedPages.delete(pageNum)
        );
      } else {
        currentGroupPages.forEach((pageNum) => this.selectedPages.add(pageNum));
      }
    }

    const sortedPages = Array.from(this.selectedPages).sort((a, b) => a - b);
    this.pagesSpecification.value = this.formatPageSpecification(sortedPages);

    this.renderCurrentGroup();
    this.updateSelectedInfo();
    this.updateExtractButton();
  }

  navigateGroup(direction) {
    let totalGroups;

    if (this.showAllPages) {
      totalGroups = Math.ceil(this.totalPages / this.pagesPerGroup);
    } else {
      const selectedPagesArray = Array.from(this.selectedPages).sort(
        (a, b) => a - b
      );
      totalGroups = Math.ceil(selectedPagesArray.length / this.pagesPerGroup);
    }

    const newGroup = Math.max(
      0,
      Math.min(totalGroups - 1, this.currentGroup + direction)
    );

    if (newGroup !== this.currentGroup) {
      this.currentGroup = newGroup;

      if (this.showAllPages) {
        // Cargar previsualizaciones del nuevo grupo
        this.showLoading(true, "Cargando páginas...");
        this.loadCurrentGroupPreviews().then(() => {
          this.renderCurrentGroup();
          this.updateNavigationInfo();
          this.showLoading(false);
        });
      } else {
        this.renderCurrentGroup();
        this.updateNavigationInfo();
      }
    }
  }

  updateNavigationInfo() {
    let totalGroups, startPage, endPage;

    if (this.showAllPages) {
      totalGroups = Math.ceil(this.totalPages / this.pagesPerGroup);
      startPage = this.currentGroup * this.pagesPerGroup + 1;
      endPage = Math.min(startPage + this.pagesPerGroup - 1, this.totalPages);
    } else {
      const selectedPagesArray = Array.from(this.selectedPages).sort(
        (a, b) => a - b
      );
      totalGroups = Math.ceil(selectedPagesArray.length / this.pagesPerGroup);

      const startIndex = this.currentGroup * this.pagesPerGroup;
      const endIndex = Math.min(
        startIndex + this.pagesPerGroup,
        selectedPagesArray.length
      );

      if (selectedPagesArray.length > 0) {
        startPage = selectedPagesArray[startIndex];
        endPage = selectedPagesArray[endIndex - 1];
      } else {
        startPage = endPage = 0;
      }
    }

    if (totalGroups > 1) {
      this.pageNavigation.style.display = "flex";
      this.groupInfo.textContent = `Grupo ${
        this.currentGroup + 1
      } de ${totalGroups}`;
      this.pageRangeInfo.textContent =
        startPage === endPage
          ? `Página ${startPage}`
          : `Páginas ${startPage}-${endPage}`;
      this.prevGroupBtn.disabled = this.currentGroup === 0;
      this.nextGroupBtn.disabled = this.currentGroup === totalGroups - 1;
    } else {
      this.pageNavigation.style.display = "none";
    }
  }

  updateSelectedInfo() {
    const count = this.selectedPages.size;
    this.selectedPagesInfo.textContent = `${count} página${
      count !== 1 ? "s" : ""
    } seleccionada${count !== 1 ? "s" : ""}`;
  }

  updateExtractButton() {
    const count = this.selectedPages.size;
    this.selectedCount.textContent = count;

    if (count > 0) {
      this.extractSelected.style.display = "block";
      this.extractSelectedBtn.disabled = false;
    } else {
      this.extractSelected.style.display = "none";
      this.extractSelectedBtn.disabled = true;
    }
  }

  showPreviewSection() {
    this.previewSection.style.display = "block";
    this.updateExtractButton();
  }

  clearSelection() {
    this.selectedPages.clear();
    if (this.pagesSpecification) {
      this.pagesSpecification.value = "";
    }
    if (this.previewSection) {
      this.previewSection.style.display = "none";
    }
    this.pageCanvases.clear();
    this.showAllPages = false;
  }

  async extractSelectedPages() {
    const selectedPagesArray = Array.from(this.selectedPages).sort(
      (a, b) => a - b
    );
    const specification = this.formatPageSpecification(selectedPagesArray);

    this.pagesSpecification.value = specification;
    this.handleSubmit(new Event("submit"));
  }

  async loadAllPages() {
    if (!this.pdfDoc) {
      this.showMessage("Cargando PDF...", "info");
      await this.loadPDF(this.pdfFile);
    }

    if (!this.pdfDoc) {
      this.showMessage("Error: No se pudo cargar el PDF", "error");
      return;
    }

    this.showLoading(true, "Cargando vista de páginas...");

    try {
      this.selectedPages.clear();
      this.currentGroup = 0;
      this.showAllPages = true; // Indicar que estamos mostrando todas las páginas

      // Cargar previsualizaciones del primer grupo
      await this.loadCurrentGroupPreviews();
      this.renderCurrentGroup();
      this.showVisualSelectionSection();
      this.updateNavigationInfo();
      this.updateAllPagesSelectedInfo();

      this.showMessage(
        `Vista de páginas cargada. Navegue entre grupos para ver todas las páginas.`,
        "success"
      );
    } catch (error) {
      console.error("Error loading all pages:", error);
      this.showMessage(
        "Error al cargar las páginas: " + error.message,
        "error"
      );
    } finally {
      this.showLoading(false);
    }
  }

  selectAllPages() {
    for (let pageNum = 1; pageNum <= this.totalPages; pageNum++) {
      this.selectedPages.add(pageNum);
    }

    const sortedPages = Array.from(this.selectedPages).sort((a, b) => a - b);
    if (this.pagesSpecification) {
      this.pagesSpecification.value = this.formatPageSpecification(sortedPages);
    }

    this.renderCurrentGroup();
    this.updateAllPagesSelectedInfo();
  }

  clearAllPages() {
    this.selectedPages.clear();

    if (this.pagesSpecification) {
      this.pagesSpecification.value = "";
    }

    this.renderCurrentGroup();
    this.updateAllPagesSelectedInfo();
  }

  updateAllPagesSelectedInfo() {
    const count = this.selectedPages.size;
    this.updateSelectedInfo();
    this.updateExtractButton();
  }

  showVisualSelectionSection() {
    this.previewSection.style.display = "block";
    if (this.selectAllPagesBtn) {
      this.selectAllPagesBtn.style.display = "inline-flex";
    }
    if (this.clearAllPagesBtn) {
      this.clearAllPagesBtn.style.display = "inline-flex";
    }
  }

  async handleSubmit(event) {
    event.preventDefault();

    if (!this.pdfFile) {
      this.showMessage("Selecciona un archivo PDF primero", "warning");
      return;
    }

    // Validaciones específicas por método
    const method = this.splitMethod.value;
    if (method === "extract_pages") {
      const specification = this.pagesSpecification.value.trim();
      if (!specification) {
        this.showMessage(
          "Por favor ingresa una especificación de páginas",
          "warning"
        );
        return;
      }
    }

    this.showLoading(true, "Procesando PDF...");

    const formData = new FormData();
    formData.append("pdf_file", this.pdfFile);
    formData.append("split_method", this.splitMethod.value);

    if (this.splitMethod.value === "pages_per_file") {
      formData.append(
        "pages_per_file",
        document.getElementById("pages_per_file").value
      );
    } else if (this.splitMethod.value === "page_range") {
      formData.append(
        "start_page",
        document.getElementById("start_page").value
      );
      formData.append("end_page", document.getElementById("end_page").value);
    } else if (this.splitMethod.value === "extract_pages") {
      formData.append("pages_specification", this.pagesSpecification.value);
    }

    try {
      const response = await fetch(window.location.href, {
        method: "POST",
        headers: {
          "X-CSRFToken": this.csrfToken,
        },
        body: formData,
      });

      if (response.ok) {
        const contentDisposition = response.headers.get("Content-Disposition");
        let filename = this.getDefaultFilename();

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

        const successMessage =
          this.splitMethod.value === "extract_pages"
            ? "Páginas extraídas exitosamente"
            : "PDF dividido exitosamente";
        this.showMessage(successMessage, "success");
      } else {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Error al procesar el PDF");
      }
    } catch (error) {
      console.error("Error:", error);
      this.showMessage(`Error: ${error.message}`, "error");
    } finally {
      this.showLoading(false);
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

  getDefaultFilename() {
    const baseName = this.pdfFile.name.replace(".pdf", "");
    const method = this.splitMethod.value;

    if (method === "pages_per_file") {
      return `${baseName}_dividido.zip`;
    } else if (method === "page_range") {
      const startPage = document.getElementById("start_page").value;
      const endPage = document.getElementById("end_page").value;
      return `${baseName}_paginas_${startPage}_a_${endPage}.pdf`;
    } else if (method === "extract_pages") {
      const pages = this.pagesSpecification.value
        .replace(/\s/g, "")
        .replace(/,/g, "_");
      return `${baseName}_paginas_${pages}.pdf`;
    }
    return `${baseName}_procesado.pdf`;
  }

  clearFile() {
    this.pdfFile = null;
    this.pdfDoc = null;
    this.totalPages = 0;
    this.selectedPages.clear();
    this.currentGroup = 0;
    this.pageCanvases.clear();
    this.showAllPages = false;

    this.fileInput.value = "";
    this.selectedFile.style.display = "none";
    this.splitForm.style.display = "none";
    this.uploadArea.style.display = "block";

    if (this.pagesSpecification) {
      this.pagesSpecification.value = "";
    }
    if (this.previewSection) {
      this.previewSection.style.display = "none";
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
    const messageEl = document.createElement("div");
    messageEl.className = `message ${type}`;
    messageEl.textContent = message;

    this.messages.appendChild(messageEl);

    setTimeout(() => {
      if (messageEl.parentNode) {
        messageEl.remove();
      }
    }, 3000);
  }

  showLoading(show, text = "Procesando...") {
    this.loading.style.display = show ? "flex" : "none";
    if (text && this.loadingText) {
      this.loadingText.textContent = text;
    }
  }

  toggleExtractMethod() {
    if (!this.extractMethod) return;

    const method = this.extractMethod.value;

    if (method === "specification") {
      if (this.specificationGroup)
        this.specificationGroup.style.display = "block";
      if (this.visualSelectionGroup)
        this.visualSelectionGroup.style.display = "none";
      if (this.previewSection) {
        this.previewSection.style.display = "none";
      }
    } else if (method === "visual_selection") {
      if (this.specificationGroup)
        this.specificationGroup.style.display = "none";
      if (this.visualSelectionGroup)
        this.visualSelectionGroup.style.display = "block";
      if (this.previewSection) {
        this.previewSection.style.display = "none";
      }
    }
  }
}

// Inicializar cuando el DOM esté listo
if (!window._pdfSplitterInitialized) {
  window._pdfSplitterInitialized = true;
  document.addEventListener("DOMContentLoaded", () => {
    new PDFSplitter()
  })
}
