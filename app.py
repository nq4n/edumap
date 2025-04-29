# -*- coding: utf-8 -*-
from flask import Flask, render_template, jsonify, request, send_from_directory, url_for
import os
import pandas as pd
from functools import lru_cache

app = Flask(__name__)

static_folder_path = os.path.join(os.path.dirname(__file__), 'static')
print(f"[*] Static folder path: {static_folder_path}")

app.config['ALLOWED_EXTENSIONS'] = {'svg'}
ROOM_IMAGES_FOLDER = 'photoLab'
EXCEL_FILE_NAME = 'data.xlsx'

MAP_CONFIG = {
    'ground': {'file': 'EduBuild/ground.svg', 'name': 'Ground Floor'},
    'first': {'file': 'EduBuild/first.svg', 'name': 'First Floor'}
}
DEFAULT_FLOOR = 'ground'

@lru_cache(maxsize=None)
def load_excel_data():
    """Loads and cleans data from the single Excel file."""
    full_excel_path = os.path.join(static_folder_path, EXCEL_FILE_NAME)
    print(f"[*] Loading Excel data from: {full_excel_path}")

    try:
        df = pd.read_excel(full_excel_path)
        df.columns = df.columns.str.strip().str.lower()

        if 'room no.' in df.columns:
            df['room no.'] = df['room no.'].astype(str).str.strip()
        else:
            print(f"[!] WARNING: 'room no.' column not found.")
            return pd.DataFrame(columns=['room no.', 'description', 'room type', 'location', 'capacity', 'equipment'])

        for col in ['description', 'room type', 'location', 'capacity', 'equipment']:
            if col in df.columns:
                df[col] = df[col].fillna('').astype(str).str.strip()
            else:
                print(f"[!] WARNING: '{col}' column not found. Creating empty column.")
                df[col] = ''

        print(f"[*] Successfully loaded Excel data.")
        return df

    except FileNotFoundError:
        print(f"[!] ERROR: Excel file not found at {full_excel_path}")
        return pd.DataFrame(columns=['room no.', 'description', 'room type', 'location', 'capacity', 'equipment'])
    except Exception as e:
        print(f"[!] ERROR: Problem loading Excel file: {e}")
        return pd.DataFrame(columns=['room no.', 'description', 'room type', 'location', 'capacity', 'equipment'])


@app.route("/")
def index():
    default_map_file = MAP_CONFIG.get(DEFAULT_FLOOR, {}).get('file')
    svg_exists = os.path.exists(os.path.join(static_folder_path, default_map_file)) if default_map_file else False
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

    if not path_id:
        return jsonify({"error": "Missing path_id"}), 400

    df = load_excel_data()
    image_url = find_room_image_url(path_id)

    if df.empty:
        return jsonify({
            "name": f"Room {path_id}",
            "description": "Data not available.",
            "location": "N/A", "capacity": "N/A", "equipment": [],
            "path_id": path_id, "floor": DEFAULT_FLOOR.capitalize(), "image_url": image_url
        })

    matching_row = df[df['room no.'] == str(path_id)]

    if not matching_row.empty:
        row_data = matching_row.iloc[0]
        description = row_data.get('description', 'No description available')
        room_type = row_data.get('room type', 'N/A')
        location = row_data.get('location', f'Room {path_id}')
        capacity = row_data.get('capacity', 'N/A')
        equipment_str = row_data.get('equipment', '')
        equipment_list = [item.strip() for item in equipment_str.split(',') if item.strip()]

        detail = {
            "name": f"Room {path_id} ({room_type})" if room_type and room_type != 'N/A' else f"Room {path_id}",
            "description": description,
            "location": location,
            "capacity": capacity,
            "equipment": equipment_list,
            "path_id": path_id,
            "floor": DEFAULT_FLOOR.capitalize(),
            "image_url": image_url
        }
    else:
        detail = {
            "name": f"Room {path_id}",
            "description": "No matching room found.",
            "location": "N/A",
            "capacity": "N/A",
            "equipment": [],
            "path_id": path_id,
            "floor": DEFAULT_FLOOR.capitalize(),
            "image_url": image_url
        }
    return jsonify(detail)

def find_room_image_url(path_id):
    """Find image for room."""
    possible_extensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp']
    for ext in possible_extensions:
        filename = f"{path_id}{ext}"
        relative_path = os.path.join(ROOM_IMAGES_FOLDER, filename).replace("\\", "/")
        full_path = os.path.join(static_folder_path, ROOM_IMAGES_FOLDER, filename)

        if os.path.exists(full_path):
            try:
                return url_for('serve_static', filename=relative_path, _external=False)
            except Exception as e:
                print(f"[!] Error generating URL for {relative_path}: {e}")
                return None
    print(f"[*] No image found for {path_id}.")
    return None

@app.route("/search")
def search():
    query = request.args.get("q", "").strip().lower()

    if not query:
        return jsonify([])

    df = load_excel_data()

    if df.empty:
        return jsonify([])

    searchable_columns = [col for col in ['room no.', 'description', 'room type'] if col in df.columns]
    if not searchable_columns:
        return jsonify([])

    mask = pd.Series([False] * len(df))
    for col in searchable_columns:
        mask |= df[col].fillna('').astype(str).str.lower().str.contains(query, na=False)

    results = df[mask]

    output_columns = [col for col in ['room no.', 'description', 'room type'] if col in results.columns]
    search_results = results[output_columns].to_dict('records')
    return jsonify(search_results[:20])

@app.route("/find-path", methods=["POST"])
def find_path():
    start_node = request.json.get("start_node")
    end_node = request.json.get("end_node")

    if not start_node or not end_node:
        return jsonify({"error": "Missing start or end node"}), 400

    print(f"[*] Pathfinding (dummy) from {start_node} to {end_node}")

    # Dummy path points
    dummy_path_coords = [(50, 400), (150, 400), (150, 300), (250, 300), (250, 250)]
    if start_node == end_node:
        dummy_path_coords = [dummy_path_coords[0], dummy_path_coords[0]]

    return jsonify({"path": dummy_path_coords})

@app.route('/static/<path:filename>')
def serve_static(filename):
    if '..' in filename or filename.startswith('/'):
        return "Invalid filename", 400
    return send_from_directory(static_folder_path, filename)

@app.errorhandler(404)
def page_not_found(e):
    return render_template('404.html'), 404

@app.errorhandler(500)
def internal_server_error(e):
    return render_template('500.html'), 500

if __name__ == "__main__":
    os.makedirs(static_folder_path, exist_ok=True)

    excel_full_path = os.path.join(static_folder_path, EXCEL_FILE_NAME)
    if not os.path.exists(excel_full_path):
        print(f"[!] WARNING: '{EXCEL_FILE_NAME}' not found at {excel_full_path}")
    else:
        print(f"[*] Excel file '{EXCEL_FILE_NAME}' confirmed at {excel_full_path}")

    app.run(debug=False)
