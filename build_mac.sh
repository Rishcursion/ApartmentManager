#!/bin/bash
echo "Installing requirements..."
pip install -r requirements.txt
pip install pyinstaller

echo "Building Mac Application..."
pyinstaller --noconfirm --onedir --windowed --name "ApartmentManager" app.py

echo "Done! The application is in the 'dist/ApartmentManager.app' folder."
