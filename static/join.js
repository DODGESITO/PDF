        const dropZone = document.getElementById('dropZone');
        const fileInput = document.getElementById('pdf_files');
        const fileList = document.getElementById('fileList');
        const filesContainer = document.getElementById('filesContainer');
        const submitBtn = document.getElementById('submitBtn');

        // Drag and drop functionality
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('drag-over');
        });

        dropZone.addEventListener('dragleave', (e) => {
            e.preventDefault();
            dropZone.classList.remove('drag-over');
        });

        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('drag-over');
            
            const files = Array.from(e.dataTransfer.files).filter(file => file.type === 'application/pdf');
            if (files.length > 0) {
                fileInput.files = createFileList(files);
                displayFiles(files);
            }
        });

        // File input change
        fileInput.addEventListener('change', (e) => {
            const files = Array.from(e.target.files);
            displayFiles(files);
        });

        function createFileList(files) {
            const dt = new DataTransfer();
            files.forEach(file => dt.items.add(file));
            return dt.files;
        }

        function displayFiles(files) {
            if (files.length === 0) {
                fileList.style.display = 'none';
                submitBtn.style.display = 'none';
                return;
            }

            fileList.style.display = 'block';
            submitBtn.style.display = 'block';
            submitBtn.disabled = false;
            
            filesContainer.innerHTML = '';
            files.forEach((file, index) => {
                const fileItem = document.createElement('div');
                fileItem.className = 'file-item';
                fileItem.innerHTML = `
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
                `;
                filesContainer.appendChild(fileItem);
            });
        }

        function formatFileSize(bytes) {
            if (bytes === 0) return '0 Bytes';
            const k = 1024;
            const sizes = ['Bytes', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        }

        function removeFile(index) {
            const files = Array.from(fileInput.files);
            files.splice(index, 1);
            fileInput.files = createFileList(files);
            displayFiles(files);
        }

        function clearFiles() {
            fileInput.value = '';
            fileList.style.display = 'none';
            submitBtn.style.display = 'none';
        }