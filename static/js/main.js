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

    // --- NEW: Constants and variables for routing ---
    const BUILDING_SVG_ID = 'building'; // As requested
    const DEFAULT_ROOM_FOR_PATH = '1075'; // As requested
    const TARGET_ELEMENT_FOR_PATH = 'path310'; // NEW: Specific target element for the path
    let currentRouteLine = null; // To keep track of the drawn line

    // ENTRANCE_COORDINATES is no longer needed as we target an element.

    // --- Use variables passed from index.html ---
    // These are expected to be globally defined in index.html before this script runs.
    // e.g., <script> var initialDefaultFloor = 'GF'; var initialMapFile = 'maps/gf.svg'; </script>
    let currentFloor = typeof initialDefaultFloor !== 'undefined' ? initialDefaultFloor : null;
    let currentMapFile = typeof initialMapFile !== 'undefined' ? initialMapFile : null;


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
    function showNonInteractiveMessage() { infoContent.innerHTML = '<p class="prompt">Please click on a valid room or area, not structural elements.</p>'; } // New function for the message
    function clearSearchResults() { searchResultsContainer.innerHTML = ''; searchResultsContainer.style.display = 'none'; }
    function getElementStyles(element) { if (!svgDoc || !svgDoc.defaultView) return {}; const computedStyle = svgDoc.defaultView.getComputedStyle(element, null); return { fill: element.style.fill || computedStyle.getPropertyValue('fill'), stroke: element.style.stroke || computedStyle.getPropertyValue('stroke'), strokeWidth: element.style.strokeWidth || computedStyle.getPropertyValue('stroke-width'), opacity: element.style.opacity || computedStyle.getPropertyValue('opacity') }; }
    function resetElementStyles(element) { const styles = originalStyles.get(element.id); if (styles) { element.style.fill = styles.fill; element.style.stroke = styles.stroke; element.style.strokeWidth = styles.strokeWidth; element.style.opacity = styles.opacity; } else { element.style.fill = ''; element.style.stroke = ''; element.style.strokeWidth = ''; element.style.opacity = ''; } }

    // --- NEW: Helper to get or create <defs> element in SVG ---
    function getOrCreateDefs(svgDocument) {
        if (!svgDocument) return null;
        let defs = svgDocument.querySelector('defs');
        if (!defs) {
            defs = svgDocument.createElementNS('http://www.w3.org/2000/svg', 'defs');
            const svgRoot = svgDocument.documentElement;
            if (svgRoot) {
                 svgRoot.insertBefore(defs, svgRoot.firstChild); // Insert defs as the first child
            } else {
                console.error("SVG root element not found, cannot add defs.");
                return null;
            }
        }
        return defs;
    }

    // --- NEW: Helper to ensure an arrowhead marker is defined in the SVG ---
    function ensureArrowheadMarker(svgDocument, color = 'green') {
        if (!svgDocument) return null;
        const markerId = 'route-arrowhead';
        if (svgDocument.getElementById(markerId)) return markerId; // Already exists

        const defs = getOrCreateDefs(svgDocument);
        if (!defs) return null;

        const marker = svgDocument.createElementNS('http://www.w3.org/2000/svg', 'marker');
        marker.setAttribute('id', markerId);
        marker.setAttribute('markerWidth', '10');
        marker.setAttribute('markerHeight', '7');
        marker.setAttribute('refX', '8'); // Position so the tip of arrow is at the line end
        marker.setAttribute('refY', '3.5');
        marker.setAttribute('orient', 'auto-start-reverse'); // Arrow points towards the start of the line segment it's attached to

        const polygon = svgDocument.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        polygon.setAttribute('points', '0 0, 10 3.5, 0 7'); // Triangle shape
        polygon.setAttribute('fill', color);

        marker.appendChild(polygon);
        defs.appendChild(marker);
        return markerId;
    }

    // --- NEW: Function to clear any existing route path ---
    function clearRoutePath() {
        if (svgDoc && currentRouteLine) {
            if (currentRouteLine.parentNode) {
                currentRouteLine.parentNode.removeChild(currentRouteLine);
            }
            currentRouteLine = null;
            // console.log("Route path cleared."); // Optional: for debugging
        }
    }

    // --- MODIFIED: Function to draw a path between two SVG elements ---
    function drawRoutePath(startElementId, endElementId) {
        if (!svgDoc) {
            console.warn("SVG document not ready, cannot draw path.");
            return;
        }
        clearRoutePath(); // Clear any previous path first

        const startElement = svgDoc.getElementById(startElementId);
        const endElement = svgDoc.getElementById(endElementId);
        // const buildingElement = svgDoc.getElementById(BUILDING_SVG_ID); // For future path constraints

        if (!startElement) {
            console.warn(`Start element with ID '${startElementId}' not found. Cannot draw path.`);
            return;
        }
        if (!endElement) {
            console.warn(`End element with ID '${endElementId}' not found. Cannot draw path.`);
            return;
        }

        // Get center of the start element using getBBox()
        const startBBox = startElement.getBBox();
        const startCenterX = startBBox.x + startBBox.width / 2;
        const startCenterY = startBBox.y + startBBox.height / 2;

        // Get center of the end element using getBBox()
        const endBBox = endElement.getBBox();
        const endCenterX = endBBox.x + endBBox.width / 2;
        const endCenterY = endBBox.y + endBBox.height / 2;

        // Create the line element
        const line = svgDoc.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', startCenterX.toString());
        line.setAttribute('y1', startCenterY.toString());
        line.setAttribute('x2', endCenterX.toString()); // Target: End element X
        line.setAttribute('y2', endCenterY.toString()); // Target: End element Y

        const lineColor = '#FF007F'; // A distinct color like magenta or deep pink
        line.setAttribute('stroke', lineColor);
        line.setAttribute('stroke-width', '2.5'); // Make it reasonably thick
        line.setAttribute('stroke-linecap', 'round'); // Ensures line ends are not cut off abruptly

        // Add arrowhead pointing towards the end element
        const markerId = ensureArrowheadMarker(svgDoc, lineColor);
        if (markerId) {
            line.setAttribute('marker-end', `url(#${markerId})`); // Arrow at the endElement's end
        }

        currentRouteLine = line;
        if (svgDoc.documentElement) {
            svgDoc.documentElement.appendChild(currentRouteLine); // Append to the main SVG element
            console.log(`Drew route line from ${startElementId} (center: ${startCenterX.toFixed(1)},${startCenterY.toFixed(1)}) to ${endElementId} (center: ${endCenterX.toFixed(1)},${endCenterY.toFixed(1)}).`);
        } else {
            console.error("SVG root element not found, cannot append line.");
        }

        // TODO for future enhancements:
        // 1. Pathfinding: Implement an algorithm (e.g., A* based on a navmesh or grid from SVG paths)
        //    to find a route that:
        //    a. Stays within the 'buildingElement' boundaries.
        //    b. Avoids intersecting other room paths or obstacles.
        //    c. Connects to the nearest or most logical entrance if multiple exist.
    }
    // --- End MODIFIED drawRoutePath ---
    // --- NEW: Function to show image modal ---
    // --- MODIFIED: Function to show image slider modal ---
    function showImageModal(imageUrls, startIndex) {
        // Remove existing modal if any
        const existingModal = document.querySelector('.modal-overlay');
        if (existingModal) {
            existingModal.remove();
        }

        if (!imageUrls || imageUrls.length === 0) return; // Don't show if no images

        // Create modal elements
        const modalOverlay = document.createElement('div');
        modalOverlay.className = 'modal-overlay';

        const modalContent = document.createElement('div');
        // Add a specific class for slider styling
        modalContent.className = 'modal-content slider-modal-content';

        const modalClose = document.createElement('span');
        modalClose.className = 'modal-close';
        modalClose.innerHTML = '&times;'; // 'x' character

        // --- Slider Elements ---
        const sliderContainer = document.createElement('div');
        sliderContainer.className = 'slider-container';

        const imageDisplay = document.createElement('img');
        imageDisplay.className = 'slider-image-display';
        // src and alt will be set by updateSlider

        const prevButton = document.createElement('button');
        prevButton.className = 'slider-button slider-prev';
        prevButton.innerHTML = '&#10094;'; // Left arrow
        prevButton.setAttribute('aria-label', 'Previous image');

        const nextButton = document.createElement('button');
        nextButton.className = 'slider-button slider-next';
        nextButton.innerHTML = '&#10095;'; // Right arrow
        nextButton.setAttribute('aria-label', 'Next image');

        // --- Slider Logic ---
        let currentIndex = startIndex;

        function updateSlider() {
            if (currentIndex >= 0 && currentIndex < imageUrls.length) {
                imageDisplay.src = imageUrls[currentIndex];
                imageDisplay.alt = `Image ${currentIndex + 1} of ${imageUrls.length}`;
            }
            // Disable/enable buttons at ends
            prevButton.disabled = currentIndex <= 0;
            nextButton.disabled = currentIndex >= imageUrls.length - 1;
        }

        prevButton.addEventListener('click', () => {
            if (currentIndex > 0) { currentIndex--; updateSlider(); }
        });

        nextButton.addEventListener('click', () => {
            if (currentIndex < imageUrls.length - 1) { currentIndex++; updateSlider(); }
        });

        // Assemble slider
        sliderContainer.appendChild(prevButton);
        sliderContainer.appendChild(imageDisplay);
        sliderContainer.appendChild(nextButton);

        // Assemble modal
        modalContent.appendChild(modalClose);
        modalContent.appendChild(sliderContainer); // Add slider instead of single image
        modalOverlay.appendChild(modalContent);

        // Add to body
        document.body.appendChild(modalOverlay);

        // Initial image and button state setup
        updateSlider();

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
            // --- ADDED: Skip specific non-interactive paths ---
            const nonInteractiveIds = ['path32', 'path251', 'g2', 'g164']; // Keep this list defined here
            // --- END ADDED ---
            element.style.cursor = 'pointer'; //element.style.transition = 'fill 0.2s ease, stroke 0.2s ease, opacity 0.2s ease, stroke-width 0.2s ease';
            element.addEventListener('mouseenter', function() {if (!this.classList.contains('selected-element')) { if (this.id && !originalStyles.has(this.id)) { originalStyles.set(this.id, getElementStyles(this)); } /* this.style.opacity = '0.7'; */ }});
            element.addEventListener('mouseleave', function() {});
            element.addEventListener('click', function(event) {if (!this.classList.contains('selected-element')) { if (this.id && !originalStyles.has(this.id)) { originalStyles.set(this.id, getElementStyles(this)); } /* this.style.opacity = '0.7'; */ }

                event.stopPropagation(); 
                const pathId = this.id; 
                // --- ADDED: Double-check ID inside the handler ---
                if (!pathId) return; // Exit if no ID

                if (nonInteractiveIds.includes(pathId)) {
                    console.log(`Clicked non-interactive element: ${pathId}`);
                    showNonInteractiveMessage(); // Show the message
                    return; // Stop processing for these IDs
                }
                // --- END ADDED ---
                const previousSelected = svgDoc.querySelector('.selected-element'); if(previousSelected && previousSelected !== this) { previousSelected.classList.remove('selected-element'); resetElementStyles(previousSelected); } // Deselect previous only if different
                this.classList.add('selected-element'); if (!originalStyles.has(pathId)) { originalStyles.set(pathId, getElementStyles(this)); } // Store original style if needed
                this.style.fill = '#02c7ffff'; this.style.stroke = '#ffffffff'; this.style.strokeWidth = '1.5px'; this.style.opacity = '1';
                showLoading();
                fetch("/get-details", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path_id: pathId, floor: currentFloor }), })
                    .then(response => { if (!response.ok) { return response.json().then(err => { throw new Error(err.error || `HTTP error! Status: ${response.status}`); }).catch(() => { throw new Error(`HTTP error! Status: ${response.status}`); }); } return response.json(); })
                    .then(data => {
                        if (data.error) {
                            showError(data.error); this.classList.remove('selected-element'); resetElementStyles(this);
                            clearRoutePath(); // Clear path on error
                        } else {
                            displayLabDetails(data);
                            // --- MODIFIED: Call drawRoutePath or clear it ---
                            if (pathId === DEFAULT_ROOM_FOR_PATH) {
                                if (svgDoc && svgDoc.getElementById(TARGET_ELEMENT_FOR_PATH)) {
                                    drawRoutePath(DEFAULT_ROOM_FOR_PATH, TARGET_ELEMENT_FOR_PATH);
                                } else {
                                    console.warn(`Target element ${TARGET_ELEMENT_FOR_PATH} for routing not found on map ${currentMapFile}.`);
                                    clearRoutePath();
                                }
                            } else {
                                clearRoutePath(); // Clear path if a different room is selected
                            }
                        }
                    })
                    .catch(error => { console.error('Error fetching details:', error); showError(`Failed to load details for ${pathId}. ${error.message}`); this.classList.remove('selected-element'); resetElementStyles(this); clearRoutePath(); });
            });
        });
        svgDoc.documentElement.addEventListener('click', function(event) { if (event.target === svgDoc.documentElement || (event.target.correspondingUseElement === null && !event.target.closest('[id]'))) { const selected = svgDoc.querySelector('.selected-element'); if (selected) { selected.classList.remove('selected-element'); resetElementStyles(selected); showPrompt(); clearRoutePath(); } } });

        console.log("SVG interactions set up for:", currentMapFile);

        // --- NEW: Attempt to draw path to DEFAULT_ROOM_FOR_PATH if it exists on the current map ---
        if (svgDoc && svgDoc.getElementById(DEFAULT_ROOM_FOR_PATH)) {
            // This will draw the path when any map containing this room ID is loaded.
            // Ensure DEFAULT_ROOM_FOR_PATH and ENTRANCE_COORDINATES are correctly set for this behavior.
            console.log(`Map ${currentMapFile} loaded. Attempting to draw default route to room ${DEFAULT_ROOM_FOR_PATH}.`);
            drawPathToEntrance(DEFAULT_ROOM_FOR_PATH);
        } else if (svgDoc) {
            // If the default room is not on this map, ensure any pre-existing route line is cleared.
            // This is important if DEFAULT_ROOM_FOR_PATH was displayed on a previously viewed map.
            clearRoutePath();
            if (DEFAULT_ROOM_FOR_PATH) { // Only log if a default room is configured
                console.log(`Default room ${DEFAULT_ROOM_FOR_PATH} not found on map ${currentMapFile}. No default path drawn, existing path cleared.`);
            }
        }
        // --- END NEW ---
    }

    // --- Keep switchMap function (no changes needed here) ---
    function switchMap(floorKey, mapFile, floorName) {
        if (!mapFile) { console.error("No map file specified for floor:", floorKey); showError(`Map configuration missing for ${floorName}.`); return; }
        console.log(`Switching to floor: ${floorKey}, map: ${mapFile}`);
        currentFloor = floorKey; currentMapFile = mapFile;
        floorSelectorButtons.forEach(btn => { btn.classList.toggle('active', btn.dataset.floor === floorKey); });
        if (mapTitle) { mapTitle.textContent = `${floorName} Map`; }
        clearRoutePath(); // Clear path when switching maps
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
            const clickedImage = event.target;
            const gallery = clickedImage.closest('.room-image-gallery'); // Find the gallery container
            if (!gallery) return; // Exit if structure is wrong

            // Find all images within the same gallery
            const allImages = gallery.querySelectorAll('.clickable-room-image');
            const imageUrls = Array.from(allImages).map(img => img.src); // Create an array of URLs
            const clickedIndex = imageUrls.findIndex(url => url === clickedImage.src); // Find the index of the clicked image

            if (imageUrls.length > 0 && clickedIndex !== -1) {
                showImageModal(imageUrls, clickedIndex); // Call with the list and index
            }
        }
    });
    // --- Keep Initialization logic ---
    floorSelectorButtons.forEach(button => { button.addEventListener('click', function() { switchMap(this.dataset.floor, this.dataset.mapfile, this.textContent.trim()); }); });

    if (svgObject) {
         svgObject.addEventListener('load', setupSvgInteractions);
         svgObject.addEventListener('error', function() {
            console.error("Failed to load SVG file:", svgObject.data);
            // Use currentMapFile for error message as it reflects the intended file
            showError(`Failed to load map: ${currentMapFile || 'Unknown'}`);
        });

        // Determine and load the initial map
        let initialFloorKeyToLoad = currentFloor; // From global initialDefaultFloor
        let initialMapFileToLoad = currentMapFile; // From global initialMapFile
        let initialFloorName = '';

        if (initialFloorKeyToLoad && initialMapFileToLoad) {
            const initialButton = Array.from(floorSelectorButtons).find(btn => btn.dataset.floor === initialFloorKeyToLoad);
            if (initialButton) {
                initialFloorName = initialButton.textContent.trim();
            } else {
                console.warn(`Initial default floor button for key '${initialFloorKeyToLoad}' not found. Map title might be generic.`);
                initialFloorName = `Floor ${initialFloorKeyToLoad}`; // Fallback name
            }
        } else {
            // Fallback if initialDefaultFloor/initialMapFile are not provided from index.html
            console.warn("initialDefaultFloor or initialMapFile not provided from index.html. Falling back to the first button or one with 'active' class.");
            const fallbackButton = document.querySelector('.floor-selector.active') || floorSelectorButtons[0];
            if (fallbackButton) {
                initialFloorKeyToLoad = fallbackButton.dataset.floor;
                initialMapFileToLoad = fallbackButton.dataset.mapfile;
                initialFloorName = fallbackButton.textContent.trim();
            }
        }

        if (initialFloorKeyToLoad && initialMapFileToLoad) {
            // Update global currentFloor and currentMapFile if they were determined by fallback,
            // then call switchMap to load it and update UI.
            currentFloor = initialFloorKeyToLoad;
            currentMapFile = initialMapFileToLoad;
            switchMap(initialFloorKeyToLoad, initialMapFileToLoad, initialFloorName);
        } else {
            showError("Map configuration error: No initial floor/map could be determined.");
            if (mapTitle) mapTitle.textContent = "Map Error";
        }

         showPrompt();
         // The 'load' event on svgObject is the primary trigger for setupSvgInteractions.
         // The setTimeout for checking pre-loaded SVGs is generally not needed if 'data' attribute is set and 'load' event is handled.
    } else { console.error("SVG object element not found in HTML."); showError("Map display element is missing in the HTML structure."); }

}); // End DOMContentLoaded
