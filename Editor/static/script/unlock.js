// Variables globales
let pdfjsLib = null

// Cargar PDF.js
async function loadPDFJS() {
  try {
    if (typeof window.pdfjsLib === "undefined") {
      const script = document.createElement("script")
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"
      document.head.appendChild(script)

      await new Promise((resolve, reject) => {
        script.onload = resolve
        script.onerror = reject
      })
    }

    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js"
    pdfjsLib = window.pdfjsLib
    console.log("✅ PDF.js cargado correctamente")
  } catch (error) {
    console.warn("⚠️ No se pudo cargar PDF.js:", error)
  }
}

// Clase principal para manejar el desbloqueo de PDFs
class PDFUnlocker {
  constructor() {
    this.currentFile = null
    this.isProcessing = false

    this.initElements()
    this.bindEvents()
    this.csrfToken = this.getCSRFToken()
  }

  initElements() {
    // Elementos principales
    this.dropZone = document.getElementById("dropZone")
    this.fileInput = document.getElementById("pdf_file")
    this.selectBtn = document.getElementById("selectBtn")
    this.selectedFile = document.getElementById("selectedFile")
    this.removeBtn = document.getElementById("removeBtn")
    this.unlockForm = document.getElementById("unlockForm")
    this.messages = document.getElementById("messages")
    this.loadingOverlay = document.getElementById("loadingOverlay")
    this.loadingText = document.getElementById("loadingText")

    // Elementos de archivo
    this.fileName = document.getElementById("fileName")
    this.fileSize = document.getElementById("fileSize")
    this.fileStatus = document.getElementById("fileStatus")
    this.filePreview = document.getElementById("filePreview")
    this.pdfThumbnail = document.getElementById("pdfThumbnail")
    this.previewLoading = document.getElementById("previewLoading")

    // Elementos de contraseña
    this.passwordSection = document.getElementById("passwordSection")
    this.passwordInput = document.getElementById("password")
    this.togglePassword = document.getElementById("togglePassword")
    this.unlockBtn = document.getElementById("unlockBtn")
    this.unlockBtnText = document.getElementById("unlockBtnText")
    this.actionButtons = document.getElementById("actionButtons")
  }

