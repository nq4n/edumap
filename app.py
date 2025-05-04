# -*- coding: utf-8 -*-
from flask import Flask, render_template, jsonify, request, send_from_directory, url_for # Add url_fo
import os
import pandas as pd
from functools import lru_cache
import numpy as np
# --- Add HEIC support imports ---
from PIL import Image
import pillow_heif
# --------------------------------

app = Flask(__name__)

static_folder_path = os.path.join(os.path.dirname(__file__), 'static')
print(f"[*] Static folder path: {static_folder_path}")

# --- REMOVED: No longer a single central Excel file config ---
# app.config['EXCEL_FILE'] = os.path.join(static_folder_path, 'data.xlsx')
app.config['ALLOWED_EXTENSIONS'] = {'svg'}
ROOM_IMAGES_FOLDER = 'photoLab'

MAP_CONFIG = {
    'ground': {'file': 'EduBuild/ground.svg', 'name': 'Ground Floor'},
    'first': {'file': 'EduBuild/first.svg', 'name': 'First Floor'}
}
DEFAULT_FLOOR = 'ground'

# --- MODIFIED: load_excel_data now takes floor_key ---
# Cache results based on the floor_key argument
@lru_cache(maxsize=None) # Unbounded cache, suitable for a few floors
def load_excel_data(floor_key):
    """Loads and cleans data from an Excel file specific to the given floor."""
    # --- Define naming convention for floor-specific files ---
    excel_filename = f"databse/{floor_key}.xlsx"
    full_excel_path = os.path.join(static_folder_path, excel_filename)
    print(f"[*] Attempting to load Excel data for floor '{floor_key}' from: {full_excel_path}")

    try:
        df = pd.read_excel(full_excel_path)
        df.columns = df.columns.str.strip().str.lower()

        # --- REMOVED: Floor column processing is no longer needed within this function ---
        # if 'floor' not in df.columns: ...
        # else: ...

        # Ensure 'room no.' is string and stripped (still crucial)
        if 'room no.' in df.columns:
            df['room no.'] = df['room no.'].astype(str).str.strip()
        else:
            print(f"WARNING: 'room no.' column not found in {excel_filename}.")
            # Return minimal structure if core columns missing
            return pd.DataFrame(columns=['room no.', 'description', 'room type', 'location', 'capacity', 'equipment']) # Add all expected cols

        # Clean other relevant columns (same as before)
        for col in ['description', 'room type', 'location', 'capacity', 'equipment']:
             if col in df.columns:
                 df[col] = df[col].fillna('').astype(str).str.strip()
             else:
                 print(f"Warning: '{col}' column not found in {excel_filename}.")
                 df[col] = '' # Add empty column if missing

        print(f"[*] Successfully loaded and processed data for floor '{floor_key}'.")
        return df
    except FileNotFoundError:
        print(f"ERROR: Excel file not found for floor '{floor_key}' at {full_excel_path}")
        # Return empty DataFrame with expected columns to prevent errors downstream
        return pd.DataFrame(columns=['room no.', 'description', 'room type', 'location', 'capacity', 'equipment'])
    except Exception as e:
        print(f"Error loading Excel data for floor '{floor_key}' from {excel_filename}: {e}")
        return pd.DataFrame(columns=['room no.', 'description', 'room type', 'location', 'capacity', 'equipment'])


@app.route("/")
def index():
    # Check if the DEFAULT map file exists
    default_map_file = MAP_CONFIG.get(DEFAULT_FLOOR, {}).get('file')
    svg_exists = False
    full_path_to_check = None
    if default_map_file:
        full_path_to_check = os.path.join(static_folder_path, default_map_file)
        svg_exists = os.path.exists(full_path_to_check)
        # (Keep existing print statements for debugging file checks)
        if not svg_exists: print(f"[*] Warning: Default map file check failed for path: {full_path_to_check}")
        else: print(f"[*] Default map file check successful for path: {full_path_to_check}")

    # No need to load excel data here for initial page load
    return render_template("index.html",
                           svg_exists=svg_exists,
                           map_config=MAP_CONFIG,
                           default_floor=DEFAULT_FLOOR)

