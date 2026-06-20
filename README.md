# Apartment Manager Build Instructions

To compile this application into a Windows executable (`.exe`), copy this folder to a Windows machine and follow these steps:

1. Install Python from [python.org](https://www.python.org/downloads/) (make sure to check "Add Python to PATH" during installation).
2. Open a Command Prompt (`cmd`) or PowerShell and navigate to this folder.
3. Install the dependencies by running:
   ```cmd
   pip install -r requirements.txt
   ```
4. Run PyInstaller to build the executable:
   ```cmd
   pyinstaller --noconsole --onefile app.py
   ```
5. Once the build is complete, you will find `app.exe` in the newly created `dist/` folder.
6. Run `app.exe`! The SQLite database will be created automatically in the same folder as the executable when you first run it.