  bindEvents() {
    // Drag & Drop
    this.dropZone.addEventListener("dragover", (e) => this.handleDragOver(e))
    this.dropZone.addEventListener("dragleave", (e) => this.handleDragLeave(e))
    this.dropZone.addEventListener("drop", (e) => this.handleDrop(e))

    // Click en drop zone y botón seleccionar
    this.dropZone.addEventListener("click", (e) => {
      if (!e.target.closest(".select-btn")) {
        this.fileInput.click()
      }
    })
    this.selectBtn.addEventListener("click", () => this.fileInput.click())

    // Selección de archivos
    this.fileInput.addEventListener("change", (e) => this.handleFileSelect(e))

    // Botones de control
    this.removeBtn.addEventListener("click", () => this.clearFile())

    // Toggle contraseña
    this.togglePassword.addEventListener("click", () => this.togglePasswordVisibility())

    // Validación de contraseña en tiempo real
    this.passwordInput.addEventListener("input", () => this.validateForm())
    this.passwordInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter" && !this.unlockBtn.disabled) {
        this.handleFormSubmit(e)
      }
    })

    // Envío de formulario
    this.unlockForm.addEventListener("submit", (e) => this.handleFormSubmit(e))
  }

  // Obtener token CSRF
  getCSRFToken() {
    const cookies = document.cookie.split(";")
    for (const cookie of cookies) {
      const [name, value] = cookie.trim().split("=")
      if (name === "csrftoken") {
        return decodeURIComponent(value)
      }
    }

    const csrfInput = document.querySelector('input[name="csrfmiddlewaretoken"]')
    return csrfInput ? csrfInput.value : null
  }

  // Manejo de drag over
  handleDragOver(e) {
    e.preventDefault()
    this.dropZone.classList.add("drag-over")
    e.dataTransfer.dropEffect = "copy"
  }

  // Manejo de drag leave
  handleDragLeave(e) {
    e.preventDefault()
    if (!this.dropZone.contains(e.relatedTarget)) {
      this.dropZone.classList.remove("drag-over")
    }
  }

  // Manejo de drop
  handleDrop(e) {
    e.preventDefault()
    this.dropZone.classList.remove("drag-over")

    const files = Array.from(e.dataTransfer.files)
    if (files.length === 0) {
      this.showMessage("No se detectaron archivos", "warning")
      return
    }

    if (files.length > 1) {
      this.showMessage("Por favor arrastra solo un archivo PDF", "warning")
      return
    }

    const file = files[0]
    if (file.type !== "application/pdf") {
      this.showMessage("Solo se permiten archivos PDF", "error")
      return
    }

    this.processFile(file)
  }

  // Manejo de selección de archivos
  async handleFileSelect(e) {
    const file = e.target.files[0]
    if (!file) return

    // Validación básica de tipo de archivo
    if (file.type !== "application/pdf") {
      this.showMessage("Por favor selecciona un archivo PDF válido", "error")
      this.fileInput.value = ""
      return
    }

    // Validación de tamaño de archivo (opcional)
    const maxSize = 50 * 1024 * 1024 // 50MB
    if (file.size > maxSize) {
      this.showMessage("El archivo es demasiado grande. Máximo 50MB permitido.", "error")
      this.fileInput.value = ""
      return
    }

    // Verificación básica de archivo corrupto
    try {
      // Intentar leer los primeros bytes para verificar que es un PDF válido
      const firstBytes = await this.readFileHeader(file)
      if (!this.isPDFHeader(firstBytes)) {
        throw new Error("El archivo no tiene un formato PDF válido")
      }

      // Si pasa las validaciones, procesar el archivo
      await this.processFile(file)
    } catch (error) {
      console.error("Error validando archivo:", error)
      this.showMessage("Error: " + error.message, "error")
      this.fileInput.value = ""
      this.clearFile()
    }
  }

  // NUEVO: Método para leer los primeros bytes del archivo
  async readFileHeader(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => resolve(new Uint8Array(e.target.result))
      reader.onerror = () => reject(new Error("No se pudo leer el archivo"))
      // Leer solo los primeros 8 bytes para verificar el header
      reader.readAsArrayBuffer(file.slice(0, 8))
    })
  }

  // NUEVO: Método para verificar si tiene header de PDF válido
  isPDFHeader(bytes) {
    // Un PDF válido debe comenzar con "%PDF-"
    const pdfSignature = [0x25, 0x50, 0x44, 0x46, 0x2d] // %PDF-

    if (bytes.length < 5) return false

    for (let i = 0; i < 5; i++) {
      if (bytes[i] !== pdfSignature[i]) {
        return false
      }
    }
    return true
  }

  // Procesar archivo seleccionado
  async processFile(file) {
    if (this.isProcessing) return

    this.isProcessing = true
    this.currentFile = file

    try {
      // Mostrar información básica del archivo
      this.displayFileInfo()

      // Generar vista previa (esto también verifica si el PDF es válido)
      await this.generatePreview()

      // Verificar estado del PDF
      await this.checkPDFStatus()
    } catch (error) {
      console.error("Error procesando archivo:", error)

      // Mensajes de error más específicos
      let errorMessage = "Error al procesar el archivo"

      if (error.message.includes("Invalid PDF") || error.message.includes("corrupted")) {
        errorMessage = "El archivo PDF está corrupto o dañado"
      } else if (error.message.includes("encrypted") || error.message.includes("password")) {
        errorMessage = "No se pudo acceder al PDF. Puede estar protegido."
      } else if (error.message.includes("network") || error.message.includes("fetch")) {
        errorMessage = "Error de conexión. Intenta nuevamente."
      } else if (error.message) {
        errorMessage = error.message
      }

      this.showMessage(errorMessage, "error")
      this.clearFile()
    } finally {
      this.isProcessing = false
    }
  }

  // Mostrar información del archivo
  displayFileInfo() {
    this.fileName.textContent = this.currentFile.name
    this.fileSize.textContent = this.formatFileSize(this.currentFile.size)

    // Mostrar archivo seleccionado
    this.selectedFile.style.display = "flex"
    this.dropZone.style.display = "none"

    // Mostrar estado inicial
    this.updateFileStatus("🔍", "Verificando estado...", "")
  }

  // Generar vista previa del PDF
  async generatePreview() {
    if (!pdfjsLib) {
      console.warn("PDF.js no está disponible")
      return
    }

    const canvas = this.pdfThumbnail
    const loading = this.previewLoading
    const ctx = canvas.getContext("2d")

    try {
      loading.style.display = "flex"
      canvas.style.display = "none"

      const arrayBuffer = await this.currentFile.arrayBuffer()

      // Verificar que el arrayBuffer no esté vacío
      if (arrayBuffer.byteLength === 0) {
        throw new Error("El archivo está vacío o corrupto")
      }

      const pdf = await pdfjsLib.getDocument({
        data: arrayBuffer,
        // Configuraciones para manejar PDFs problemáticos
        verbosity: 0, // Reducir logs de PDF.js
        isEvalSupported: false,
        disableFontFace: true,
      }).promise

      // Verificar que el PDF tiene páginas
      if (pdf.numPages === 0) {
        throw new Error("El PDF no contiene páginas válidas")
      }

      // Intentar obtener la primera página
      const page = await pdf.getPage(1)

      const targetWidth = 80
      const targetHeight = 100
      const viewport = page.getViewport({ scale: 1 })

      const scaleX = (targetWidth * 2) / viewport.width
      const scaleY = (targetHeight * 2) / viewport.height
      const scale = Math.min(scaleX, scaleY)

      const scaledViewport = page.getViewport({ scale })
      canvas.width = scaledViewport.width
      canvas.height = scaledViewport.height
      canvas.style.width = `${targetWidth}px`
      canvas.style.height = `${targetHeight}px`

      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = "high"

      await page.render({ canvasContext: ctx, viewport: scaledViewport }).promise

      loading.style.display = "none"
      canvas.style.display = "block"

      console.log("✅ Vista previa generada correctamente")
    } catch (error) {
      console.warn("Error generando preview:", error)

      // Determinar si es un error de archivo corrupto o protegido
      if (
        error.message.includes("Invalid PDF") ||
        error.message.includes("corrupted") ||
        error.message.includes("vacío")
      ) {
        throw new Error("El archivo PDF está corrupto o no es válido")
      }

      // Si es un error de contraseña, mostrar icono de candado
      loading.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
          <circle cx="12" cy="16" r="1"/>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
      `
      loading.style.display = "flex"
      canvas.style.display = "none"

      console.log("ℹ️ PDF probablemente protegido, continuando con verificación")
    }
  }

  // Verificar estado del PDF - CORREGIDO: Usar endpoint correcto
  async checkPDFStatus() {
    try {
      const formData = new FormData()
      formData.append("pdf_file", this.currentFile)

      const response = await fetch("/check-pdf-status/", {
        method: "POST",
        headers: {
          "X-CSRFToken": this.csrfToken,
        },
        body: formData,
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const result = await response.json()

      if (result.status === "success") {
        const data = result.data

        if (data.error) {
          this.updateFileStatus("⚠️", `Error: ${data.error}`, "error")
          this.showMessage(`Error al verificar PDF: ${data.error}`, "error")
          return
        }

        if (data.is_encrypted) {
          this.updateFileStatus("🔒", "PDF protegido con contraseña", "protected")
          this.showPasswordSection()
          this.showMessage("PDF protegido detectado. Ingresa la contraseña.", "info")
        } else {
          this.updateFileStatus("🔓", "PDF no está protegido", "unprotected")
          this.showMessage("Este PDF no está protegido con contraseña", "warning")
        }
      } else {
        throw new Error(result.message || "Error al verificar el estado del PDF")
      }
    } catch (error) {
      console.error("Error verificando estado:", error)
      this.updateFileStatus("❓", "No se pudo verificar el estado", "error")

      // Si no se puede verificar, asumir que está protegido y mostrar campo de contraseña
      this.showPasswordSection()
      this.showMessage("No se pudo verificar automáticamente. Intenta con la contraseña.", "warning")
    }
  }

  // Actualizar estado del archivo
  updateFileStatus(icon, text, type) {
    const statusIcon = this.fileStatus.querySelector(".status-icon")
    const statusText = this.fileStatus.querySelector(".status-text")

    statusIcon.textContent = icon
    statusText.textContent = text

    // Limpiar clases anteriores
    this.fileStatus.classList.remove("protected", "unprotected", "error")

    // Agregar nueva clase si se especifica
    if (type) {
      this.fileStatus.classList.add(type)
    }
  }

  // Mostrar sección de contraseña
  showPasswordSection() {
    this.passwordSection.style.display = "block"
    this.passwordInput.focus()
    this.validateForm()
  }

  // Ocultar sección de contraseña
  hidePasswordSection() {
    this.passwordSection.style.display = "none"
    this.passwordInput.value = ""
    this.unlockBtn.disabled = true
  }

  // Toggle visibilidad de contraseña
  togglePasswordVisibility() {
    const eyeIcon = this.togglePassword.querySelector(".eye-icon")
    const eyeOffIcon = this.togglePassword.querySelector(".eye-off-icon")

    if (this.passwordInput.type === "password") {
      this.passwordInput.type = "text"
      eyeIcon.style.display = "none"
      eyeOffIcon.style.display = "block"
    } else {
      this.passwordInput.type = "password"
      eyeIcon.style.display = "block"
      eyeOffIcon.style.display = "none"
    }
  }

  // Validar formulario
  validateForm() {
    const hasFile = this.currentFile !== null
    const hasPassword = this.passwordInput.value.trim().length > 0

    this.unlockBtn.disabled = !(hasFile && hasPassword)
  }

  // Manejo de envío del formulario
  async handleFormSubmit(e) {
    e.preventDefault()

    if (!this.currentFile) {
      this.showMessage("Selecciona un archivo PDF primero", "error")
      return
    }

    const password = this.passwordInput.value.trim()
    if (!password) {
      this.showMessage("Ingresa la contraseña del PDF", "error")
      return
    }

    await this.unlockPDF(password)
  }

  // Desbloquear PDF
  async unlockPDF(password) {
    this.showLoading(true, "Removiendo contraseña...")

    // Deshabilitar botón y mostrar estado de procesamiento
    this.unlockBtn.disabled = true
    this.unlockBtnText.textContent = "Procesando..."

    try {
      const formData = new FormData()
      formData.append("pdf_file", this.currentFile)
      formData.append("password", password)

      const response = await fetch(window.location.href, {
        method: "POST",
        headers: {
          "X-CSRFToken": this.csrfToken,
        },
        body: formData,
      })

      if (response.ok) {
        // Obtener nombre del archivo para descarga
        const contentDisposition = response.headers.get("Content-Disposition")
        let filename = `${this.currentFile.name.replace(".pdf", "")}_sin_contraseña.pdf`

        if (contentDisposition) {
          const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/)
          if (filenameMatch) {
            filename = filenameMatch[1].replace(/['"]/g, "")
          }
        }

        // Descargar archivo
        const blob = await response.blob()
        this.downloadBlob(blob, filename)

        this.showMessage("¡PDF desbloqueado exitosamente!", "success")

        // Limpiar formulario después de un momento
        setTimeout(() => {
          this.clearFile()
        }, 2000)
      } else {
        const errorData = await response.json().catch(() => ({}))
        const errorMessage = errorData.message || "Error al procesar el PDF"

        if (errorMessage.toLowerCase().includes("contraseña incorrecta")) {
          this.showMessage("Contraseña incorrecta. Intenta nuevamente.", "error")
          this.passwordInput.select()
        } else {
          this.showMessage(errorMessage, "error")
        }
      }
    } catch (error) {
      console.error("Error:", error)
      this.showMessage("Error de conexión. Intenta nuevamente.", "error")
    } finally {
      this.showLoading(false)
      this.unlockBtn.disabled = false
      this.unlockBtnText.textContent = "Desbloquear PDF"
      this.validateForm()
    }
  }

  // Descargar blob como archivo
  downloadBlob(blob, filename) {
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)
  }

  // Limpiar archivo
  clearFile() {
    this.currentFile = null
    this.fileInput.value = ""

    // Ocultar elementos
    this.selectedFile.style.display = "none"
    this.hidePasswordSection()

    // Mostrar drop zone
    this.dropZone.style.display = "block"

    // Limpiar vista previa
    this.pdfThumbnail.style.display = "none"
    this.previewLoading.style.display = "flex"
    this.previewLoading.innerHTML = `
      <svg class="loading-spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 12a9 9 0 11-6.219-8.56"/>
      </svg>
    `
  }

  // Mostrar/ocultar loading
  showLoading(show, text = "Procesando...") {
    this.loadingOverlay.style.display = show ? "flex" : "none"
    if (text) {
      this.loadingText.textContent = text
    }
  }

  // Formatear tamaño de archivo
  formatFileSize(bytes) {
    if (bytes === 0) return "0 Bytes"
    const k = 1024
    const sizes = ["Bytes", "KB", "MB", "GB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
  }

  // Mostrar mensaje
  showMessage(message, type = "info") {
    const messageEl = document.createElement("div")
    messageEl.className = `message ${type}`

    const icons = {
      success:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20,6 9,17 4,12"/></svg>',
      error:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
      warning:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
      info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
    }

    messageEl.innerHTML = `
      <div class="message-icon">${icons[type] || icons.info}</div>
      <span>${message}</span>
    `

    this.messages.appendChild(messageEl)

    setTimeout(() => {
      if (messageEl.parentNode) {
        messageEl.remove()
      }
    }, 5000)
  }
}

// Inicializar cuando el DOM esté listo
let unlocker
document.addEventListener("DOMContentLoaded", async () => {
  await loadPDFJS()
  unlocker = new PDFUnlocker()
})
