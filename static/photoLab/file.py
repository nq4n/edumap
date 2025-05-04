import os

def remove_word_from_files(folder_path, word_to_remove="office"):
    # Check if the folder exists
    if not os.path.exists(folder_path):
        print(f"The folder '{folder_path}' does not exist.")
        return
    
    # List all files in the directory
    for filename in os.listdir(folder_path):
        file_path = os.path.join(folder_path, filename)
        
        # Skip directories, only process files
        if os.path.isfile(file_path):
            # Check if the word to remove exists in the filename
            if word_to_remove.lower() in filename.lower():
                # Create the new filename by removing the word
                new_filename = filename.lower().replace(word_to_remove.lower(), "")
                new_file_path = os.path.join(folder_path, new_filename)
                
                # Rename the file
                os.rename(file_path, new_file_path)
                print(f"Renamed: {filename} -> {new_filename}")

# Example usage
folder_path = r'C:\Users\مؤيد\Desktop\app_svg\edumap\static\photoLab'  # Replace with the folder path you want
remove_word_from_files(folder_path, "lab")
