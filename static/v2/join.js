// Variables globales
let currentFiles = []

// Elementos del DOM
const dropZone = document.getElementById("dropZone")
const fileInput = document.getElementById("pdf_files")
const fileList = document.getElementById("fileList")
const filesContainer = document.getElementById("filesContainer")
const submitBtn = document.getElementById("submitBtn")

// Inicialización
document.addEventListener("DOMContentLoaded", () => {
  setupEventListeners()
})

function setupEventListeners() {
  // Drag and drop en la zona de arrastre
  dropZone.addEventListener("dragover", handleDragOver)
  dropZone.addEventListener("dragleave", handleDragLeave)
  dropZone.addEventListener("drop", handleDrop)

  // Click en drop zone para abrir diálogo
  dropZone.addEventListener("click", () => fileInput.click())

  // Cambio en el input de archivos
  fileInput.addEventListener("change", handleFileSelect)
}

// Manejo de drag and drop en zona de arrastre
function handleDragOver(e) {
  e.preventDefault()
  dropZone.classList.add("drag-over")
}

function handleDragLeave(e) {
  e.preventDefault()
  dropZone.classList.remove("drag-over")
}

function handleDrop(e) {
  e.preventDefault()
  dropZone.classList.remove("drag-over")

  const droppedFiles = Array.from(e.dataTransfer.files).filter((file) => file.type === "application/pdf")
  if (droppedFiles.length > 0) {
    addFiles(droppedFiles)
  }
}

// Manejo de selección de archivos
function handleFileSelect(e) {
  const selectedFiles = Array.from(e.target.files)
  if (selectedFiles.length > 0) {
    addFiles(selectedFiles)
  }
  // Limpiar input para permitir seleccionar más archivos
  e.target.value = ""
}

// Agregar archivos de forma progresiva
function addFiles(newFiles) {
  // Filtrar duplicados
  const uniqueFiles = newFiles.filter(
    (newFile) =>
      !currentFiles.some((existingFile) => existingFile.name === newFile.name && existingFile.size === newFile.size),
  )

  // Agregar archivos únicos
  currentFiles.push(...uniqueFiles)

  updateDisplay()
  updateFileInput()
}

// Actualizar input de archivos (IGUAL QUE EL ORIGINAL)
function updateFileInput() {
  const dt = new DataTransfer()
  currentFiles.forEach((file) => dt.items.add(file))
  fileInput.files = dt.files
}

// Actualizar visualización
function updateDisplay() {
  if (currentFiles.length === 0) {
    fileList.style.display = "none"
    submitBtn.style.display = "none"
    updateButtonText("Elegir archivos")
    return
  }

  fileList.style.display = "block"
  submitBtn.style.display = "block"
  submitBtn.disabled = false
  updateButtonText("Agregar más archivos")

  renderFileList()
}

// Renderizar lista de archivos
function renderFileList() {
  filesContainer.innerHTML = ""

  currentFiles.forEach((file, index) => {
    const fileItem = createFileItem(file, index)
    filesContainer.appendChild(fileItem)
  })
}

// Crear elemento de archivo con drag and drop
function createFileItem(file, index) {
  const fileItem = document.createElement("div")
  fileItem.className = "file-item"
  fileItem.draggable = true
  fileItem.dataset.index = index

  fileItem.innerHTML = `
        <div class="drag-handle">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="3" y1="6" x2="21" y2="6"/>
                <line x1="3" y1="12" x2="21" y2="12"/>
                <line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
        </div>
        <div class="file-order-number">${index + 1}</div>
        <div class="file-info">
            <svg class="file-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14,2 14,8 20,8"/>
            </svg>
            <div class="file-details">
                <span class="file-name">${file.name}</span>
                <span class="file-size">${formatFileSize(file.size)}</span>
            </div>
        </div>
        <button type="button" class="remove-file" onclick="removeFile(${index})">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
        </button>
    `

  // Eventos de drag and drop para reorganización
  fileItem.addEventListener("dragstart", handleFileDragStart)
  fileItem.addEventListener("dragover", handleFileDragOver)
  fileItem.addEventListener("drop", handleFileDrop)
  fileItem.addEventListener("dragend", handleFileDragEnd)

  return fileItem
}

// Manejo de drag and drop para reorganización
function handleFileDragStart(e) {
  e.dataTransfer.setData("text/plain", e.target.dataset.index)
  e.target.classList.add("dragging")
}

function handleFileDragOver(e) {
  e.preventDefault()
  const draggingElement = document.querySelector(".dragging")
  if (draggingElement && e.target.closest(".file-item") !== draggingElement) {
    e.target.closest(".file-item")?.classList.add("drag-over")
  }
}

function handleFileDrop(e) {
  e.preventDefault()
  const draggedIndex = Number.parseInt(e.dataTransfer.getData("text/plain"))
  const targetElement = e.target.closest(".file-item")

  if (targetElement) {
    const targetIndex = Number.parseInt(targetElement.dataset.index)

    if (draggedIndex !== targetIndex) {
      // Reorganizar archivos
      const [movedFile] = currentFiles.splice(draggedIndex, 1)
      currentFiles.splice(targetIndex, 0, movedFile)

      updateDisplay()
      updateFileInput() // Esto actualiza el orden en el input
    }
  }

  // Limpiar clases de arrastre
  document.querySelectorAll(".file-item").forEach((item) => {
    item.classList.remove("drag-over")
  })
}

function handleFileDragEnd(e) {
  e.target.classList.remove("dragging")
  document.querySelectorAll(".file-item").forEach((item) => {
    item.classList.remove("drag-over")
  })
}

// Actualizar texto del botón
function updateButtonText(text) {
  const selectBtn = document.querySelector(".btn-primary")
  const icon = selectBtn.querySelector(".btn-icon")
  selectBtn.innerHTML = ""
  selectBtn.appendChild(icon.cloneNode(true))
  selectBtn.appendChild(document.createTextNode(" " + text))
}

// Funciones globales
function removeFile(index) {
  currentFiles.splice(index, 1)
  updateDisplay()
  updateFileInput()
}

function clearFiles() {
  currentFiles = []
  fileInput.value = ""
  updateDisplay()
}

function formatFileSize(bytes) {
  if (bytes === 0) return "0 Bytes"
  const k = 1024
  const sizes = ["Bytes", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
}
