class ImageToPDFConverter {
  constructor() {
    this.imageFiles = []
    this.currentIndex = 0
    this.initElements()
    this.bindEvents()
    this.csrfToken = this.getCSRFToken()
  }

  initElements() {
    this.fileInput = document.getElementById("image_files")
    this.selectBtn = document.getElementById("selectBtn")
    this.uploadArea = document.getElementById("uploadArea")
    this.imagesContainer = document.getElementById("imagesContainer")
    this.imagesList = document.getElementById("imagesList")
    this.pdfConfig = document.getElementById("pdfConfig")
    this.convertOptions = document.getElementById("convertOptions")
    this.convertForm = document.querySelector(".convert-form")
    this.submitBtn = this.convertForm.querySelector('button[type="submit"]')
    this.loading = document.getElementById("loading")
    this.messages = document.getElementById("messages")

    // Config elements
    this.marginsSelect = document.getElementById("margins")
    this.customMargins = document.getElementById("customMargins")
    this.pageSizeSelect = document.getElementById("page_size")
    this.orientationSelect = document.getElementById("orientation")
    this.imageFitSelect = document.getElementById("image_fit")

    // Navigation elements
    this.navContainer = document.getElementById("navContainer")
    this.prevBtn = document.getElementById("prevBtn")
    this.nextBtn = document.getElementById("nextBtn")
    this.pageNumber = document.getElementById("pageNumber")

    this.reorderControls = document.getElementById("reorderControls")
    this.moveUpBtn = document.getElementById("moveUpBtn")
    this.moveDownBtn = document.getElementById("moveDownBtn")
    this.removeCurrentBtn = document.getElementById("removeCurrentBtn") // Added for remove current image button
  }

  bindEvents() {
    this.selectBtn.addEventListener("click", () => this.fileInput.click())
    this.fileInput.addEventListener("change", (e) => this.handleFileSelect(e))
    this.convertForm.addEventListener("submit", (e) => this.handleSubmit(e))

    this.marginsSelect.addEventListener("change", (e) => this.handleMarginsChange(e))

    this.pageSizeSelect.addEventListener("change", () => this.updateCanvasPreview())
    this.orientationSelect.addEventListener("change", () => this.updateCanvasPreview())
    this.imageFitSelect.addEventListener("change", () => this.updateCanvasPreview())

    this.setupDragAndDrop()

    if (this.prevBtn) this.prevBtn.addEventListener("click", () => this.navigateImages(-1))
    if (this.nextBtn) this.nextBtn.addEventListener("click", () => this.navigateImages(1))

    if (this.moveUpBtn) this.moveUpBtn.addEventListener("click", () => this.moveImage(-1))
    if (this.moveDownBtn) this.moveDownBtn.addEventListener("click", () => this.moveImage(1))

    if (this.removeCurrentBtn) {
      this.removeCurrentBtn.addEventListener("click", () => this.removeCurrentImage())
    }

    const marginInputs = ["margin_top", "margin_right", "margin_bottom", "margin_left"]
    marginInputs.forEach((id) => {
      const input = document.getElementById(id)
      if (input) {
        let timeout
        input.addEventListener("input", () => {
          clearTimeout(timeout)
          timeout = setTimeout(() => this.updateCanvasPreview(), 300)
        })
      }
    })
  }

  setupDragAndDrop() {
    this.uploadArea.addEventListener("dragover", (e) => {
      e.preventDefault()
      this.uploadArea.classList.add("drag-over")
    })

    this.uploadArea.addEventListener("dragleave", (e) => {
      e.preventDefault()
      this.uploadArea.classList.remove("drag-over")
    })

    this.uploadArea.addEventListener("drop", (e) => {
      e.preventDefault()
      this.uploadArea.classList.remove("drag-over")

      const files = Array.from(e.dataTransfer.files).filter((file) => file.type.startsWith("image/"))

      if (files.length > 0) {
        this.fileInput.files = this.createFileList(files)
        this.handleFileSelect({ target: { files } })
      }
    })
  }

  createFileList(files) {
    const dt = new DataTransfer()
    files.forEach((file) => dt.items.add(file))
    return dt.files
  }

  async handleFileSelect(event) {
    const files = Array.from(event.target.files)

    if (!files.length) {
      if (this.imageFiles.length === 0) {
        this.clearImages()
      }
      return
    }

    const validFiles = files.filter((file) => {
      if (!file.type.startsWith("image/")) {
        this.showMessage(`${file.name} no es una imagen válida`, "warning")
        return false
      }

      const maxSize = 10 * 1024 * 1024 // 10MB
      if (file.size > maxSize) {
        this.showMessage(`${file.name} es demasiado grande. Máximo 10MB por imagen`, "warning")
        return false
      }

      return true
    })

    if (!validFiles.length) {
      this.clearImages()
      return
    }

    this.imageFiles = [...this.imageFiles, ...validFiles]
    await this.updateImagesDisplay()
    this.showConfigOptions()

    this.showMessage(`${validFiles.length} imagen(es) agregada(s). Total: ${this.imageFiles.length}`, "success")
  }

