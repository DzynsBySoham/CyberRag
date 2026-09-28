/**
 * CYBER-RAG — Document Intelligence Frontend Controller (iOS 27 Fluid Edition)
 * Preserves 100% of underlying API endpoints, response structures, and DOM hooks.
 * Adds mobile-safe touch handlers, deduplicated passages, and fluid status indicators.
 */

document.addEventListener("DOMContentLoaded", () => {
    // Status & Metrics Selectors
    const indexStatusDot = document.getElementById("indexStatusDot");
    const indexStatusText = document.getElementById("indexStatusText");
    const metricDocsCount = document.getElementById("metricDocsCount");
    const metricChunksCount = document.getElementById("metricChunksCount");

    // Pipeline Step Nodes
    const stepUpload = document.getElementById("stepUpload");
    const stepExtract = document.getElementById("stepExtract");
    const stepChunk = document.getElementById("stepChunk");
    const stepEmbed = document.getElementById("stepEmbed");
    const stepIndex = document.getElementById("stepIndex");

    // Ingestion Selectors
    const dropZone = document.getElementById("dropZone");
    const fileInput = document.getElementById("fileInput");
    const selectedFilesContainer = document.getElementById("selectedFilesContainer");
    const selectedFilesList = document.getElementById("selectedFilesList");
    const btnProcessIndex = document.getElementById("btnProcessIndex");
    const btnResetIndex = document.getElementById("btnResetIndex");
    const processingLogBox = document.getElementById("processingLogBox");
    const processingLogText = document.getElementById("processingLogText");
    const indexedDocsList = document.getElementById("indexedDocsList");
    const btnToggleActivity = document.getElementById("btnToggleActivity");
    const activityToggleIcon = document.getElementById("activityToggleIcon");

    // Query & Answer Selectors
    const questionForm = document.getElementById("questionForm");
    const questionInput = document.getElementById("questionInput");
    const btnAsk = document.getElementById("btnAsk");
    const qaLoadingIndicator = document.getElementById("qaLoadingIndicator");
    const qaLoadingMessage = document.getElementById("qaLoadingMessage");
    const alertBox = document.getElementById("alertBox");
    const answerSection = document.getElementById("answerSection");
    const answerText = document.getElementById("answerText");
    const sourcesList = document.getElementById("sourcesList");
    const btnToggleContext = document.getElementById("btnToggleContext");
    const passagesContent = document.getElementById("passagesContent");
    const accordionIcon = document.getElementById("accordionIcon");
    const contextToggleTitle = document.getElementById("contextToggleTitle");

    let queuedFiles = [];

    // -------------------------------------------------------------
    // 1. REFRESH STATUS & METRICS
    // -------------------------------------------------------------
    async function refreshSystemStatus() {
        try {
            const res = await fetch("/status");
            const data = await res.json();

            if (data.total_chunks_indexed > 0) {
                indexStatusDot.className = "status-orb active";
                indexStatusText.textContent = "Ready";
                btnAsk.disabled = false;
                renderIndexedDocs(data.indexed_documents);
                markPipelineStep(stepIndex, true);

                if (metricDocsCount) metricDocsCount.textContent = data.documents_count || 0;
                if (metricChunksCount) metricChunksCount.textContent = data.total_chunks_indexed || 0;
            } else {
                indexStatusDot.className = "status-orb";
                indexStatusText.textContent = "Standby";
                btnAsk.disabled = true;
                indexedDocsList.innerHTML = '<div class="shelf-empty-state">No documents indexed yet. Upload a PDF or TXT file to begin.</div>';
                markPipelineStep(stepIndex, false);

                if (metricDocsCount) metricDocsCount.textContent = "0";
                if (metricChunksCount) metricChunksCount.textContent = "0";
            }
        } catch (err) {
            indexStatusDot.className = "status-orb";
            indexStatusText.textContent = "Offline";
            console.error("Status check failed:", err);
        }
    }

    function renderIndexedDocs(docs) {
        if (!docs || docs.length === 0) {
            indexedDocsList.innerHTML = '<div class="shelf-empty-state">No documents indexed yet. Upload a PDF or TXT file to begin.</div>';
            return;
        }
        indexedDocsList.innerHTML = "";
        docs.forEach(doc => {
            const row = document.createElement("div");
            row.className = "shelf-item-row";
            const chunkInfo = doc.chunks === 1 ? "1 chunk" : `${doc.chunks} chunks`;
            row.innerHTML = `
                <span class="shelf-item-name">${escapeHtml(doc.filename)}</span>
                <span class="shelf-item-meta">Indexed · ${chunkInfo}</span>
            `;
            indexedDocsList.appendChild(row);
        });
    }

    function markPipelineStep(element, isComplete) {
        if (!element) return;
        if (isComplete) {
            element.classList.add("completed");
        } else {
            element.classList.remove("completed");
        }
    }

    function logActivity(message) {
        const time = new Date().toLocaleTimeString([], { hour12: false });
        processingLogText.textContent += `[ ${time} ] ${message}\n`;
        processingLogText.scrollTop = processingLogText.scrollHeight;
    }

    // Toggle Collapsible System Activity
    if (btnToggleActivity) {
        btnToggleActivity.addEventListener("click", () => {
            const isHidden = processingLogBox.style.display === "none";
            processingLogBox.style.display = isHidden ? "block" : "none";
            activityToggleIcon.innerHTML = isHidden ? "&minus;" : "+";
        });
    }

    // -------------------------------------------------------------
    // 2. DRAG & DROP AND FILE STAGING
    // -------------------------------------------------------------
    dropZone.addEventListener("click", () => fileInput.click());

    dropZone.addEventListener("dragover", (e) => {
        e.preventDefault();
        dropZone.classList.add("drag-active");
    });

    dropZone.addEventListener("dragleave", () => {
        dropZone.classList.remove("drag-active");
    });

    dropZone.addEventListener("drop", (e) => {
        e.preventDefault();
        dropZone.classList.remove("drag-active");
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleFileSelection(e.dataTransfer.files);
        }
    });

    fileInput.addEventListener("change", () => {
        if (fileInput.files && fileInput.files.length > 0) {
            handleFileSelection(fileInput.files);
        }
    });

    function handleFileSelection(filesList) {
        queuedFiles = Array.from(filesList);
        selectedFilesList.innerHTML = "";

        if (queuedFiles.length === 0) {
            selectedFilesContainer.style.display = "none";
            btnProcessIndex.disabled = true;
            return;
        }

        selectedFilesContainer.style.display = "block";
        btnProcessIndex.disabled = false;

        queuedFiles.forEach(file => {
            const li = document.createElement("li");
            const sizeKb = (file.size / 1024).toFixed(1);
            li.innerHTML = `<span>${escapeHtml(file.name)}</span><span>${sizeKb} KB</span>`;
            selectedFilesList.appendChild(li);
        });

        markPipelineStep(stepUpload, true);
    }

    // -------------------------------------------------------------
    // 3. INGESTION & INDEXING PIPELINE
    // -------------------------------------------------------------
    btnProcessIndex.addEventListener("click", async () => {
        if (queuedFiles.length === 0) return;

        btnProcessIndex.disabled = true;
        const btnSpan = btnProcessIndex.querySelector("span");
        btnSpan.textContent = "Indexing...";
        logActivity("Uploading document payload...");

        const formData = new FormData();
        queuedFiles.forEach(file => formData.append("files", file));

        try {
            // Step 1: Upload
            const uploadRes = await fetch("/upload", {
                method: "POST",
                body: formData
            });
            const uploadData = await uploadRes.json();

            if (!uploadRes.ok) {
                throw new Error(uploadData.error || "File upload failed.");
            }

            logActivity(`Payload secured: ${uploadData.saved_files.join(", ")}`);
            markPipelineStep(stepUpload, true);

            // Step 2: Extract, Chunk, Embed, Index
            logActivity("Extracting text and chunking...");
            markPipelineStep(stepExtract, true);
            markPipelineStep(stepChunk, true);

            logActivity("Generating MiniLM vector representations...");
            markPipelineStep(stepEmbed, true);

            const indexRes = await fetch("/index", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ filenames: uploadData.saved_files })
            });
            const indexData = await indexRes.json();

            if (!indexRes.ok) {
                throw new Error(indexData.error || "Indexing process failed.");
            }

            logActivity(`Indexed ${indexData.new_chunks_added} chunks into FAISS.`);
            markPipelineStep(stepIndex, true);

            btnSpan.textContent = "Indexed";
            setTimeout(() => {
                btnSpan.textContent = "Index Documents";
            }, 2500);

            queuedFiles = [];
            fileInput.value = "";
            selectedFilesContainer.style.display = "none";
            refreshSystemStatus();

        } catch (err) {
            logActivity(`Error: ${err.message}`);
            showHumanError("Indexing failed", err.message);
            btnSpan.textContent = "Index Documents";
        } finally {
            btnProcessIndex.disabled = queuedFiles.length === 0;
        }
    });

    // -------------------------------------------------------------
    // 4. RESET / PURGE STORE
    // -------------------------------------------------------------
    btnResetIndex.addEventListener("click", async () => {
        if (!confirm("Are you sure you want to clear the index and delete all uploaded documents?")) {
            return;
        }
        try {
            const res = await fetch("/reset", { method: "POST" });
            const data = await res.json();
            if (res.ok) {
                queuedFiles = [];
                fileInput.value = "";
                selectedFilesContainer.style.display = "none";
                processingLogText.textContent = "";
                answerSection.style.display = "none";
                alertBox.style.display = "none";
                [stepUpload, stepExtract, stepChunk, stepEmbed, stepIndex].forEach(s => markPipelineStep(s, false));
                refreshSystemStatus();
                logActivity("Vector memory cleared.");
            }
        } catch (err) {
            showHumanError("Reset failed", err.message);
        }
    });

    // -------------------------------------------------------------
    // 5. QUERY & GROUNDED ANSWER GENERATION
    // -------------------------------------------------------------
    questionInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            if (!btnAsk.disabled) {
                questionForm.dispatchEvent(new Event("submit", { cancelable: true }));
            }
        }
    });

    questionForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const query = questionInput.value.trim();
        if (!query) return;

        alertBox.style.display = "none";
        answerSection.style.display = "none";
        qaLoadingIndicator.style.display = "flex";
        qaLoadingMessage.textContent = "Retrieving relevant context...";
        btnAsk.disabled = true;

        try {
            setTimeout(() => {
                if (btnAsk.disabled) {
                    qaLoadingMessage.textContent = "Generating grounded answer...";
                }
            }, 800);

            const response = await fetch("/ask", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ question: query })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || "The language model request failed.");
            }

            // Render Grounded Answer Hero
            answerText.textContent = data.answer;

            // Render Sources
            sourcesList.innerHTML = "";
            if (data.sources && data.sources.length > 0) {
                data.sources.forEach(src => {
                    const li = document.createElement("li");
                    li.textContent = src.citation;
                    sourcesList.appendChild(li);
                });
            } else {
                const li = document.createElement("li");
                li.textContent = "No specific source passage cited.";
                sourcesList.appendChild(li);
            }

            // Render Deduplicated Retrieved Passages
            passagesContent.innerHTML = "";
            const rawChunks = data.retrieved_context || [];
            
            const uniqueChunks = [];
            const seenText = new Set();
            rawChunks.forEach(chunk => {
                const normalized = (chunk.text || "").trim();
                if (!seenText.has(normalized)) {
                    seenText.add(normalized);
                    uniqueChunks.push(chunk);
                }
            });

            if (contextToggleTitle) {
                const count = uniqueChunks.length;
                contextToggleTitle.textContent = count === 1 ? "1 retrieved passage" : `${count} retrieved passages`;
            }

            if (uniqueChunks.length > 0) {
                uniqueChunks.forEach((chunk, i) => {
                    const card = document.createElement("div");
                    card.className = "chunk-card";
                    const pageStr = chunk.page_number ? `Page ${chunk.page_number}` : "Full Document";
                    
                    card.innerHTML = `
                        <div class="chunk-head">
                            <span>0${i + 1} · ${escapeHtml(chunk.doc_name)} (${pageStr})</span>
                            <span class="chunk-meta">Cosine similarity ${chunk.similarity_score} &#8595;</span>
                        </div>
                        <div class="chunk-text" style="display:none;">${escapeHtml(chunk.text)}</div>
                    `;

                    // Individual Card Disclosure
                    const head = card.querySelector(".chunk-head");
                    const text = card.querySelector(".chunk-text");
                    head.addEventListener("click", () => {
                        const isClosed = text.style.display === "none";
                        text.style.display = isClosed ? "block" : "none";
                        head.querySelector(".chunk-meta").innerHTML = isClosed 
                            ? `Cosine similarity ${chunk.similarity_score} &#8593;` 
                            : `Cosine similarity ${chunk.similarity_score} &#8595;`;
                    });

                    passagesContent.appendChild(card);
                });
            } else {
                passagesContent.innerHTML = '<div class="shelf-empty-state">No passages retrieved.</div>';
            }

            answerSection.style.display = "block";

        } catch (err) {
            showHumanError("Unable to generate answer", err.message);
        } finally {
            qaLoadingIndicator.style.display = "none";
            btnAsk.disabled = false;
        }
    });

    // -------------------------------------------------------------
    // 6. EXPANDABLE CONTEXT DRAWER
    // -------------------------------------------------------------
    btnToggleContext.addEventListener("click", () => {
        const isHidden = passagesContent.style.display === "none";
        passagesContent.style.display = isHidden ? "block" : "none";
        accordionIcon.innerHTML = isHidden ? "&#8593;" : "&#8595;";
    });

    // -------------------------------------------------------------
    // 7. UTILITIES
    // -------------------------------------------------------------
    function showHumanError(summary, detail) {
        alertBox.innerHTML = `<strong>${escapeHtml(summary)}</strong><br>${escapeHtml(detail)}`;
        alertBox.style.display = "block";
    }

    function escapeHtml(string) {
        return String(string)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    refreshSystemStatus();
});