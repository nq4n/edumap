// Note: displayLabDetails is defined twice in the original HTML, using the second definition.
// Make sure this is the correct one you want.
document.addEventListener('DOMContentLoaded', function() {
    // --- Existing const declarations ---
    const svgObject = document.getElementById('svg-container');
    const infoContent = document.getElementById('info-content');
    const searchInput = document.getElementById('search-input');
    // ... (other consts) ...
    let svgDoc = null;
    let originalStyles = new Map();
    let currentFloor = initialDefaultFloor;
    let currentMapFile = initialMapFile;
    let currentPathElement = null; // Keep track of the drawn path

    // --- NEW: Define the entrance node ID ---
    // *** IMPORTANT: Replace "Entrance1" with the actual ID of your entrance node in your graph/SVG ***
    const ENTRANCE_NODE_ID = "Entrance1";

    // --- displayLabDetails function (remains the same as previous step) ---
    function displayLabDetails(data) { /* ... */ }

    // --- Other helper functions (showError, showLoading, etc.) ---
    function showError(message) { /* ... */ }
    function showLoading() { /* ... */ }
    function showPrompt() { /* ... */ }
    function clearSearchResults() { /* ... */ }
    function getElementStyles(element) { /* ... */ }
    function resetElementStyles(element) { /* ... */ }

    // --- MODIFIED: clearPath function ---
    function clearPath() {
        if (currentPathElement && currentPathElement.parentNode) {
            currentPathElement.parentNode.removeChild(currentPathElement);
        }
        currentPathElement = null;
        // Don't clear pathErrorDiv here, only when starting a new path request
    }

    // --- NEW: animatePath function ---
    function animatePath(pathCoordinates) {
        clearPath(); // Clear previous path first
        if (!svgDoc || !svgDoc.documentElement) {
            console.error("Cannot draw path, SVG document not ready.");
            showError("Error: Map not ready for drawing path."); // Show error in info panel
            return;
        }
        if (!pathCoordinates || pathCoordinates.length < 2) {
            console.warn("Received invalid path data for drawing.");
            // Optionally show a message: showError("No valid path found.");
            return;
        }

        const polyline = svgDoc.createElementNS('http://www.w3.org/2000/svg', 'polyline');
        const pointsString = pathCoordinates.map(coord => `${coord[0]},${coord[1]}`).join(' ');

        polyline.setAttribute('points', pointsString);
        polyline.setAttribute('class', 'route-path'); // Base class

        // Append the path to the main SVG element FIRST
        svgDoc.documentElement.appendChild(polyline);
        currentPathElement = polyline; // Store reference

        // Calculate length
        const length = polyline.getTotalLength();
        console.log("Path length:", length);

        // Set initial dash array and offset based on length
        polyline.style.strokeDasharray = length;
        polyline.style.strokeDashoffset = length;

        // Force a reflow (read a property) - crucial for transition to work
        polyline.getBoundingClientRect();

        // Add the 'animate' class to trigger the transition defined in CSS
        polyline.classList.add('animate');
    }


    // --- setupSvgInteractions ---
    function setupSvgInteractions() {
        svgDoc = null; originalStyles.clear(); clearPath(); // Clear path on map load
        // ... (rest of the setup logic remains the same) ...

        clickableElements.forEach(element => {
            // ... (mouseenter/mouseleave listeners remain the same) ...

            // --- MODIFIED: Click listener ---
            element.addEventListener('click', function(event) {
                event.stopPropagation();
                const pathId = this.id; // This is the DESTINATION node ID
                if (!pathId) return;

                // --- Highlight selection (same as before) ---
                const previousSelected = svgDoc.querySelector('.selected-element');
                if(previousSelected) { previousSelected.classList.remove('selected-element'); resetElementStyles(previousSelected); }
                this.classList.add('selected-element');
                if (!originalStyles.has(pathId)) { originalStyles.set(pathId, getElementStyles(this)); }
                this.style.fill = '#2ecc71'; this.style.stroke = '#27ae60'; this.style.strokeWidth = '1.5px'; this.style.opacity = '1';
                // --- End Highlight ---

                // --- Clear previous path and errors ---
                clearPath();
                // pathErrorDiv.textContent = ''; // Clear path specific errors if you had one

                // --- Fetch Details (same as before) ---
                showLoading(); // Show loading for details
                fetch("/get-details", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path_id: pathId, floor: currentFloor }), })
                .then(response => { if (!response.ok) { return response.json().then(err => { throw new Error(err.error || `HTTP error! Status: ${response.status}`); }).catch(() => { throw new Error(`HTTP error! Status: ${response.status}`); }); } return response.json(); })
                .then(data => {
                    if (data.error) {
                        showError(data.error); // Show detail error
                        this.classList.remove('selected-element'); resetElementStyles(this);
                    } else {
                        displayLabDetails(data); // Display details first

                        // --- NEW: Now fetch the path ---
                        console.log(`Requesting path from ${ENTRANCE_NODE_ID} to ${pathId} on floor ${currentFloor}`);
                        // Optionally show a path-specific loading indicator here

                        fetch("/find-path", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                start_node: ENTRANCE_NODE_ID, // Use fixed entrance
                                end_node: pathId,             // Use clicked room ID
                                floor: currentFloor
                            }),
                        })
                        .then(pathResponse => {
                            if (!pathResponse.ok) {
                                return pathResponse.json().then(err => { throw new Error(err.error || `Pathfinding HTTP error! Status: ${pathResponse.status}`); })
                                                   .catch(() => { throw new Error(`Pathfinding HTTP error! Status: ${pathResponse.status}`); });
                            }
                            return pathResponse.json();
                        })
                        .then(pathData => {
                            // Optionally hide path loading indicator
                            if (pathData.error) {
                                console.error("Pathfinding error:", pathData.error);
                                // Decide where to show path error (e.g., console or a dedicated div)
                                // pathErrorDiv.textContent = pathData.error;
                            } else if (pathData.path) {
                                console.log("Path received:", pathData.path);
                                animatePath(pathData.path); // Animate the received path
                            } else {
                                console.warn("Received path response without path or error.");
                            }
                        })
                        .catch(pathError => {
                            // Optionally hide path loading indicator
                            console.error('Error finding path:', pathError);
                            // pathErrorDiv.textContent = `Error finding path: ${pathError.message}`;
                        });
                        // --- End NEW path fetch ---
                    }
                })
                .catch(error => { // Catch for /get-details fetch
                    console.error('Error fetching details:', error);
                    showError(`Failed to load details for ${pathId}. ${error.message}`);
                    this.classList.remove('selected-element'); resetElementStyles(this);
                });
            }); // --- End Click Listener ---
        }); // End clickableElements.forEach

        // --- MODIFIED: SVG background click ---
        svgDoc.documentElement.addEventListener('click', function(event) {
            if (event.target === svgDoc.documentElement || !event.target.closest('[id]')) {
                const selected = svgDoc.querySelector('.selected-element');
                if (selected) { selected.classList.remove('selected-element'); resetElementStyles(selected); showPrompt(); }
                clearPath(); // Clear path on background click
            }
        });
        console.log("SVG interactions set up for:", currentMapFile);
    } // --- End setupSvgInteractions ---

    // --- switchMap ---
    function switchMap(floorKey, mapFile, floorName) {
        // ... (existing switchMap logic) ...
        clearPath(); // Clear path on floor change
        // ... (rest of switchMap) ...
    }

    // --- Search Logic (remains the same) ---
    // ...

    // --- REMOVED Pathfinding Button Listener (now triggered by room click) ---
    // if (findPathButton) { findPathButton.addEventListener(...) }

    // --- Initialization (remains the same) ---
    // ...

}); // End DOMContentLoaded

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
         html += `<div class="detail-item"><span class="detail-label">Location:</span> ${data.location || 'N/A'}</div>`;
         // Add Description details
         html += `<div class="detail-item"><span class="detail-label">Description:</span> ${data.description || 'No description available.'}</div>`;
         // Add Capacity details
         html += `<div class="detail-item"><span class="detail-label">Capacity:</span> ${data.capacity || 'N/A'} ${typeof data.capacity === 'number' ? 'people' : ''}</div>`;

         // --- ADD IMAGE HERE (Moved after Capacity) ---
         if (data.image_url) {
             html += `<img src="${data.image_url}" alt="Image of ${data.name || `Room ${data.path_id}`}" class="room-image">`;
         }
         // --- End Image ---

         // Add Equipment details (now comes after the image)
         if (data.equipment && data.equipment.length > 0 && data.equipment[0] !== '') {
             html += `<div class="detail-item"><span class="detail-label">Equipment:</span><ul class="equipment-list">${data.equipment.map(item => `<li class="equipment-item">${item}</li>`).join('')}</ul></div>`;
         } else {
             html += `<div class="detail-item"><span class="detail-label">Equipment:</span> None listed</div>`;
         }

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