@app.route("/about")
def about_page():
    return render_template("about.html")

@app.route("/get-details", methods=["POST"])
def get_details():
    path_id = request.json.get("path_id")
    floor = request.json.get("floor", DEFAULT_FLOOR).lower()

    if not path_id: return jsonify({"error": "Missing path_id"}), 400

    # --- ADDED: Check for specifically disabled paths ---
    disabled_paths = ['path32', 'path251', 'g2', 'g164'] # Added g2 and g164
    if path_id in disabled_paths:
        print(f"[*] Request for disabled path '{path_id}'. Returning 'Not Available'.")
        return jsonify({"name": f"Area {path_id}", "description": "This area is not interactive.", "location": "N/A", "capacity": "N/A", "equipment": [], "path_id": path_id, "floor": floor.capitalize(), "image_urls": []}), 200 # Return 200 OK, but with specific message
    # --- END ADDED ---


    df = load_excel_data(floor)
    # --- Find ALL images for the room ---
    image_urls = find_room_image_urls(path_id) # Check for images (plural)

    if df.empty:
         print(f"Warning: No data loaded for floor '{floor}' when getting details for {path_id}.")
         # --- MODIFY THIS return statement ---
         return jsonify({
             "name": f"Room {path_id}",
             "description": f"Details unavailable (Data source issue for {floor.capitalize()} floor)",
             "location": "N/A", "capacity": "N/A", "equipment": [], "path_id": path_id,
             "floor": floor.capitalize(),
             "image_urls": image_urls # Use plural here
             })

    matching_row = df[df['room no.'] == str(path_id)]

    if not matching_row.empty:
        row_data = matching_row.iloc[0]
        # ... (keep existing code to get description, room_type, etc.) ...
        description = row_data.get('description', 'No description available')
        room_type = row_data.get('room type', 'N/A')
        location = row_data.get('location', f'Room {path_id}')
        capacity = row_data.get('capacity', 'N/A')
        equipment_str = row_data.get('equipment', '')
        equipment_list = [item.strip() for item in equipment_str.split(',') if item.strip()] if equipment_str else []

        # --- MODIFY the detail dictionary ---
        detail = {
            "name": f"Room {path_id} ({room_type})" if room_type and room_type != 'N/A' else f"Room {path_id}",
            "location": location, "description": description, "type": room_type,
            "capacity": capacity, "equipment": equipment_list, "path_id": path_id,
            "floor": floor.capitalize(), # Add image_urls here
            "image_urls": image_urls
        }
    else:
        # --- MODIFY the detail dictionary in the else block ---
        detail = {
            "name": f"Room {path_id}",
            "description": f"Details not found for this room ID on the {floor.capitalize()} floor.",
            "location": "N/A", "capacity": "N/A", "equipment": [], "path_id": path_id,
            "floor": floor.capitalize(),
            "image_urls": image_urls # Use plural here too
        }
    return jsonify(detail)

# --- Register HEIF opener with Pillow ---
pillow_heif.register_heif_opener()
# --------------------------------------

