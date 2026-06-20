import sys
from PyQt6.QtWidgets import QApplication, QWidget, QGridLayout, QLabel
app = QApplication(sys.argv)
w = QWidget()
l = QGridLayout()
l.addWidget(QLabel("Test"), 0, 0)
w.setLayout(l)
print("Success!")