  async updateImagesDisplay() {
    this.uploadArea.style.display = "none"
    this.imagesContainer.style.display = "block"
    this.imagesList.innerHTML = ""

    if (this.imageFiles.length > 0) {
      const file = this.imageFiles[this.currentIndex]
      const imageItem = await this.createImageItem(file, this.currentIndex)
      this.imagesList.appendChild(imageItem)
    }

    this.addMoreImagesButton()
    this.updateNavigationUI()
    this.updateCanvasPreview()
  }

  addMoreImagesButton() {
    const addMoreBtn = document.createElement("div")
    addMoreBtn.className = "add-more-images"
    addMoreBtn.innerHTML = `
      <button type="button" class="add-more-btn" onclick="converter.fileInput.click()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="12" y1="5" x2="12" y2="19"/>
          <line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        Agregar más imágenes
      </button>
    `
    this.imagesList.appendChild(addMoreBtn)
  }

  async createImageItem(file, index) {
    const imageItem = document.createElement("div")
    imageItem.className = "image-item"
    imageItem.dataset.index = index

    const canvas = await this.createImageCanvas(file)

    imageItem.innerHTML = `
      <div class="image-preview-container">
        <div class="canvas-container"></div>
      </div>
    `

    const canvasContainer = imageItem.querySelector(".canvas-container")
    canvasContainer.appendChild(canvas)

    imageItem.dataset.fileName = file.name

    return imageItem
  }

  async createImageCanvas(file) {
    return new Promise((resolve) => {
      const canvas = document.createElement("canvas")
      const ctx = canvas.getContext("2d")
      const img = new Image()

      img.onload = () => {
        const config = this.getCurrentConfig()
        const canvasSize = this.getCanvasSize(config.pageSize, config.orientation)
        const margins = this.getMargins(config.margins)

        canvas.width = canvasSize.width
        canvas.height = canvasSize.height

        ctx.fillStyle = "white"
        ctx.fillRect(0, 0, canvas.width, canvas.height)

        this.drawMargins(ctx, canvas.width, canvas.height, margins)

        this.drawImageOnCanvas(ctx, img, canvas.width, canvas.height, config.imageFit, margins)

        resolve(canvas)
      }

      img.onerror = () => {
        const canvas = document.createElement("canvas")
        canvas.width = 327
        canvas.height = 380
        const ctx = canvas.getContext("2d")
        ctx.fillStyle = "white"
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        resolve(canvas)
      }

      img.src = URL.createObjectURL(file)
    })
  }

  getCurrentConfig() {
    return {
      pageSize: this.pageSizeSelect?.value || "A4",
      orientation: this.orientationSelect?.value || "portrait",
      margins: this.marginsSelect?.value || "medium",
      imageFit: this.imageFitSelect?.value || "fit",
    }
  }

  getCanvasSize(pageSize, orientation) {
    const sizes = {
      A4: { width: 327, height: 380 },
      Letter: { width: 327, height: 423 },
      Legal: { width: 327, height: 539 },
      fit: { width: 327, height: 380 },
    }

    const size = sizes[pageSize] || sizes["A4"]

    if (orientation === "landscape") {
      return { width: size.height, height: size.width }
    }

    return size
  }

  getMargins(marginType) {
    const marginValues = {
      none: { top: 0, right: 0, bottom: 0, left: 0 },
      small: { top: 15, right: 15, bottom: 15, left: 15 },
      medium: { top: 30, right: 30, bottom: 30, left: 30 },
      large: { top: 45, right: 45, bottom: 45, left: 45 },
      custom: {
        top: Number.parseInt(document.getElementById("margin_top")?.value || "20") * 1.5,
        right: Number.parseInt(document.getElementById("margin_right")?.value || "20") * 1.5,
        bottom: Number.parseInt(document.getElementById("margin_bottom")?.value || "20") * 1.5,
        left: Number.parseInt(document.getElementById("margin_left")?.value || "20") * 1.5,
      },
    }

    return marginValues[marginType] || marginValues.medium
  }