def find_room_image_urls(path_id):
    """
    Finds all images matching the pattern 'path_id_*.ext' or 'path_id.ext',
    converts HEIC if necessary, and returns a list of static URLs for web-friendly formats.
    """
    image_urls = []
    image_dir = os.path.join(static_folder_path, ROOM_IMAGES_FOLDER)
    if not os.path.isdir(image_dir):
        print(f"Warning: Image directory not found: {image_dir}")
        return []

    web_extensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp']
    heic_extensions = ['.heic', '.heif']

    # Use os.listdir to find all files and filter by prefix
    for filename in os.listdir(image_dir):
        # --- MODIFIED: Check if path_id is simply contained within the filename ---
        # Note: This is broader and might match unintended files if IDs are short (e.g., path_id '10' matching 'Lab_101.jpg').
        # The previous startswith check was safer against this. Adjust if needed.
        if str(path_id) in filename:
            base, ext = os.path.splitext(filename)
            ext = ext.lower()
            full_path = os.path.join(image_dir, filename)
            relative_path_for_url = os.path.join(ROOM_IMAGES_FOLDER, filename).replace("\\", "/")

            # If it's already a web format, return its URL directly
            if ext in web_extensions:
                try:
                    image_url = url_for('serve_static', filename=relative_path_for_url, _external=False)
                    if image_url not in image_urls: # Avoid duplicates if somehow generated
                        image_urls.append(image_url)
                        print(f"[*] Found web image for {path_id}: {relative_path_for_url} -> {image_url}")
                except Exception as e:
                    print(f"Error generating URL for {relative_path_for_url}: {e}")
                    continue # Try next file

            # If it's HEIC/HEIF, attempt conversion
            elif ext in heic_extensions:
                # Keep original base name (e.g., 101_view1) for converted file
                converted_filename = f"{base}.jpg"
                converted_full_path = os.path.join(image_dir, converted_filename)
                converted_relative_path = os.path.join(ROOM_IMAGES_FOLDER, converted_filename).replace("\\", "/")

                # Check if converted file already exists
                if os.path.exists(converted_full_path):
                    print(f"[*] Found pre-converted image for {path_id}: {converted_relative_path}")
                    converted_url = url_for('serve_static', filename=converted_relative_path, _external=False)
                    if converted_url not in image_urls:
                        image_urls.append(converted_url)
                    continue # Move to next file

                # Convert if it doesn't exist
                try:
                    print(f"[*] Found HEIC image for {path_id}: {relative_path_for_url}. Attempting conversion...")
                    img = Image.open(full_path)
                    # Ensure image is in RGB mode before saving as JPEG
                    if img.mode in ("RGBA", "P"): img = img.convert("RGB")
                    img.save(converted_full_path, format="JPEG", quality=85) # Save as JPEG
                    print(f"[*] Successfully converted and saved: {converted_relative_path}")
                    return url_for('serve_static', filename=converted_relative_path, _external=False)
                except Exception as e:
                    print(f"ERROR: Failed to convert HEIC file {filename}: {e}")
                    continue # Skip this file if conversion fails

    if not image_urls:
        print(f"[*] No images found for {path_id} in {image_dir}")

    return image_urls # Return the list (might be empty)


@app.route("/search")
def search():
    query = request.args.get("q", "").strip().lower()
    # Get the requested floor key
    floor = request.args.get("floor", DEFAULT_FLOOR).lower()

    if not query: return jsonify([])

    # --- MODIFIED: Load data specifically for the requested floor ---
    df = load_excel_data(floor)

    # Check if data loading failed
    if df.empty:
        print(f"Warning: No data loaded for floor '{floor}' during search for '{query}'.")
        return jsonify([]) # No data to search

    # --- REMOVED: No need to filter by floor again ---
    # df_filtered_by_floor = df[df['floor'] == floor]

    # --- MODIFIED: Search directly on the floor-specific DataFrame 'df' ---
    searchable_columns = [col for col in ['room no.', 'description', 'room type'] if col in df.columns]
    if not searchable_columns:
        print(f"Warning: No searchable columns found in data for floor '{floor}'.")
        return jsonify([])

    # Build filter mask on the floor-specific DataFrame 'df'
    mask = pd.Series([False] * len(df))
    for col in searchable_columns:
        # Ensure we handle potential NaN in columns being searched
        mask |= df[col].fillna('').astype(str).str.lower().str.contains(query, na=False)

    results = df[mask]

    # Define output columns (check they exist in the results)
    output_columns = [col for col in ['room no.', 'description', 'room type'] if col in results.columns]
    if not output_columns:
         return jsonify([])

    search_results = results[output_columns].to_dict('records')
    max_results = 20
    return jsonify(search_results[:max_results])

