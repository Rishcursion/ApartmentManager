@echo off
echo Installing requirements...
pip install -r requirements.txt
pip install pyinstaller

echo Building Windows Executable...
pyinstaller --noconfirm --onedir --windowed --name "ApartmentManager" app.py

echo Done! The executable is in the "dist\ApartmentManager" folder.
pause
