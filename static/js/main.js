document.addEventListener('DOMContentLoaded', function() {
    // --- Keep existing const declarations ---
    const svgObject = document.getElementById('svg-container');
    const infoContent = document.getElementById('info-content');
    const searchInput = document.getElementById('search-input');
    const searchResultsContainer = document.getElementById('search-results');
    const mapTitle = document.getElementById('map-title');
    const floorSelectorButtons = document.querySelectorAll('.floor-selector');
    let svgDoc = null;
    let originalStyles = new Map();

    // --- Use variables passed from index.html ---
    let currentFloor = initialDefaultFloor;
    let currentMapFile = initialMapFile;

    // --- MODIFIED: displayLabDetails ---
    function displayLabDetails(data) {
         if (!data || !data.path_id) { showError("Received incomplete data."); return; }

         // Start building HTML with the title
         let html = `<h3 class="lab-title">${data.name || `Room ${data.path_id}`}</h3>`;

         // Add Floor details
         if (data.floor) {
             html += `<div class="detail-item"><span class="detail-label">Floor:</span> ${data.floor}</div>`;
         }
         // Add Location details
         html += `<div class="detail-item"><span class="detail-label">Location:</span> ${data.location || 'collage of eduaction'}</div>`;
         // Add Description details
         html += `<div class="detail-item"><span class="detail-label">Description:</span> ${data.description || 'No description available.'}</div>`;
         // Add Capacity details

         // --- ADD IMAGES HERE ---
         if (data.image_urls && data.image_urls.length > 0) {
             html += `<div class="detail-item"><span class="detail-label">Images:</span>`; // Label for the image section
             html += `<div class="room-image-gallery">`; // Container for multiple thumbnails
             data.image_urls.forEach((imageUrl, index) => {
                 const altText = `Image ${index + 1} of ${data.name || `Room ${data.path_id}`}`;
                 html += `<div class="room-image-container"><img src="${imageUrl}" alt="${altText}" class="room-image clickable-room-image"></div>`;
             });
             html += `</div></div>`; // Close gallery and detail-item
         }
         // --- End Image ---

         // Set the final HTML
         infoContent.innerHTML = html;
    }
    // --- End MODIFIED displayLabDetails ---


    // --- Keep other helper functions (showError, showLoading, etc.) ---
    function showError(message) { infoContent.innerHTML = `<p class="error">${message}</p>`; }
    function showLoading() { infoContent.innerHTML = '<p class="loading">Loading details...</p>'; }
    function showPrompt() { infoContent.innerHTML = '<p class="prompt">Click on any lab in the map or search above to view details...</p>'; }
    function clearSearchResults() { searchResultsContainer.innerHTML = ''; searchResultsContainer.style.display = 'none'; }
    function getElementStyles(element) { if (!svgDoc || !svgDoc.defaultView) return {}; const computedStyle = svgDoc.defaultView.getComputedStyle(element, null); return { fill: element.style.fill || computedStyle.getPropertyValue('fill'), stroke: element.style.stroke || computedStyle.getPropertyValue('stroke'), strokeWidth: element.style.strokeWidth || computedStyle.getPropertyValue('stroke-width'), opacity: element.style.opacity || computedStyle.getPropertyValue('opacity') }; }
    function resetElementStyles(element) { const styles = originalStyles.get(element.id); if (styles) { element.style.fill = styles.fill; element.style.stroke = styles.stroke; element.style.strokeWidth = styles.strokeWidth; element.style.opacity = styles.opacity; } else { element.style.fill = ''; element.style.stroke = ''; element.style.strokeWidth = ''; element.style.opacity = ''; } }

    // --- NEW: Function to show image modal ---
    function showImageModal(imageUrl, altText) {
        // Remove existing modal if any
        const existingModal = document.querySelector('.modal-overlay');
        if (existingModal) {
            existingModal.remove();
        }

        // Create modal elements
        const modalOverlay = document.createElement('div');
        modalOverlay.className = 'modal-overlay';

        const modalContent = document.createElement('div');
        modalContent.className = 'modal-content';

        const modalClose = document.createElement('span');
        modalClose.className = 'modal-close';
        modalClose.innerHTML = '&times;'; // 'x' character

        const modalImage = document.createElement('img');
        modalImage.className = 'modal-image';
        modalImage.src = imageUrl;
        modalImage.alt = altText || 'Large room image';

        // Assemble modal
        modalContent.appendChild(modalClose);
        modalContent.appendChild(modalImage);
        modalOverlay.appendChild(modalContent);

        // Add to body
        document.body.appendChild(modalOverlay);

        // Show modal with transition
        requestAnimationFrame(() => modalOverlay.classList.add('visible')); // Trigger transition

        // Add close listeners
        modalClose.addEventListener('click', () => modalOverlay.remove());
        modalOverlay.addEventListener('click', (event) => {
            // Close only if clicking the overlay itself, not the content inside
            if (event.target === modalOverlay) {
                modalOverlay.remove();
            }
        });
    }

    // --- Keep setupSvgInteractions function (no changes needed here) ---
    function setupSvgInteractions() {
        svgDoc = null; originalStyles.clear();
        if (!svgObject || !svgObject.contentDocument) { console.error("SVG content document not accessible after load event."); showError("Could not load or access the interactive map elements."); return; }
        svgDoc = svgObject.contentDocument;
        if (!svgDoc.documentElement) { console.error("SVG root element not found after load."); showError("Error processing the loaded map."); return; }
        const clickableElements = svgDoc.querySelectorAll('path[id], rect[id], circle[id], polygon[id], g[id]');
        if (clickableElements.length === 0) { console.warn("No clickable elements with IDs found in the SVG map:", currentMapFile); return; }
        clickableElements.forEach(element => {
            if (element.id && !originalStyles.has(element.id)) { originalStyles.set(element.id, getElementStyles(element)); }
            element.style.cursor = 'pointer'; element.style.transition = 'fill 0.2s ease, stroke 0.2s ease, opacity 0.2s ease, stroke-width 0.2s ease';
            element.addEventListener('mouseenter', function() { if (!this.classList.contains('selected-element')) { if (this.id && !originalStyles.has(this.id)) { originalStyles.set(this.id, getElementStyles(this)); } this.style.opacity = '0.7'; } });
            element.addEventListener('mouseleave', function() { if (!this.classList.contains('selected-element')) { resetElementStyles(this); } });
            element.addEventListener('click', function(event) {
                event.stopPropagation(); const pathId = this.id; if (!pathId) return;
                const previousSelected = svgDoc.querySelector('.selected-element'); if(previousSelected) { previousSelected.classList.remove('selected-element'); resetElementStyles(previousSelected); }
                this.classList.add('selected-element'); if (!originalStyles.has(pathId)) { originalStyles.set(pathId, getElementStyles(this)); }
                this.style.fill = '#2ecc71'; this.style.stroke = '#27ae60'; this.style.strokeWidth = '1.5px'; this.style.opacity = '1';
                showLoading();
                fetch("/get-details", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path_id: pathId, floor: currentFloor }), })
                .then(response => { if (!response.ok) { return response.json().then(err => { throw new Error(err.error || `HTTP error! Status: ${response.status}`); }).catch(() => { throw new Error(`HTTP error! Status: ${response.status}`); }); } return response.json(); })
                .then(data => { if (data.error) { showError(data.error); this.classList.remove('selected-element'); resetElementStyles(this); } else { displayLabDetails(data); } })
                .catch(error => { console.error('Error fetching details:', error); showError(`Failed to load details for ${pathId}. ${error.message}`); this.classList.remove('selected-element'); resetElementStyles(this); });
            });
        });
        svgDoc.documentElement.addEventListener('click', function(event) { if (event.target === svgDoc.documentElement || !event.target.closest('[id]')) { const selected = svgDoc.querySelector('.selected-element'); if (selected) { selected.classList.remove('selected-element'); resetElementStyles(selected); showPrompt(); } } });
        console.log("SVG interactions set up for:", currentMapFile);
    }

    // --- Keep switchMap function (no changes needed here) ---
    function switchMap(floorKey, mapFile, floorName) {
        if (!mapFile) { console.error("No map file specified for floor:", floorKey); showError(`Map configuration missing for ${floorName}.`); return; }
        console.log(`Switching to floor: ${floorKey}, map: ${mapFile}`);
        currentFloor = floorKey; currentMapFile = mapFile;
        floorSelectorButtons.forEach(btn => { btn.classList.toggle('active', btn.dataset.floor === floorKey); });
        if (mapTitle) { mapTitle.textContent = `${floorName} Map`; }
        showPrompt(); searchInput.value = ''; clearSearchResults();
        if (svgObject) { const staticUrl = `/static/${mapFile}`; svgObject.setAttribute('data', staticUrl); }
        else { showError("Map container object not found."); }
    }

    // --- Keep Search Logic (no changes needed here) ---
    let searchTimeout;
    searchInput.addEventListener('input', function() {
        clearTimeout(searchTimeout); const query = this.value.trim(); if (query.length < 2) { clearSearchResults(); return; }
        searchTimeout = setTimeout(() => {
            fetch(`/search?q=${encodeURIComponent(query)}&floor=${encodeURIComponent(currentFloor)}`)
                .then(response => response.ok ? response.json() : Promise.reject(new Error(`Search failed: ${response.status}`)))
                .then(results => {
                    searchResultsContainer.innerHTML = '';
                    if (results && results.length > 0) {
                        results.forEach(result => {
                            const item = document.createElement('div'); item.classList.add('search-result-item');
                            const roomNo = result['room no.'] || 'N/A'; item.dataset.pathId = roomNo;
                            const description = result.description || 'No description'; const roomType = result['room type'] ? `(${result['room type']})` : '';
                            item.innerHTML = `<strong>Room ${roomNo}</strong> ${roomType} <span>${description.substring(0, 100)}${description.length > 100 ? '...' : ''}</span>`;
                            item.addEventListener('click', function() {
                                const pathId = this.dataset.pathId;
                                if (pathId && pathId !== 'N/A' && svgDoc) {
                                    const targetElement = svgDoc.getElementById(pathId);
                                    if (targetElement) { targetElement.dispatchEvent(new MouseEvent('click', { bubbles: true })); }
                                    else { console.warn(`Map element ID '${pathId}' not found on ${currentFloor} map. Fetching details directly.`); showLoading(); fetch("/get-details", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path_id: pathId, floor: currentFloor })}) .then(res => res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))) .then(data => data.error ? showError(data.error) : displayLabDetails(data)) .catch(err => { console.error("Fetch error (search click):", err); showError(`Failed to load details for ${pathId}.`); }); }
                                } else if (!svgDoc) { showError("Map is not loaded, cannot highlight selection."); }
                                clearSearchResults(); searchInput.value = '';
                            });
                            searchResultsContainer.appendChild(item);
                        });
                        searchResultsContainer.style.display = 'block';
                    } else { searchResultsContainer.innerHTML = '<p class="no-results">No matching rooms found on this floor.</p>'; searchResultsContainer.style.display = 'block'; }
                })
                .catch(error => { console.error('Search error:', error); searchResultsContainer.innerHTML = '<p class="error">Search failed. Please try again.</p>'; searchResultsContainer.style.display = 'block'; });
        }, 300);
    });
    document.addEventListener('click', function(event) { if (!searchResultsContainer.contains(event.target) && event.target !== searchInput) { clearSearchResults(); } });

    // --- NEW: Event listener for clickable images in the info panel (using delegation) ---
    infoContent.addEventListener('click', function(event) {
        // Check if the clicked element is an image with the specific class
        if (event.target.matches('.clickable-room-image')) {
            const imageUrl = event.target.src;
            const altText = event.target.alt;
            showImageModal(imageUrl, altText);
        }
    });
    // --- Keep Initialization logic ---
    floorSelectorButtons.forEach(button => { button.addEventListener('click', function() { switchMap(this.dataset.floor, this.dataset.mapfile, this.textContent.trim()); }); });
    const initialButton = document.querySelector('.floor-selector.active'); if (mapTitle && initialButton) { mapTitle.textContent = `${initialButton.textContent.trim()} Map`; }
    if (svgObject) {
         svgObject.addEventListener('load', setupSvgInteractions);
         svgObject.addEventListener('error', function() { console.error("Failed to load SVG file:", svgObject.data); showError(`Failed to load map: ${currentMapFile}`); });
         // Initial prompt message display
         showPrompt();
         // Setup interactions after a short delay or if already loaded
         setTimeout(() => { if (svgObject.contentDocument && svgObject.contentDocument.readyState === 'complete') { console.log("SVG already loaded, setting up interactions for:", currentMapFile); setupSvgInteractions(); } else if (!svgObject.contentDocument) { console.warn("Initial SVG contentDocument not ready, waiting for load event."); } }, 100);
    } else { console.error("SVG object element not found in HTML."); showError("Map display element is missing in the HTML structure."); }

}); // End DOMContentLoaded