  drawMargins(ctx, canvasWidth, canvasHeight, margins) {
    if (margins.top === 0 && margins.right === 0 && margins.bottom === 0 && margins.left === 0) {
      return
    }

    ctx.save()
    ctx.strokeStyle = "rgba(200, 200, 200, 0.5)"
    ctx.lineWidth = 1
    ctx.setLineDash([3, 3])

    // Draw margin lines
    if (margins.top > 0) {
      ctx.beginPath()
      ctx.moveTo(0, margins.top)
      ctx.lineTo(canvasWidth, margins.top)
      ctx.stroke()
    }

    if (margins.bottom > 0) {
      ctx.beginPath()
      ctx.moveTo(0, canvasHeight - margins.bottom)
      ctx.lineTo(canvasWidth, canvasHeight - margins.bottom)
      ctx.stroke()
    }

    if (margins.left > 0) {
      ctx.beginPath()
      ctx.moveTo(margins.left, 0)
      ctx.lineTo(margins.left, canvasHeight)
      ctx.stroke()
    }

    if (margins.right > 0) {
      ctx.beginPath()
      ctx.moveTo(canvasWidth - margins.right, 0)
      ctx.lineTo(canvasWidth - margins.right, canvasHeight)
      ctx.stroke()
    }

    ctx.restore()
  }