@app.route("/find-path", methods=["POST"])
def find_path():
    start_node = request.json.get("start_node")
    end_node = request.json.get("end_node")
    floor = request.json.get("floor", DEFAULT_FLOOR).lower()

    if not start_node or not end_node:
        return jsonify({"error": "Missing start or end node"}), 400

    print(f"[*] Path request: Floor='{floor}', Start='{start_node}', End='{end_node}'")

    # --- Temporary Response (REMOVE LATER & IMPLEMENT REAL PATHFINDING) ---
    print("[!] Pathfinding logic not implemented. Returning dummy path.")
    # Adjust these dummy coordinates to roughly match your SVG layout for testing
    if floor == 'ground':
        # Example dummy path for ground floor
        dummy_path_coords = [(50, 400), (150, 400), (150, 300), (250, 300), (250, 250)]
    elif floor == 'first':
         # Example dummy path for first floor
        dummy_path_coords = [(50, 50), (150, 50), (150, 150), (300, 150)]
    else:
        dummy_path_coords = [] # No path for unknown floors

    # Simulate finding the end node if it's the same as start (edge case)
    if start_node == end_node:
         # Find coordinates for the single node (requires graph data later)
         # For dummy, just return a tiny segment or the first point twice
         if dummy_path_coords:
             dummy_path_coords = [dummy_path_coords[0], dummy_path_coords[0]] # Stay in place
         else:
             dummy_path_coords = []


    if not dummy_path_coords:
         return jsonify({"error": f"Could not generate dummy path for floor {floor}."}), 404

    return jsonify({"path": dummy_path_coords})
    # --- End Temporary Response ---


# Static file serving and error handlers remain the same
@app.route('/static/<path:filename>')
def serve_static(filename):
    if '..' in filename or filename.startswith('/'):
        print(f"[!] Attempted directory traversal: {filename}")
        return "Invalid filename", 400
    print(f"[*] Attempting to serve static file: {filename}")
    try:
        return send_from_directory(static_folder_path, filename)
    except FileNotFoundError:
        print(f"[!] Static file not found: {os.path.join(static_folder_path, filename)}")
        return "File not found", 404

@app.errorhandler(404)
def page_not_found(e):
    app.logger.warning(f"404 Not Found: {request.path}")
    if request.accept_mimetypes.accept_json and not request.accept_mimetypes.accept_html:
        return jsonify(error="Not Found"), 404
    return render_template('404.html'), 404

@app.errorhandler(500)
def internal_server_error(e):
    app.logger.error(f"Server Error: {e}", exc_info=True)
    if request.accept_mimetypes.accept_json and not request.accept_mimetypes.accept_html:
        return jsonify(error="Internal Server Error"), 500
    return render_template('500.html'), 500

if __name__ == "__main__":
    os.makedirs(static_folder_path, exist_ok=True)

    # --- MODIFIED: Check for default floor's Excel file ---
    default_excel_file = f"data_{DEFAULT_FLOOR}.xlsx"
    full_excel_path = os.path.join(static_folder_path, default_excel_file)
    if not os.path.exists(full_excel_path):
         print(f"CRITICAL WARNING: Default floor Excel file '{default_excel_file}' not found at {full_excel_path}")
    else:
         print(f"[*] Default floor Excel file '{default_excel_file}' confirmed exists at {full_excel_path}")

    # Check default map file existence (same as before)
    default_map_file = MAP_CONFIG.get(DEFAULT_FLOOR, {}).get('file')
    if default_map_file:
         full_path_to_check = os.path.join(static_folder_path, default_map_file)
         if not os.path.exists(full_path_to_check):
              print(f"CRITICAL WARNING: Default map file '{default_map_file}' not found in {static_folder_path} (Path checked: {full_path_to_check})")
         else:
              print(f"[*] Default map file '{default_map_file}' confirmed exists at {full_path_to_check}")
    else:
         print("CRITICAL WARNING: Default map file not configured in MAP_CONFIG.")

    app.run(debug=True)