  drawImageOnCanvas(ctx, img, canvasWidth, canvasHeight, imageFit, margins) {
    const imgWidth = img.width
    const imgHeight = img.height

    // Calculate available space within margins
    const availableWidth = canvasWidth - margins.left - margins.right
    const availableHeight = canvasHeight - margins.top - margins.bottom

    let drawX = margins.left
    let drawY = margins.top
    let drawWidth = availableWidth
    let drawHeight = availableHeight

    switch (imageFit) {
      case "fill":
        const fillScale = Math.max(availableWidth / imgWidth, availableHeight / imgHeight)
        drawWidth = imgWidth * fillScale
        drawHeight = imgHeight * fillScale
        drawX = margins.left + (availableWidth - drawWidth) / 2
        drawY = margins.top + (availableHeight - drawHeight) / 2
        break

      case "fit":
        const fitScale = Math.min(availableWidth / imgWidth, availableHeight / imgHeight)
        drawWidth = imgWidth * fitScale
        drawHeight = imgHeight * fitScale
        drawX = margins.left + (availableWidth - drawWidth) / 2
        drawY = margins.top + (availableHeight - drawHeight) / 2
        break

      case "center":
        drawWidth = Math.min(imgWidth, availableWidth)
        drawHeight = Math.min(imgHeight, availableHeight)
        drawX = margins.left + (availableWidth - drawWidth) / 2
        drawY = margins.top + (availableHeight - drawHeight) / 2
        break
    }

    ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight)
  }

  async updateCanvasPreview() {
    if (!this.imageFiles.length) return

    const imageItem = this.imagesList.querySelector(".image-item")
    if (!imageItem) return

    const canvasContainer = imageItem.querySelector(".canvas-container")

    const existingCanvases = canvasContainer.querySelectorAll("canvas")
    existingCanvases.forEach((canvas) => canvas.remove())

    const file = this.imageFiles[this.currentIndex]
    const canvas = await this.createImageCanvas(file)

    const config = this.getCurrentConfig()
    const canvasSize = this.getCanvasSize(config.pageSize, config.orientation)

    canvasContainer.style.width = Math.min(canvasSize.width, 400) + "px"
    canvasContainer.style.height = Math.min(canvasSize.height, 500) + "px"
    canvasContainer.style.maxWidth = "100%"
    canvasContainer.style.maxHeight = "500px"

    canvasContainer.appendChild(canvas)
  }

  moveImage(direction) {
    if (this.imageFiles.length <= 1) return

    const newIndex = this.currentIndex + direction

    if (newIndex < 0 || newIndex >= this.imageFiles.length) return

    // Swap images in array
    const temp = this.imageFiles[this.currentIndex]
    this.imageFiles[this.currentIndex] = this.imageFiles[newIndex]
    this.imageFiles[newIndex] = temp

    // Update current index
    this.currentIndex = newIndex

    // Update display
    this.updateImagesDisplay()
    this.showMessage(`Imagen movida. Nueva posición: ${this.currentIndex + 1}`, "info")
  }

  async handleSubmit(event) {
    event.preventDefault()

    if (this.imageFiles.length === 0) {
      this.showMessage("Por favor, selecciona al menos una imagen.", "error")
      return
    }

    this.showLoading(true)
    this.submitBtn.disabled = true

    try {
      const formData = new FormData()

      const config = this.getCurrentConfig()
      formData.append("page_size", config.pageSize)
      formData.append("orientation", config.orientation)
      formData.append("margins", config.margins)
      formData.append("image_fit", config.imageFit)

      if (config.margins === "custom") {
        formData.append("margin_top", document.getElementById("margin_top")?.value || "10")
        formData.append("margin_bottom", document.getElementById("margin_bottom")?.value || "10")
        formData.append("margin_left", document.getElementById("margin_left")?.value || "10")
        formData.append("margin_right", document.getElementById("margin_right")?.value || "10")
      }

      this.imageFiles.forEach((file) => {
        formData.append("image_files", file)
      })

      const response = await fetch("/imagen/", {
        method: "POST",
        body: formData,
        headers: {
          "X-CSRFToken": this.getCSRFToken(),
        },
      })

      if (response.ok) {
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.style.display = "none"
        a.href = url
        a.download = "imagenes_convertidas.pdf"
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)

        this.showMessage("PDF generado y descargado exitosamente", "success")
      } else {
        const errorData = await response.json()
        this.showMessage(errorData.message, "error")
      }
    } catch (error) {
      console.error("Error:", error)
      this.showMessage(`Error: ${error.message}`, "error")
    } finally {
      this.showLoading(false)
      this.submitBtn.disabled = false
    }
  }

  clearImages() {
    this.imageFiles = []
    this.currentIndex = 0
    this.fileInput.value = ""

    this.uploadArea.style.display = "block"
    this.imagesContainer.style.display = "none"
    this.pdfConfig.style.display = "none"
    this.convertOptions.style.display = "none"

    this.imagesList.innerHTML = ""
  }

  formatFileSize(bytes) {
    if (bytes === 0) return "0 Bytes"
    const k = 1024
    const sizes = ["Bytes", "KB", "MB", "GB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
  }

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

  showMessage(message, type = "info") {
    if (!this.messages) {
      this.messages = document.createElement("div")
      this.messages.id = "messages"
      this.messages.className = "messages"
      document.body.appendChild(this.messages)
    }

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
    }, 3000)
  }

  showLoading(show) {
    if (!this.loading) {
      this.loading = document.createElement("div")
      this.loading.id = "loading"
      this.loading.className = "loading"
      this.loading.innerHTML = `
        <div class="spinner"></div>
        <p>Convirtiendo imágenes a PDF...</p>
      `
      document.body.appendChild(this.loading)
    }

    this.loading.style.display = show ? "flex" : "none"
  }

  showConfigOptions() {
    this.pdfConfig.style.display = "block"
    this.convertOptions.style.display = "block"
  }

  removeImageByName(fileName) {
    const index = this.imageFiles.findIndex((file) => file.name === fileName)

    if (index !== -1) {
      this.imageFiles.splice(index, 1)

      if (this.imageFiles.length === 0) {
        this.clearImages()
      } else {
        if (this.currentIndex >= this.imageFiles.length) {
          this.currentIndex = this.imageFiles.length - 1
        }
        this.updateImagesDisplay()
      }

      this.showMessage(`Imagen eliminada. Total: ${this.imageFiles.length}`, "info")
    }
  }

  handleMarginsChange(event) {
    const value = event.target.value
    if (value === "custom") {
      this.customMargins.style.display = "block"
    } else {
      this.customMargins.style.display = "none"
    }
    this.updateCanvasPreview()
  }



  updateNavigationUI() {
    if (this.imageFiles.length > 1) {
      this.navContainer.style.display = "flex"
      this.pageNumber.textContent = `${this.currentIndex + 1} / ${this.imageFiles.length}`
      this.prevBtn.disabled = this.currentIndex === 0
      this.nextBtn.disabled = this.currentIndex === this.imageFiles.length - 1

      this.moveUpBtn.disabled = this.currentIndex === 0
      this.moveDownBtn.disabled = this.currentIndex === this.imageFiles.length - 1

      if (this.removeCurrentBtn) {
        this.removeCurrentBtn.style.display = "flex"
      }
    } else if (this.imageFiles.length === 1) {
      this.navContainer.style.display = "flex"
      this.pageNumber.textContent = "1 / 1"
      this.prevBtn.disabled = true
      this.nextBtn.disabled = true
      this.moveUpBtn.disabled = true
      this.moveDownBtn.disabled = true

      if (this.removeCurrentBtn) {
        this.removeCurrentBtn.style.display = "flex"
      }
    } else {
      this.navContainer.style.display = "none"
      if (this.removeCurrentBtn) {
        this.removeCurrentBtn.style.display = "none"
      }
    }
  }

  navigateImages(direction) {
    const newIndex = this.currentIndex + direction
    if (newIndex >= 0 && newIndex < this.imageFiles.length) {
      this.currentIndex = newIndex
      this.updateImagesDisplay()
    }
  }

  removeCurrentImage() {
    if (this.imageFiles.length === 0) return

    const currentFile = this.imageFiles[this.currentIndex]
    this.removeImageByName(currentFile.name)
  }
}

let converter
document.addEventListener("DOMContentLoaded", () => {
  converter = new ImageToPDFConverter()
})
